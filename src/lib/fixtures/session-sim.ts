import { UUID } from "crypto";
import {
  addParticipant,
  claimDmSeat,
  Encounter,
  EMPTY_ENCOUNTER,
  setVitals,
} from "src/lib/play/encounter";
import {
  bumpRevision,
  receiveState,
  withoutClient,
} from "src/lib/play/session";

// Several browsers in one process.
//
// **Why this exists.** The session layer's real failures are all about what two
// clients converge on, and for a long time the only way to see them was two
// Playwright contexts against a live sidecar — slow, and (worse) intermittent,
// because the bugs were races. The revision race that discarded a joiner's room
// was pure logic and should never have needed a browser to find.
//
// So: a broker that is a map of topic to subscriber, delivering synchronously,
// and a client that is the encounter plus the *real* decision functions
// (`receiveState`, `bumpRevision`, `withoutClient`). What this deliberately does
// **not** model is WAMP, the sidecar, realms, or React — those are what
// `pnpm session-smoke` is for. Anything asserted here is a claim about the
// merge rules alone, which is exactly the layer that keeps being wrong.
//
// The one fidelity detail that matters: nightlife-rabbit does not honour WAMP's
// `exclude_me`, so a publisher receives its own messages and filters them by
// `clientId`. The broker below delivers to the sender too, for the same reason —
// a simulator that quietly did the right thing would hide a real bug class.

type Message =
  | { kind: "state"; clientId: string; encounter: Encounter }
  | { kind: "hello"; clientId: string }
  | { kind: "leave"; clientId: string };

export class Broker {
  private clients: SimClient[] = [];
  // Every message that crossed the wire, for asserting on chattiness — an
  // endless echo between two peers is a real failure mode here and it looks
  // like success unless you count.
  readonly traffic: Message[] = [];
  private held: Message[] | undefined;

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

  publish(message: Message) {
    if (this.held) {
      this.held.push(message);
      return;
    }
    this.traffic.push(message);
    // A copy per recipient: a shared object reference would let one client's
    // merge mutate another's view and make every test optimistic.
    for (const client of this.clients) {
      client.receive(JSON.parse(JSON.stringify(message)) as Message);
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
}

export class SimClient {
  broker?: Broker;
  encounter: Encounter;
  readonly clientId: string;
  readonly characterUuid?: UUID;
  readonly name: string;
  dmToken?: string;
  // The character sheet's own HP, standing in for `character.currHp`. The
  // participant is only a projection of this — which is exactly what makes a DM
  // editing someone's HP subtle: the edit has to land *here*, or the sheet's
  // next change publishes the old number right back.
  characterHp = 10;
  // Set between asking to join and the first reply, exactly as the provider
  // does. See `mergeEncounter`'s `adopt`.
  private adoptNext = false;

  constructor(options: SimClientOptions) {
    this.clientId = options.clientId;
    this.characterUuid = options.characterUuid;
    this.name = options.name ?? options.clientId;
    this.dmToken = options.dmToken;
    this.encounter = options.encounter ?? EMPTY_ENCOUNTER;
  }

  get isDm(): boolean {
    return this.encounter.dmClientId === this.clientId;
  }

  get participantNames(): string[] {
    return this.encounter.participants.map((p) => p.name).sort();
  }

  // The local write path: bump, then publish. `silent` mirrors the provider's
  // flag for changes that came *from* a peer.
  private apply(change: (current: Encounter) => Encounter, silent = false) {
    const changed = change(this.encounter);
    if (changed === this.encounter) return;
    this.encounter = silent ? changed : bumpRevision(changed, this.clientId);
    if (!silent) this.publishState();
  }

  private publishState() {
    this.broker?.publish({
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

  // Open a realm nobody else is in, and be its DM — the `hostSession` path.
  host(broker: Broker, token: string) {
    broker.join(this);
    this.dmToken = token;
    this.apply((current) => claimDmSeat(current, this.clientId, token));
  }

  // Arrive at a realm someone else opened, announce yourself, and defer to
  // whatever the room says.
  join(broker: Broker) {
    broker.join(this);
    this.adoptNext = true;
    broker.publish({ kind: "hello", clientId: this.clientId });
  }

  leave() {
    const broker = this.broker;
    this.broker = undefined;
    this.adoptNext = false;
    if (!broker) return;
    // Part *before* announcing. A real client closes its socket on the way out,
    // so it never sees the peers reacting to its own goodbye — and it must not,
    // because a peer's reply is a state with this client removed from it, which
    // the "keep participants this client contributed" rule would dutifully
    // re-add and publish. Modelling the departure as instantaneous is what makes
    // that impossible here too.
    broker.part(this);
    broker.publish({ kind: "leave", clientId: this.clientId });
  }

  // The tab dies without saying goodbye — closed laptop, crashed browser. No
  // leave message, so the room keeps this client's participants, which is
  // exactly what makes the later rejoin interesting: the room now holds a copy
  // of you that will only get staler.
  crash() {
    this.broker?.part(this);
    this.broker = undefined;
    this.adoptNext = false;
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
      // A reload reads the encounter back out of localStorage, so the new tab
      // starts from what the old one last saw.
      encounter: this.encounter,
    });
    // The sheet is persisted too.
    reopened.characterHp = this.characterHp;
    return reopened;
  }

  receive(message: Message) {
    // Publishers get their own messages back; every client drops its own.
    if (message.clientId === this.clientId) return;
    if (message.kind === "hello") {
      // Someone arrived knowing nothing. Repeat what we have — not a change, so
      // no revision bump.
      this.publishState();
      return;
    }
    if (message.kind === "leave") {
      this.apply((current) => withoutClient(current, message.clientId));
      return;
    }
    const adopt = this.adoptNext;
    this.adoptNext = false;
    const receipt = receiveState(this.encounter, message.encounter, {
      clientId: this.clientId,
      characterUuid: this.characterUuid,
      dmToken: this.dmToken,
      adopt,
    });
    this.encounter = receipt.encounter;
    // A DM set our HP: it lands on the sheet, exactly as the provider
    // dispatches it onto the character.
    if (receipt.ownVitals) this.characterHp = receipt.ownVitals.currHp;
    if (receipt.publish) {
      this.encounter = bumpRevision(this.encounter, this.clientId);
      this.publishState();
    }
  }
}
