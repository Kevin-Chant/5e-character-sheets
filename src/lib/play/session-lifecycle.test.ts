import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { Broker, SimClient } from "src/lib/fixtures/session-sim";
import { addParticipant, startCombat } from "src/lib/play/encounter";

// The lifecycle half of the session layer: joining, syncing, reopening, and
// which table a stored encounter belongs to — run against the same simulator
// as the convergence suite, now that a connect is a first-class thing it can
// do. This week's three shipped bugs live here as unit tests; none of them
// was expressible while the lifecycle only existed inside a React provider.

const CAROL = "33333333-3333-3333-3333-333333333333" as UUID;

const dm = (clientId = "dm-tab-1") =>
  new SimClient({ clientId, name: "Dungeon Master" });

const goblin = { id: "goblin", name: "Goblin", initiative: 3 };

describe("a DM walking back into their own quiet table", () => {
  // Shipped bug #1: the seat was only reclaimed when a peer's state arrived,
  // and an empty realm sends none — so the DM who closed their tab rejoined
  // their own game as a player, forever.
  it("gets the seat back with nobody there to say so", () => {
    const master = dm();
    master.host(new Broker("code-a"), "dm-token");
    master.edit((c) => addParticipant(c, goblin));
    master.crash();

    const back = master.reopenAs("dm-tab-2");
    // The realm has closed meanwhile; reopening the same code finds it empty.
    back.reopen(new Broker("code-a"));

    expect(back.phase).toBe("live");
    expect(back.isDm).toBe(true);
    expect(back.participantNames).toContain("Goblin");
  });

  it("even when they come in through the join door", () => {
    const master = dm();
    master.host(new Broker("code-a"), "dm-token");
    master.crash();

    const back = master.reopenAs("dm-tab-2");
    back.join(new Broker("code-a"));

    // The token is this browser, and reclaiming is part of entering — not a
    // favour a peer does us later.
    expect(back.isDm).toBe(true);
    expect(back.phase).toBe("live");
  });
});

describe("which table a stored encounter belongs to", () => {
  // Shipped bug #2: the encounter is stored per browser, a code names a
  // table, and nothing paired them — so a brand-new game opened onto last
  // week's order, round and monsters.
  it("does not let a new table inherit the previous table's fight", () => {
    const master = dm();
    master.host(new Broker("code-a"), "dm-token");
    master.edit((c) => addParticipant(c, goblin));
    master.leave();

    const fresh = master.reopenAs("dm-tab-2");
    fresh.host(new Broker("code-b"), "dm-token");

    expect(fresh.encounter.participants).toEqual([]);
    expect(fresh.isDm).toBe(true);
  });

  it("keeps prep — an encounter built while disconnected belongs to nobody", () => {
    const master = dm();
    master.host(new Broker("code-a"), "dm-token");
    master.leave();

    const fresh = master.reopenAs("dm-tab-2");
    // Lining up goblins with no session open re-adopts the encounter as this
    // browser's own; hosting must not throw the prep away.
    fresh.edit((c) => addParticipant(c, goblin));
    fresh.host(new Broker("code-b"), "dm-token");

    expect(fresh.participantNames).toContain("Goblin");
  });
});

describe("arriving at a busy table", () => {
  // A joiner who has been playing solo all week carries a *higher* revision
  // than a young table. Nothing they hold may reach the room except through
  // the handshake — in particular, entering must not broadcast their local
  // state, which would win the document race on every peer and wipe the
  // fight before adoption ever ran.
  const busyTable = () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit((c) => addParticipant(c, { ...goblin, name: "Ogre" }));
    master.edit(startCombat);

    const carol = new SimClient({
      clientId: "zzz-carol-tab",
      characterUuid: CAROL,
      name: "Carol",
    });
    carol.bringSelf();
    // A week of solo play: the revision counts far past the room's.
    for (let hp = 9; hp > 3; hp--) carol.setCharacterHp(hp);
    return { broker, master, carol };
  };

  it("does not let the arrival's solo history wipe the fight", () => {
    const { master, carol } = busyTable();
    carol.join(master.broker!);

    expect(master.participantNames).toContain("Ogre");
    expect(master.encounter.round).toBe(1);
    // And the newcomer adopted the room rather than keeping their week.
    expect(carol.participantNames).toContain("Ogre");
    expect(carol.encounter.round).toBe(1);
    expect(carol.participantNames).toContain("Carol");
  });

  // The sharpest version: the arrival runs their *own* table on other nights,
  // so their browser holds a dmToken and their stored encounter carries it —
  // which makes the seat-reclaim step on entry a real change. Entering must
  // still say nothing: broadcasting that change would carry their whole other
  // fight (and a seat claim) into this room ahead of the handshake.
  it("does not let a DM-elsewhere arrival wipe the room or take its seat", () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit((c) => addParticipant(c, { ...goblin, name: "Ogre" }));
    master.edit(startCombat);

    const tuesdayDm = new SimClient({
      clientId: "zzz-tuesday-tab",
      characterUuid: CAROL,
      name: "Carol",
      dmToken: "tuesday-token",
    });
    // Their own table, run from this browser: seat held, monsters typed in,
    // a long history.
    tuesdayDm.host(new Broker("tuesday-code"), "tuesday-token");
    tuesdayDm.edit((c) =>
      addParticipant(c, { id: "tues", name: "Tuesday Goblin", initiative: 2 }),
    );
    tuesdayDm.bringSelf();
    for (let hp = 9; hp > 3; hp--) tuesdayDm.setCharacterHp(hp);
    tuesdayDm.leave();
    // A reload since — new clientId, same browser — so the seat-reclaim on
    // entry genuinely rewrites their stored encounter.
    const arrival = tuesdayDm.reopenAs("zzz-thursday-tab");

    arrival.join(broker);

    expect(master.participantNames).toContain("Ogre");
    expect(master.participantNames).not.toContain("Tuesday Goblin");
    expect(master.isDm).toBe(true);
    expect(arrival.isDm).toBe(false);
    expect(arrival.participantNames).toContain("Ogre");
    expect(arrival.encounter.round).toBe(1);
  });

  it("keeps the newcomer's own vitals through the adoption", () => {
    const { master, carol } = busyTable();
    carol.join(master.broker!);
    const row = (c: SimClient) =>
      c.encounter.participants.find((p) => p.characterUuid === CAROL);
    expect(row(carol)?.vitals?.currHp).toBe(4);
    expect(row(master)?.vitals?.currHp).toBe(4);
  });
});

describe("an answer that arrives after the window closed", () => {
  it("merges like any other state instead of being adopted", () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit(startCombat);

    const carol = new SimClient({
      clientId: "zzz-carol-tab",
      characterUuid: CAROL,
      name: "Carol",
    });
    carol.bringSelf();
    carol.edit((c) =>
      addParticipant(c, { id: "prep", name: "Prep Goblin", initiative: 5 }),
    );
    for (let hp = 9; hp > 5; hp--) carol.setCharacterHp(hp);

    // The room's answer is delayed past the sync window: Carol concludes the
    // room is empty, then the answer lands late.
    broker.crossing(() => carol.join(broker));

    expect(carol.phase).toBe("live");
    // Adopted, the room's membership would have replaced hers and dropped the
    // unowned prep goblin. Merged, the document race runs — and her week of
    // edits outnumbers the room's, so her roster stands.
    expect(carol.participantNames).toContain("Prep Goblin");
  });
});

describe("presence", () => {
  const table = () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    const carol = new SimClient({
      clientId: "carol-tab",
      characterUuid: CAROL,
      name: "Carol",
    });
    carol.join(broker);
    return { broker, master, carol };
  };

  it("introduces both sides on join", () => {
    const { master, carol } = table();
    expect(master.rosterNames).toContain("Carol");
    // The answer to a sync request announces the answerer, so the newcomer
    // learns who is already here without waiting for a heartbeat.
    expect(carol.rosterNames).toContain("Dungeon Master");
  });

  it("drops a peer who leaves", () => {
    const { master, carol } = table();
    carol.leave();
    expect(master.rosterNames).not.toContain("Carol");
  });

  it("keeps the ghost of a crashed tab until the TTL takes it", () => {
    // No leave message, so only the (time-based, `prunePresence`-tested)
    // timeout removes them. The roster promising less than the truth here is
    // the deliberate design — see `realm/presence.ts`.
    const { master, carol } = table();
    carol.crash();
    expect(master.rosterNames).toContain("Carol");
  });
});

describe("a tab from an older build", () => {
  it("is dropped whole rather than merged wrongly", () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit(startCombat);
    const before = master.encounter;

    // Unversioned, revision high enough to win everything — the envelope
    // drops it as stale before any merge sees it.
    broker.publish({
      kind: "state",
      clientId: "old-tab",
      encounter: { ...before, round: 9, revision: 99 },
    });

    expect(master.encounter).toBe(before);
  });
});
