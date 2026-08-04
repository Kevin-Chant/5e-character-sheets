import { UUID } from "crypto";
import {
  addParticipant,
  claimDmSeat,
  Encounter,
  EMPTY_ENCOUNTER,
  reclaimDmSeat,
  setVitals,
} from "src/lib/play/encounter";
import {
  bumpRevision,
  receiveState,
  withoutClient,
} from "src/lib/play/session";
import {
  adoptsResponse,
  ConnectionState,
  connectionReducer,
  encounterForTable,
  OFFLINE,
  SessionIntent,
} from "src/lib/play/connection";
import { accept, stamp } from "src/lib/realm/envelope";
import {
  PresenceEntry,
  withoutPresence,
  withPresence,
} from "src/lib/realm/presence";

// Several browsers in one process.
//
// **Why this exists.** The session layer's real failures are all about what two
// clients converge on, and for a long time the only way to see them was two
// Playwright contexts against a live sidecar — slow, and (worse) intermittent,
// because the bugs were races. The revision race that discarded a joiner's room
// was pure logic and should never have needed a browser to find.
//
// So: a broker that is a map of topic to subscriber, delivering synchronously,
// and a client that runs the *real* pieces — the envelope (`accept`/`stamp`),
// the connection machine (`connectionReducer`), the entry rules
// (`encounterForTable`, seat claim/reclaim) and the merge (`receiveState`).
// This week's three bugs were all in the half the old simulator didn't model:
// joining, syncing, and which table a stored encounter belongs to. Now a
// connect is a first-class thing a test can do, and each of those bugs is a
// unit test. What this deliberately does **not** model is WAMP, the sidecar,
// realms, or React — those are what `pnpm session-smoke` is for.
//
// Two fidelity details that matter:
// - nightlife-rabbit does not honour WAMP's `exclude_me`, so a publisher
//   receives its own messages and filters them by clientId. The broker below
//   delivers to the sender too — the envelope's `accept` drops the echo, the
//   same code that drops it in the app.
// - The broker is synchronous, so "the sync window closed with no answer" has
//   a natural reading: if the machine is still `syncing` when `enter` returns,
//   every answer that will ever come has come, and the room was empty.

export type SimMessage =
  | { kind: "state"; clientId: string; v?: number; encounter: Encounter }
  | { kind: "syncRequest"; clientId: string; v?: number; requestId: string }
  | {
      kind: "syncResponse";
      clientId: string;
      v?: number;
      toClientId: string;
      requestId: string;
      encounter: Encounter;
    }
  | { kind: "leave"; clientId: string; v?: number }
  | { kind: "presence"; clientId: string; v?: number; name: string };

const KINDS = [
  "state",
  "syncRequest",
  "syncResponse",
  "leave",
  "presence",
] as const;

export class Broker {
  private clients: SimClient[] = [];
  // Every message that crossed the wire, for asserting on chattiness — an
  // endless echo between two peers is a real failure mode here and it looks
  // like success unless you count.
  readonly traffic: SimMessage[] = [];
  private held: SimMessage[] | undefined;
  // The session code this broker is a table for — what the provider's
  // `ENCOUNTER_SESSION_STORAGE_KEY` pairing is checked against.
  readonly code: string;

  constructor(code = "aaaaaaaa-0000-0000-0000-000000000001") {
    this.code = code;
  }

  // Two writes that cross on the wire. Anything published inside `run` is held
  // and delivered afterwards, which is the only way to model "both of them
  // typed before either had heard the other" — the broker is otherwise
  // synchronous, so every write here would arrive politely in turn and the
  // races that actually bite a table would be untestable.
  crossing(run: () => void) {
    this.held = [];
    try {
      run();
    } finally {
      const queued = this.held;
      this.held = undefined;
      for (const message of queued) this.publish(message);
    }
  }

  join(client: SimClient) {
    this.clients.push(client);
    client.broker = this;
  }

  part(client: SimClient) {
    this.clients = this.clients.filter((c) => c !== client);
  }

  publish(message: SimMessage) {
    if (this.held) {
      this.held.push(message);
      return;
    }
    this.traffic.push(message);
    // A copy per recipient: a shared object reference would let one client's
    // merge mutate another's view and make every test optimistic.
    for (const client of this.clients) {
      client.receive(JSON.parse(JSON.stringify(message)) as SimMessage);
    }
  }
}

interface SimClientOptions {
  clientId: string;
  characterUuid?: UUID;
  name?: string;
  dmToken?: string;
  // Where this client's encounter starts. Defaults to empty, which is the
  // realistic case — every browser has been keeping its own local one.
  encounter?: Encounter;
  // Which table the stored encounter came from, if any — the persisted
  // pairing key a reload reads back.
  belongsTo?: string;
}

export class SimClient {
  broker?: Broker;
  encounter: Encounter;
  // Where this client is in the business of being in a session — the real
  // machine, driven exactly as the provider drives it.
  connection: ConnectionState = OFFLINE;
  // Which table `encounter` belongs to (`ENCOUNTER_SESSION_STORAGE_KEY`).
  belongsTo?: string;
  // Who this client believes is at the table, by the real presence functions.
  roster: PresenceEntry<{ name: string }>[] = [];
  readonly clientId: string;
  readonly characterUuid?: UUID;
  readonly name: string;
  dmToken?: string;
  // The character sheet's own HP, standing in for `character.currHp`. The
  // participant is only a projection of this — which is exactly what makes a DM
  // editing someone's HP subtle: the edit has to land *here*, or the sheet's
  // next change publishes the old number right back.
  characterHp = 10;
  private requestCounter = 0;

  constructor(options: SimClientOptions) {
    this.clientId = options.clientId;
    this.characterUuid = options.characterUuid;
    this.name = options.name ?? options.clientId;
    this.dmToken = options.dmToken;
    this.encounter = options.encounter ?? EMPTY_ENCOUNTER;
    this.belongsTo = options.belongsTo;
  }

  get isDm(): boolean {
    return this.encounter.dmClientId === this.clientId;
  }

  get phase(): ConnectionState["phase"] {
    return this.connection.phase;
  }

  get participantNames(): string[] {
    return this.encounter.participants.map((p) => p.name).sort();
  }

  get rosterNames(): string[] {
    return this.roster.map((p) => p.name).sort();
  }

  private advance(event: Parameters<typeof connectionReducer>[1]) {
    this.connection = connectionReducer(this.connection, event);
  }

  // Set while a peer's state is being applied — see `apply`.
  private applyingRemote = false;
  // Whether this connection has already taken the seat back automatically.
  private seatReclaimSpent = false;

  private send(message: SimMessage) {
    this.broker?.publish(stamp(message));
  }

  // The local write path: bump, then publish. `silent` mirrors the provider's
  // flag for changes that came *from* a peer.
  private apply(change: (current: Encounter) => Encounter, silent = false) {
    const changed = change(this.encounter);
    if (changed === this.encounter) return;
    this.encounter = silent ? changed : bumpRevision(changed, this.clientId);
    if (!silent) {
      // Edited by hand with no session open: this is prep now, whatever table
      // it came from — the provider clears the pairing key the same way.
      if (!this.broker) this.belongsTo = undefined;
      // A real local edit, which ends any standing offer to adopt a late sync
      // answer. The provider does this from `update`; `applyingRemote` is its
      // guard for changes that came *from* a peer.
      if (!this.applyingRemote) this.advance({ type: "local-change" });
      this.publishState();
    }
  }

  private publishState() {
    this.send({
      kind: "state",
      clientId: this.clientId,
      encounter: this.encounter,
    });
  }

  // Stand a character up in the order, the way the provider's participant effect
  // does when a sheet is open.
  bringSelf(currHp = this.characterHp, maxHp = 10, ac = 12) {
    if (!this.characterUuid) throw new Error(`${this.name} has no character`);
    this.characterHp = currHp;
    const id = `self:${this.characterUuid}`;
    this.apply((current) =>
      setVitals(
        addParticipant(current, {
          id,
          name: this.name,
          characterUuid: this.characterUuid,
          ownerClientId: this.clientId,
          initiative: 0,
        }),
        id,
        { currHp, maxHp, ac },
      ),
    );
  }

  // Edit the sheet itself (take damage, drink a potion): the character changes
  // first, and the participant follows — the same order as the provider's
  // vitals effect.
  setCharacterHp(currHp: number) {
    if (!this.characterUuid) throw new Error(`${this.name} has no character`);
    this.characterHp = currHp;
    const id = `self:${this.characterUuid}`;
    const existing = this.encounter.participants.find((p) => p.id === id);
    this.apply((current) =>
      setVitals(current, id, {
        currHp,
        maxHp: existing?.vitals?.maxHp ?? 10,
        ac: existing?.vitals?.ac ?? 12,
      }),
    );
  }

  edit(change: (current: Encounter) => Encounter) {
    this.apply(change);
  }

  // Both ways into a session — the provider's `enterSession`, step for step:
  // connect, decide what the table opens with, take or retake the seat, ask
  // the room, and conclude "empty" if nobody answers.
  private enter(broker: Broker, intent: SessionIntent) {
    this.advance({ type: "connect", intent });
    const belongsTo = this.belongsTo;
    broker.join(this);
    const requestId = `req-${this.clientId}-${++this.requestCounter}`;
    // A new connection, and so a fresh reclaim.
    this.seatReclaimSpent = false;
    this.advance({ type: "opened", code: broker.code, requestId });
    // **Silently**: entering a room is not an edit. Broadcasting the local
    // state here would let a joiner's unrelated solo history win the document
    // race on every peer before adoption ever ran — everything a newcomer
    // holds reaches the room through the handshake instead (the re-add and
    // seat rules in `receiveState` publish exactly what the room lacks).
    this.apply((current) => {
      const base = encounterForTable(current, belongsTo, intent);
      return intent.kind === "host"
        ? claimDmSeat(base, this.clientId, this.dmToken ?? "")
        : reclaimDmSeat(base, this.clientId, this.dmToken);
    }, true);
    this.send({ kind: "syncRequest", clientId: this.clientId, requestId });
    this.send({ kind: "presence", clientId: this.clientId, name: this.name });
    this.belongsTo = broker.code;
    // The broker is synchronous: every answer that will come has come. Still
    // waiting means the room is empty, and what we hold stands.
    if (this.connection.phase === "syncing") {
      this.advance({ type: "sync-window-closed", requestId });
    }
  }

  // Open a table and be its DM — the `hostSession` path.
  host(broker: Broker, token: string) {
    this.dmToken = token;
    this.enter(broker, { kind: "host", reopening: false });
  }

  // Reopen a table that went quiet, on the code the group already has.
  reopen(broker: Broker) {
    this.enter(broker, { kind: "host", reopening: true });
  }

  // Arrive at a realm someone else opened and defer to whatever it says.
  join(broker: Broker) {
    this.enter(broker, { kind: "join" });
  }

  leave() {
    const broker = this.broker;
    this.broker = undefined;
    this.advance({ type: "closed" });
    this.roster = [];
    if (!broker) return;
    // Part *before* announcing. A real client closes its socket on the way out,
    // so it never sees the peers reacting to its own goodbye — and it must not,
    // because a peer's reply is a state with this client removed from it, which
    // the "keep participants this client contributed" rule would dutifully
    // re-add and publish. Modelling the departure as instantaneous is what makes
    // that impossible here too.
    broker.part(this);
    broker.publish(stamp({ kind: "leave", clientId: this.clientId }));
  }

  // The tab dies without saying goodbye — closed laptop, crashed browser. No
  // leave message, so the room keeps this client's participants, which is
  // exactly what makes the later rejoin interesting: the room now holds a copy
  // of you that will only get staler.
  crash() {
    this.broker?.part(this);
    this.broker = undefined;
    this.advance({ type: "closed" });
    this.roster = [];
  }

  // Close the tab and open a new one: a fresh clientId, the same browser. This
  // is the case the DM token exists for, and the reason the seat can't be keyed
  // on `clientId` alone.
  reopenAs(clientId: string): SimClient {
    const reopened = new SimClient({
      clientId,
      characterUuid: this.characterUuid,
      name: this.name,
      dmToken: this.dmToken,
      // A reload reads the encounter (and which table it belongs to) back out
      // of localStorage, so the new tab starts from what the old one last saw.
      encounter: this.encounter,
      belongsTo: this.belongsTo,
    });
    // The sheet is persisted too.
    reopened.characterHp = this.characterHp;
    return reopened;
  }

  receive(raw: SimMessage) {
    // The real boundary: self-echo, unknown kinds, other-people's addressed
    // messages and wrong protocol versions are all dropped here, by the same
    // function that drops them in the app.
    const result = accept(raw, { clientId: this.clientId, kinds: KINDS });
    if (!result.ok) return;
    const message = result.message as SimMessage;
    switch (message.kind) {
      case "syncRequest":
        // Someone arrived knowing nothing. Answer them directly — a repeat,
        // not a change, so no revision bump — and announce ourselves, which is
        // how the newcomer learns who is already here.
        this.send({
          kind: "syncResponse",
          clientId: this.clientId,
          toClientId: message.clientId,
          requestId: message.requestId,
          encounter: this.encounter,
        });
        this.send({
          kind: "presence",
          clientId: this.clientId,
          name: this.name,
        });
        return;
      case "syncResponse": {
        // Whether the answer replaces our state is the machine's call, scoped
        // to the request we sent — a stray answer merges like any other state.
        const adopt = adoptsResponse(this.connection, message.requestId);
        this.advance({ type: "sync-response", requestId: message.requestId });
        this.applyRemote(message.encounter, adopt);
        return;
      }
      case "state":
        // An ordinary broadcast is never adopted, whatever we're waiting for.
        this.applyRemote(message.encounter, false);
        return;
      case "leave":
        this.roster = withoutPresence(this.roster, message.clientId);
        this.apply((current) => withoutClient(current, message.clientId));
        return;
      case "presence":
        this.roster = withPresence(
          this.roster,
          message.clientId,
          { name: message.name },
          (a, b) => a.name === b.name,
        );
        return;
    }
  }

  private applyRemote(incoming: Encounter, adopt: boolean) {
    const receipt = receiveState(this.encounter, incoming, {
      clientId: this.clientId,
      characterUuid: this.characterUuid,
      // Offered only while this connection's reclaim is unspent — the guard
      // against two tabs of one browser trading the seat forever.
      dmToken: this.seatReclaimSpent ? undefined : this.dmToken,
      adopt,
    });
    if (receipt.reclaimedSeat) this.seatReclaimSpent = true;
    this.applyingRemote = true;
    this.encounter = receipt.encounter;
    // A DM set our HP: it lands on the sheet, exactly as the provider
    // dispatches it onto the character.
    if (receipt.ownVitals) this.characterHp = receipt.ownVitals.currHp;
    if (receipt.publish) {
      this.encounter = bumpRevision(this.encounter, this.clientId);
      this.publishState();
    }
    this.applyingRemote = false;
  }
}
