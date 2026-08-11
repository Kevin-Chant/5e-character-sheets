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

// Several browsers in one process, for testing convergence without Playwright.
//
// A broker (map of topic to subscriber, delivering synchronously) plus a
// client that runs the real pieces: the envelope (`accept`/`stamp`), the
// connection machine (`connectionReducer`), the entry rules
// (`encounterForTable`, seat claim/reclaim), and the merge (`receiveState`).
// Does not model WAMP, the sidecar, realms, or React — see `pnpm
// session-smoke` for that.
//
// Two fidelity details:
// - nightlife-rabbit does not honour WAMP's `exclude_me`, so a publisher
//   receives its own messages and filters by clientId; the broker delivers to
//   the sender too, and the envelope's `accept` drops the echo.
// - The broker is synchronous: if the machine is still `syncing` when `enter`
//   returns, every answer that will ever come has come, and the room is empty.

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
  // Every message that crossed the wire, for asserting on chattiness (e.g. an
  // endless echo between two peers).
  readonly traffic: SimMessage[] = [];
  private held: SimMessage[] | undefined;
  // Session code this broker is a table for, checked against
  // `ENCOUNTER_SESSION_STORAGE_KEY`.
  readonly code: string;

  constructor(code = "aaaaaaaa-0000-0000-0000-000000000001") {
    this.code = code;
  }

  // Models two writes crossing on the wire: anything published inside `run` is
  // held and delivered afterwards, rather than arriving in turn as the
  // otherwise-synchronous broker would deliver it.
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
    // A copy per recipient, so one client's merge can't mutate another's view.
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
  // Where this client's encounter starts. Defaults to empty.
  encounter?: Encounter;
  // Which table the stored encounter came from, if any (the persisted pairing
  // key a reload reads back).
  belongsTo?: string;
}

export class SimClient {
  broker?: Broker;
  encounter: Encounter;
  // Driven the same way the provider drives its connection state machine.
  connection: ConnectionState = OFFLINE;
  // Which table `encounter` belongs to (`ENCOUNTER_SESSION_STORAGE_KEY`).
  belongsTo?: string;
  // Who this client believes is at the table, via the real presence functions.
  roster: PresenceEntry<{ name: string }>[] = [];
  readonly clientId: string;
  readonly characterUuid?: UUID;
  readonly name: string;
  dmToken?: string;
  // Standing in for `character.currHp`. A DM editing someone's HP has to land
  // here, or the sheet's next change publishes the old number back.
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

  // Local write path: bump, then publish. `silent` mirrors the provider's flag
  // for changes that came from a peer.
  private apply(change: (current: Encounter) => Encounter, silent = false) {
    const changed = change(this.encounter);
    if (changed === this.encounter) return;
    this.encounter = silent ? changed : bumpRevision(changed, this.clientId);
    if (!silent) {
      // Edited with no session open: clear the pairing key, as the provider
      // does.
      if (!this.broker) this.belongsTo = undefined;
      // A real local edit ends any standing offer to adopt a late sync answer.
      // `applyingRemote` guards changes that came from a peer.
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

  // Stand a character up in the order, as the provider's participant effect
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

  // Edit the sheet itself: character changes first, participant follows —
  // same order as the provider's vitals effect.
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

  // Both ways into a session, mirroring the provider's `enterSession`: connect,
  // decide what the table opens with, take or retake the seat, ask the room,
  // and conclude "empty" if nobody answers.
  private enter(broker: Broker, intent: SessionIntent) {
    this.advance({ type: "connect", intent });
    const belongsTo = this.belongsTo;
    broker.join(this);
    const requestId = `req-${this.clientId}-${++this.requestCounter}`;
    this.seatReclaimSpent = false;
    this.advance({ type: "opened", code: broker.code, requestId });
    // Silently: entering a room isn't an edit. A newcomer's state reaches the
    // room through the sync handshake instead (`receiveState`'s re-add/seat
    // rules), not by broadcasting here.
    this.apply((current) => {
      const base = encounterForTable(current, belongsTo, intent);
      return intent.kind === "host"
        ? claimDmSeat(base, this.clientId, this.dmToken ?? "")
        : reclaimDmSeat(base, this.clientId, this.dmToken);
    }, true);
    this.send({ kind: "syncRequest", clientId: this.clientId, requestId });
    this.send({ kind: "presence", clientId: this.clientId, name: this.name });
    this.belongsTo = broker.code;
    // Synchronous broker: still waiting here means the room is empty.
    if (this.connection.phase === "syncing") {
      this.advance({ type: "sync-window-closed", requestId });
    }
  }

  // Open a table and be its DM (`hostSession` path).
  host(broker: Broker, token: string) {
    this.dmToken = token;
    this.enter(broker, { kind: "host", reopening: false });
  }

  // Reopen a table that went quiet, on the code the group already has.
  reopen(broker: Broker) {
    this.enter(broker, { kind: "host", reopening: true });
  }

  // Arrive at a realm someone else opened.
  join(broker: Broker) {
    this.enter(broker, { kind: "join" });
  }

  leave() {
    const broker = this.broker;
    this.broker = undefined;
    this.advance({ type: "closed" });
    this.roster = [];
    if (!broker) return;
    // Part before announcing, so this client never sees peers reacting to its
    // own goodbye (whose reply would otherwise re-add it via the "keep
    // participants this client contributed" rule).
    broker.part(this);
    broker.publish(stamp({ kind: "leave", clientId: this.clientId }));
  }

  // Tab dies without a leave message — the room keeps this client's
  // participants, which is what makes the later rejoin interesting.
  crash() {
    this.broker?.part(this);
    this.broker = undefined;
    this.advance({ type: "closed" });
    this.roster = [];
  }

  // Close the tab and open a new one: fresh clientId, same browser — the case
  // the DM token exists for, since the seat can't be keyed on clientId alone.
  reopenAs(clientId: string): SimClient {
    const reopened = new SimClient({
      clientId,
      characterUuid: this.characterUuid,
      name: this.name,
      dmToken: this.dmToken,
      encounter: this.encounter,
      belongsTo: this.belongsTo,
    });
    reopened.characterHp = this.characterHp;
    return reopened;
  }

  receive(raw: SimMessage) {
    const result = accept(raw, { clientId: this.clientId, kinds: KINDS });
    if (!result.ok) return;
    const message = result.message as SimMessage;
    switch (message.kind) {
      case "syncRequest":
        // Answer directly (no revision bump — a repeat, not a change) and
        // announce ourselves, so the newcomer learns who is here.
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
        // Whether the answer replaces our state is scoped to the request we
        // sent; a stray answer merges like any other state.
        const adopt = adoptsResponse(this.connection, message.requestId);
        this.advance({ type: "sync-response", requestId: message.requestId });
        this.applyRemote(message.encounter, adopt);
        return;
      }
      case "state":
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
      // Offered only while unspent — guards against two tabs of one browser
      // trading the seat forever.
      dmToken: this.seatReclaimSpent ? undefined : this.dmToken,
      adopt,
    });
    if (receipt.reclaimedSeat) this.seatReclaimSpent = true;
    this.applyingRemote = true;
    this.encounter = receipt.encounter;
    if (receipt.ownVitals) this.characterHp = receipt.ownVitals.currHp;
    if (receipt.publish) {
      this.encounter = bumpRevision(this.encounter, this.clientId);
      this.publishState();
    }
    this.applyingRemote = false;
  }
}
