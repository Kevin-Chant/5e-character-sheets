import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { Broker, SimClient } from "src/lib/fixtures/session-sim";
import {
  addParticipant,
  claimParticipant,
  offerSheet,
  releaseDmSeat,
  setConcentration,
  setVitals,
  startCombat,
} from "src/lib/play/encounter";

// What several browsers converge on, run in one process against a fake broker.
//
// These are the tests that would have caught the bugs the two-browser harness
// found the hard way. Everything here is about the merge rules; the transport
// itself is `pnpm session-smoke`.

const ALICE = "11111111-1111-1111-1111-111111111111" as UUID;
const BOB = "22222222-2222-2222-2222-222222222222" as UUID;
const CAROL = "33333333-3333-3333-3333-333333333333" as UUID;

function dm(clientId = "dm-tab-1") {
  return new SimClient({ clientId, name: "Dungeon Master" });
}
function player(clientId: string, name: string, characterUuid: UUID) {
  return new SimClient({ clientId, name, characterUuid });
}

// A DM hosting, with two players already at the table.
function table() {
  const broker = new Broker();
  const master = dm();
  master.host(broker, "dm-token");
  const alice = player("alice-tab", "Alice", ALICE);
  const bob = player("bob-tab", "Bob", BOB);
  alice.join(broker);
  alice.bringSelf();
  bob.join(broker);
  bob.bringSelf();
  return { broker, master, alice, bob };
}

describe("a table converging", () => {
  it("shows everyone the same roster", () => {
    const { master, alice, bob } = table();
    expect(alice.participantNames).toEqual(["Alice", "Bob"]);
    expect(bob.participantNames).toEqual(["Alice", "Bob"]);
    expect(master.participantNames).toEqual(["Alice", "Bob"]);
  });

  it("settles rather than echoing forever", () => {
    // Two peers each re-publishing what the other sent is a real failure mode
    // and looks identical to success unless the traffic is counted.
    const { broker } = table();
    const before = broker.traffic.length;
    expect(before).toBeLessThan(30);
    expect(broker.traffic.length).toBe(before);
  });

  it("propagates the fight the DM starts", () => {
    const { master, alice, bob } = table();
    master.edit(startCombat);
    expect(alice.encounter.round).toBe(1);
    expect(bob.encounter.round).toBe(1);
  });

  // The bug the two-browser harness kept half-finding: a joiner's local
  // encounter is an unrelated history that routinely lands on the same revision
  // as the room's, and the clientId tiebreak then threw one of them away.
  it("does not let a joiner's local state discard the room", () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit(startCombat);

    // Carol has been running her own local encounter — same revision count,
    // completely unrelated history, and a clientId that sorts above the DM's.
    const carol = new SimClient({
      clientId: "zzz-carol-tab",
      characterUuid: CAROL,
      name: "Carol",
    });
    carol.bringSelf();
    carol.edit((current) =>
      addParticipant(current, { id: "goblin", name: "Goblin", initiative: 3 }),
    );

    carol.join(broker);
    carol.bringSelf();

    expect(carol.encounter.round).toBe(1);
    expect(carol.encounter.dmClientId).toBe("dm-tab-1");
    expect(carol.participantNames).toContain("Carol");
    expect(master.participantNames).toContain("Carol");
  });

  it("keeps your own vitals when a peer's copy is stale", () => {
    const { master, alice } = table();
    alice.bringSelf(3, 10, 12);
    expect(
      alice.encounter.participants.find((p) => p.characterUuid === ALICE)
        ?.vitals?.currHp,
    ).toBe(3);
    master.edit(startCombat);
    expect(
      alice.encounter.participants.find((p) => p.characterUuid === ALICE)
        ?.vitals?.currHp,
    ).toBe(3);
  });
});

describe("the DM seat", () => {
  it("belongs to whoever started the game, without anyone claiming it", () => {
    const { master, alice } = table();
    expect(master.isDm).toBe(true);
    expect(alice.isDm).toBe(false);
    expect(alice.encounter.dmClientId).toBe(master.clientId);
  });

  // `clientId` is per-tab. Before the token, this was the common case that took
  // the DM's seat away — not a sleeping laptop, just a refresh.
  it("survives the DM reloading their tab", () => {
    const { broker, master, alice } = table();
    master.edit(startCombat);
    master.leave();

    const reloaded = master.reopenAs("dm-tab-2");
    reloaded.join(broker);

    expect(reloaded.isDm).toBe(true);
    expect(alice.encounter.dmClientId).toBe("dm-tab-2");
    expect(alice.encounter.dmToken).toBe("dm-token");
  });

  it("does not gate the table while the DM is away", () => {
    const { master, alice } = table();
    master.leave();
    // Seat put down, key kept: nobody is locked out in the meantime.
    expect(alice.encounter.dmClientId).toBeUndefined();
    expect(alice.encounter.dmToken).toBe("dm-token");
  });

  it("is not handed to a different browser that happens to rejoin", () => {
    const { broker, master } = table();
    master.leave();
    const stranger = player("stranger-tab", "Stranger", CAROL);
    stranger.join(broker);
    stranger.bringSelf();
    expect(stranger.isDm).toBe(false);
    expect(stranger.encounter.dmClientId).toBeUndefined();
  });

  // Releasing is a decision, unlike leaving, so it gives up the key too.
  it("is gone for good once released", () => {
    const { broker, master, alice } = table();
    master.edit(releaseDmSeat);
    expect(alice.encounter.dmToken).toBeUndefined();

    master.leave();
    const reloaded = master.reopenAs("dm-tab-2");
    reloaded.join(broker);
    expect(reloaded.isDm).toBe(false);
  });
});

describe("the DM overseeing vitals", () => {
  const aliceId = `self:${ALICE}`;
  const hpOf = (client: SimClient, id: string) =>
    client.encounter.participants.find((p) => p.id === id)?.vitals?.currHp;

  // The subtle half of "the DM can set your HP": the participant is only a
  // projection of the sheet, so the edit has to land on the character or the
  // sheet's next change publishes the old number straight back.
  it("lands a DM's HP edit on the player's sheet", () => {
    const { master, alice, bob } = table();
    master.edit((current) =>
      setVitals(current, aliceId, { currHp: 4, maxHp: 10, ac: 12 }),
    );

    expect(alice.characterHp).toBe(4);
    expect(hpOf(alice, aliceId)).toBe(4);
    expect(hpOf(bob, aliceId)).toBe(4);
  });

  it("still lets the player's own next edit win", () => {
    const { master, alice, bob } = table();
    master.edit((current) =>
      setVitals(current, aliceId, { currHp: 4, maxHp: 10, ac: 12 }),
    );
    alice.setCharacterHp(9);
    expect(hpOf(master, aliceId)).toBe(9);
    expect(hpOf(bob, aliceId)).toBe(9);
  });

  it("does not echo into a storm", () => {
    const { broker, master } = table();
    const before = broker.traffic.length;
    master.edit((current) =>
      setVitals(current, aliceId, { currHp: 4, maxHp: 10, ac: 12 }),
    );
    // One edit, one acceptance ripple — not an unbounded exchange.
    expect(broker.traffic.length - before).toBeLessThan(8);
  });

  // The reason "accept whatever copy of you arrives" was never an option: a
  // room can hold last week's you, if that tab died without a leave message.
  it("does not let the room's stale copy overwrite a rejoining sheet", () => {
    const { broker, master, alice } = table();
    alice.setCharacterHp(44);
    alice.crash();

    // Life goes on offline: the character rests, HP changes, and this browser's
    // fresh local encounter has a tiny vitalsRev next to the room's.
    const rested = alice.reopenAs("alice-tab-2");
    rested.setCharacterHp(50);

    rested.join(broker);
    expect(rested.characterHp).toBe(50);
    expect(hpOf(rested, aliceId)).toBe(50);
    // And the correction reaches the room, rather than sitting local until the
    // sheet next changes.
    expect(hpOf(master, aliceId)).toBe(50);
  });
});

describe("an offered sheet", () => {
  const sheetId = `self:${CAROL}`;

  // The DM brings a companion sheet and offers it; a player picks it up (in
  // the app, ownership moves when they open the arriving character).
  function tableWithOffer() {
    const fixture = table();
    fixture.master.edit((current) =>
      offerSheet(
        addParticipant(current, {
          id: sheetId,
          name: "Carol the Companion",
          characterUuid: CAROL,
          ownerClientId: fixture.master.clientId,
          initiative: 0,
        }),
        sheetId,
        true,
      ),
    );
    return fixture;
  }

  it("goes back on the table when its player leaves, not out the door", () => {
    const { broker, master, bob } = tableWithOffer();
    const player = new SimClient({ clientId: "picker-tab", name: "Picker" });
    player.join(broker);
    player.edit((current) =>
      claimParticipant(current, sheetId, player.clientId),
    );

    player.leave();

    // Bob typed nothing in; the DM brought the sheet — so unlike Bob's own
    // character, it stays in the fight and reverts to the DM's client, still
    // offered for the next pickup.
    const reverted = master.encounter.participants.find(
      (p) => p.id === sheetId,
    );
    expect(reverted).toBeDefined();
    expect(reverted?.ownerClientId).toBe(master.clientId);
    expect(reverted?.claimable).toBe(true);
    expect(bob.encounter.participants.find((p) => p.id === sheetId)).toEqual(
      reverted,
    );
  });

  it("is treated differently from the player's own character", () => {
    const { master, bob } = tableWithOffer();
    bob.leave();
    // Bob's own character goes with him; the offered companion is the DM's and
    // stays regardless of who leaves.
    expect(master.participantNames).not.toContain("Bob");
    expect(master.participantNames).toContain("Carol the Companion");
  });
});

describe("leaving", () => {
  it("takes your character out of everyone's order", () => {
    const { master, alice, bob } = table();
    bob.leave();
    expect(alice.participantNames).toEqual(["Alice"]);
    expect(master.participantNames).toEqual(["Alice"]);
  });

  it("leaves behind the monsters you typed in", () => {
    const { master, alice } = table();
    master.edit((current) =>
      addParticipant(current, { id: "goblin", name: "Goblin", initiative: 3 }),
    );
    alice.leave();
    // Alice's character goes; the goblin stays, because the fight still
    // contains it and somebody else is tracking it.
    expect(master.participantNames).toEqual(["Bob", "Goblin"]);
  });

  it("lets you come back", () => {
    const { broker, master, alice } = table();
    alice.leave();
    expect(master.participantNames).toEqual(["Bob"]);
    alice.join(broker);
    alice.bringSelf();
    expect(master.participantNames).toEqual(["Alice", "Bob"]);
  });
});

// Two people writing to the same row at the same moment.
//
// This is not an exotic race — it is the ordinary shape of a fight. The DM
// types "you take 9" while the player, hearing the same sentence, ticks the
// spell they're holding. Both writes start from the same revision, so a
// document-level last-write-wins is a coin flip that silently discards one of
// them; found in the two-browser harness, where the concentration vanished in
// two runs and the DM's damage vanished in the third.
describe("simultaneous writes to one participant", () => {
  const aliceRow = `self:${ALICE}`;
  const hurt = (c: Parameters<typeof setVitals>[0]) =>
    setVitals(c, aliceRow, { currHp: 1, maxHp: 10, ac: 12 });
  const holding = (c: Parameters<typeof setConcentration>[0]) =>
    setConcentration(c, aliceRow, { spell: "Web", startedRound: 1 });

  const crossed = () => {
    const t = table();
    t.broker.crossing(() => {
      t.master.edit(hurt);
      t.alice.edit(holding);
    });
    return t;
  };
  const row = (c: SimClient) =>
    c.encounter.participants.find((p) => p.id === aliceRow)!;

  it("keeps the DM's damage and the player's concentration", () => {
    const { master, alice, bob } = crossed();
    for (const client of [master, alice, bob]) {
      expect(row(client).vitals?.currHp).toBe(1);
      expect(row(client).concentration?.spell).toBe("Web");
    }
  });

  it("converges the whole table on one answer", () => {
    const { master, alice, bob } = crossed();
    expect(row(alice)).toEqual(row(master));
    expect(row(bob)).toEqual(row(master));
  });

  it("does not start an endless exchange to get there", () => {
    // The loser of a document race now speaks up instead of staying quiet,
    // which is the fix — but its reply carries a higher revision, so the peer's
    // next receive is a plain win and the conversation stops.
    const { broker } = crossed();
    const settled = broker.traffic.length;
    expect(settled).toBeLessThan(30);
    expect(broker.traffic.length).toBe(settled);
  });

  it("still lets the loser's lane lose when it is the same lane", () => {
    // Two writes to the *same* lane are genuinely ambiguous, and one of them
    // has to go. All that's promised there is that everyone picks the same one.
    const { broker, master, alice, bob } = table();
    broker.crossing(() => {
      master.edit((c) =>
        setConcentration(c, aliceRow, { spell: "Bless", startedRound: 1 }),
      );
      alice.edit(holding);
    });
    expect(row(alice).concentration).toEqual(row(master).concentration);
    expect(row(bob).concentration).toEqual(row(master).concentration);
  });
});
