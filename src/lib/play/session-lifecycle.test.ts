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
  // Being slow used to change the *outcome*, not just the timing. A joiner
  // whose answer missed the window stopped adopting, and the late reply then
  // merged by revision — so a browser carrying a long solo history could win
  // the document race and push its own roster over the fight it had just
  // walked into. Whether that happened came down to a round trip against a
  // 750ms timer, which is a coin flip on mobile data.
  //
  // The answer to *our own request* is now adoptable whenever it lands, so
  // late and on time produce the same table.
  it("is adopted anyway, so a slow connection joins the same fight as a fast one", () => {
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
    carol.edit((c) =>
      addParticipant(c, { id: "prep", name: "Prep Goblin", initiative: 5 }),
    );
    for (let hp = 9; hp > 5; hp--) carol.setCharacterHp(hp);

    // The room's answer is delayed past the sync window.
    broker.crossing(() => carol.join(broker));

    expect(carol.phase).toBe("live");
    // The room's fight, adopted — not Carol's solo prep laid over the top.
    expect(carol.participantNames).toContain("Ogre");
    expect(carol.participantNames).not.toContain("Prep Goblin");
    expect(carol.encounter.round).toBe(1);
    // Her own row and her own HP survive it, exactly as in the on-time case.
    expect(carol.participantNames).toContain("Carol");
    expect(
      carol.encounter.participants.find((p) => p.characterUuid === CAROL)
        ?.vitals?.currHp,
    ).toBe(6);
    // And the room was never clobbered by her arrival.
    expect(master.participantNames).not.toContain("Prep Goblin");
    expect(master.encounter.round).toBe(1);
  });

  // The carve-out: once something has been done here, the late answer is no
  // longer replacing a stale copy of the room — it would be throwing away an
  // edit somebody made in the meantime.
  it("merges instead once there is a local edit to lose", () => {
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
    // Joins with the answer held back, then types a monster in before it
    // lands — the reply is now late *and* overtaken.
    broker.crossing(() => {
      carol.join(broker);
      carol.edit((c) =>
        addParticipant(c, { id: "prep", name: "Prep Goblin", initiative: 5 }),
      );
    });

    expect(carol.participantNames).toContain("Prep Goblin");
  });
});

describe("two tabs of one browser at the same table", () => {
  // The seat is keyed on a token that is per *browser* and a client id that is
  // per *tab*, so a DM with the app open twice has two clients that each
  // recognise the seat as theirs and neither can tell the other from its own
  // pre-refresh self. Left alone they take it back off each other forever, and
  // every bump publishes — a realm full of seat swaps for as long as both tabs
  // stay open. Spending the automatic reclaim once per connection ends it.
  it("settle the seat instead of trading it forever", () => {
    const broker = new Broker();
    const first = dm("tab-one");
    first.host(broker, "shared-token");
    first.edit(startCombat);

    // The same browser, a second tab, walking into the table it is already at.
    const second = new SimClient({
      clientId: "tab-two",
      name: "Dungeon Master",
      dmToken: "shared-token",
      encounter: first.encounter,
      belongsTo: broker.code,
    });
    const before = broker.traffic.length;
    second.join(broker);

    // Exactly one of them holds it, both agree who, and the exchange ended.
    expect([first.isDm, second.isDm].filter(Boolean)).toHaveLength(1);
    expect(first.encounter.dmClientId).toBe(second.encounter.dmClientId);
    // The handshake itself is a handful of messages; a storm is dozens and
    // never stops. The bound is what's being asserted, not the exact count.
    expect(broker.traffic.length - before).toBeLessThan(12);
    // And the fight they were both in survived being argued over.
    expect(first.encounter.round).toBe(1);
    expect(second.encounter.round).toBe(1);
  });

  // A reload is not a second tab, and must still cost the DM nothing: the old
  // tab is gone, so there is nobody to fight with and the reclaim is spent on
  // the only client that wants it.
  it("still hand the seat back after a reload", () => {
    const broker = new Broker();
    const first = dm("tab-one");
    first.host(broker, "shared-token");
    const player = new SimClient({
      clientId: "player-tab",
      characterUuid: CAROL,
      name: "Carol",
    });
    player.bringSelf();
    player.join(broker);

    first.crash();
    const reopened = first.reopenAs("tab-one-again");
    reopened.join(broker);

    expect(reopened.isDm).toBe(true);
    expect(player.encounter.dmClientId).toBe("tab-one-again");
  });
});
