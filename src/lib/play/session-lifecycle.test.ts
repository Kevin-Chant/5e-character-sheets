import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { Broker, SimClient } from "src/lib/fixtures/session-sim";
import { addParticipant, startCombat } from "src/lib/play/encounter";

// Session lifecycle: joining, syncing, reopening, and which table a stored
// encounter belongs to.

const CAROL = "33333333-3333-3333-3333-333333333333" as UUID;

const dm = (clientId = "dm-tab-1") =>
  new SimClient({ clientId, name: "Dungeon Master" });

const goblin = { id: "goblin", name: "Goblin", initiative: 3 };

describe("a DM walking back into their own quiet table", () => {
  it("gets the seat back with nobody there to say so", () => {
    const master = dm();
    master.host(new Broker("code-a"), "dm-token");
    master.edit((c) => addParticipant(c, goblin));
    master.crash();

    const back = master.reopenAs("dm-tab-2");
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

    expect(back.isDm).toBe(true);
    expect(back.phase).toBe("live");
  });
});

describe("which table a stored encounter belongs to", () => {
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
    fresh.edit((c) => addParticipant(c, goblin));
    fresh.host(new Broker("code-b"), "dm-token");

    expect(fresh.participantNames).toContain("Goblin");
  });
});

describe("arriving at a busy table", () => {
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
    for (let hp = 9; hp > 3; hp--) carol.setCharacterHp(hp);
    return { broker, master, carol };
  };

  it("does not let the arrival's solo history wipe the fight", () => {
    const { master, carol } = busyTable();
    carol.join(master.broker!);

    expect(master.participantNames).toContain("Ogre");
    expect(master.encounter.round).toBe(1);
    expect(carol.participantNames).toContain("Ogre");
    expect(carol.encounter.round).toBe(1);
    expect(carol.participantNames).toContain("Carol");
  });

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
    tuesdayDm.host(new Broker("tuesday-code"), "tuesday-token");
    tuesdayDm.edit((c) =>
      addParticipant(c, { id: "tues", name: "Tuesday Goblin", initiative: 2 }),
    );
    tuesdayDm.bringSelf();
    for (let hp = 9; hp > 3; hp--) tuesdayDm.setCharacterHp(hp);
    tuesdayDm.leave();
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

    // Delay the room's answer past the sync window.
    broker.crossing(() => carol.join(broker));

    expect(carol.phase).toBe("live");
    expect(carol.participantNames).toContain("Ogre");
    expect(carol.participantNames).not.toContain("Prep Goblin");
    expect(carol.encounter.round).toBe(1);
    expect(carol.participantNames).toContain("Carol");
    expect(
      carol.encounter.participants.find((p) => p.characterUuid === CAROL)
        ?.vitals?.currHp,
    ).toBe(6);
    expect(master.participantNames).not.toContain("Prep Goblin");
    expect(master.encounter.round).toBe(1);
  });

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
  // The seat is keyed on a per-browser token and a per-tab client id, so a
  // second tab of the same DM otherwise fights the first for the seat forever.
  it("settle the seat instead of trading it forever", () => {
    const broker = new Broker();
    const first = dm("tab-one");
    first.host(broker, "shared-token");
    first.edit(startCombat);

    const second = new SimClient({
      clientId: "tab-two",
      name: "Dungeon Master",
      dmToken: "shared-token",
      encounter: first.encounter,
      belongsTo: broker.code,
    });
    const before = broker.traffic.length;
    second.join(broker);

    expect([first.isDm, second.isDm].filter(Boolean)).toHaveLength(1);
    expect(first.encounter.dmClientId).toBe(second.encounter.dmClientId);
    // Bound, not exact count: a handshake is a handful of messages, a storm is dozens.
    expect(broker.traffic.length - before).toBeLessThan(12);
    expect(first.encounter.round).toBe(1);
    expect(second.encounter.round).toBe(1);
  });

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
