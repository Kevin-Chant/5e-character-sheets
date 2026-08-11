import { describe, expect, it } from "vitest";
import { UUID } from "crypto";
import { Broker, SimClient } from "src/lib/fixtures/session-sim";
import { stamp } from "src/lib/realm/envelope";
import {
  addParticipant,
  advanceTurn,
  claimParticipant,
  Encounter,
  offerSheet,
  releaseDmSeat,
  removeParticipant,
  setConcentration,
  setHidden,
  setInitiative,
  setSharing,
  setSpent,
  setVitals,
  startCombat,
} from "src/lib/play/encounter";

// Multi-client convergence against a fake broker (merge rules only; transport
// is covered by `pnpm session-smoke`).

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

  it("does not let a joiner's local state discard the room", () => {
    const broker = new Broker();
    const master = dm();
    master.host(broker, "dm-token");
    master.edit(startCombat);

    // Carol's local encounter shares the room's revision count but has an
    // unrelated history, and her clientId sorts above the DM's.
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

  // The participant row is a projection of the sheet, so the edit must land
  // on the character or the sheet's next change overwrites it back.
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
    expect(broker.traffic.length - before).toBeLessThan(8);
  });

  it("does not let the room's stale copy overwrite a rejoining sheet", () => {
    const { broker, master, alice } = table();
    alice.setCharacterHp(44);
    alice.crash();

    // Offline HP change gives this browser a tiny vitalsRev next to the room's.
    const rested = alice.reopenAs("alice-tab-2");
    rested.setCharacterHp(50);

    rested.join(broker);
    expect(rested.characterHp).toBe(50);
    expect(hpOf(rested, aliceId)).toBe(50);
    expect(hpOf(master, aliceId)).toBe(50);
  });
});

describe("an offered sheet", () => {
  const sheetId = `self:${CAROL}`;

  // Ownership moves when a player opens the arriving character.
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

    // DM-brought sheet, unlike a player's own character: stays in the fight,
    // reverts to the DM's client, still offered for the next pickup.
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

// Per-lane merge: two writes to the same row from the same revision must
// both survive rather than one clobbering the other.
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
    const { broker } = crossed();
    const settled = broker.traffic.length;
    expect(settled).toBeLessThan(30);
    expect(broker.traffic.length).toBe(settled);
  });

  // Same-lane writes are ambiguous; the only promise is everyone picks the same one.
  it("still lets the loser's lane lose when it is the same lane", () => {
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

// round + turnIndex are one atomic pair on `turnSeq`.
describe("the fight's position under concurrent writes", () => {
  const fighting = () => {
    const t = table();
    t.master.edit(startCombat);
    return t;
  };

  it("collapses two crossed turn advances into one", () => {
    const { broker, master, alice, bob } = fighting();
    const before = master.encounter.turnIndex;
    broker.crossing(() => {
      master.edit((c) => advanceTurn(c).encounter);
      alice.edit((c) => advanceTurn(c).encounter);
    });
    for (const client of [master, alice, bob]) {
      expect(client.encounter.turnIndex).toBe(
        (before + 1) % client.encounter.participants.length,
      );
      expect(client.encounter.round).toBe(1);
    }
  });

  it("keeps a reseat and an advance when they cross", () => {
    const { broker, master, alice, bob } = fighting();
    const bobRow = `self:${BOB}`;
    broker.crossing(() => {
      master.edit((c) => setInitiative(c, bobRow, 21));
      alice.edit((c) => advanceTurn(c).encounter);
    });
    for (const client of [master, alice, bob]) {
      expect(
        client.encounter.participants.find((p) => p.id === bobRow)?.initiative,
      ).toBe(21);
      expect(client.encounter.turnIndex).toBe(1);
      expect(client.encounter.participants).toEqual(
        master.encounter.participants,
      );
    }
  });
});

// Any two of a row's five lanes must both survive a simultaneous write.
describe("other lane pairs crossing on one row", () => {
  const aliceRow = `self:${ALICE}`;
  const row = (c: SimClient) =>
    c.encounter.participants.find((p) => p.id === aliceRow)!;

  it("keeps a reseat and a ticked action", () => {
    const { broker, master, alice, bob } = table();
    broker.crossing(() => {
      master.edit((c) => setInitiative(c, aliceRow, 18));
      alice.edit((c) => setSpent(c, aliceRow, "action", true));
    });
    for (const client of [master, alice, bob]) {
      expect(row(client).initiative).toBe(18);
      expect(row(client).spent.action).toBe(true);
    }
  });

  it("keeps a hide and a concentration", () => {
    const { broker, master, alice, bob } = table();
    broker.crossing(() => {
      master.edit((c) => setHidden(c, aliceRow, true));
      alice.edit((c) =>
        setConcentration(c, aliceRow, { spell: "Bless", startedRound: 1 }),
      );
    });
    for (const client of [master, alice, bob]) {
      expect(row(client).hidden).toBe(true);
      expect(row(client).concentration?.spell).toBe("Bless");
    }
  });
});

describe("policy racing the seat", () => {
  it("keeps both the sharing change and the released seat", () => {
    const { broker, master, alice, bob } = table();
    broker.crossing(() => {
      master.edit(releaseDmSeat);
      alice.edit((c) => setSharing(c, "exact"));
    });
    for (const client of [master, alice, bob]) {
      expect(client.encounter.dmClientId).toBeUndefined();
      expect(client.encounter.dmToken).toBeUndefined();
      expect(client.encounter.sharing).toBe("exact");
    }
  });
});

// Roster resurrection on rejoin is scoped to your own rows only.
describe("the roster's resurrection boundary", () => {
  it("does not let a stale peer bring back a monster the DM removed", () => {
    const { broker, master, alice } = table();
    master.edit((c) =>
      addParticipant(c, { id: "goblin", name: "Goblin", initiative: 3 }),
    );
    // Snapshot from before the removal, as a crashed tab would hold.
    const stale = alice.encounter;
    master.edit((c) => removeParticipant(c, "goblin"));
    expect(master.participantNames).not.toContain("Goblin");

    // Stale copy carries a lower revision and loses.
    broker.publish(
      stamp({ kind: "state", clientId: "stranger", encounter: stale }),
    );
    expect(master.participantNames).not.toContain("Goblin");
    expect(alice.participantNames).not.toContain("Goblin");
  });
});

describe("an economy edit crossing a leave", () => {
  it("still removes the leaver everywhere, without a storm", () => {
    const { broker, master, alice, bob } = table();
    const bobRow = `self:${BOB}`;
    broker.crossing(() => {
      master.edit((c) => setSpent(c, bobRow, "action", true));
      bob.leave();
    });
    expect(master.participantNames).toEqual(["Alice"]);
    expect(alice.participantNames).toEqual(["Alice"]);
    const settled = broker.traffic.length;
    expect(settled).toBeLessThan(40);
    expect(broker.traffic.length).toBe(settled);
  });
});

// The seat is its own lane, same as vitals.
describe("the DM seat against a peer who never heard of it", () => {
  // A joiner's state before the room's first reply: everything else about the
  // fight, no idea there's a DM.
  const seatless = (encounter: Encounter, revision: number) => ({
    ...encounter,
    dmClientId: undefined,
    dmToken: undefined,
    seatRev: undefined,
    revision,
    revisedBy: "stranger",
  });

  it("is not erased by a state that simply predates it", () => {
    const { broker, master, alice } = table();
    expect(master.isDm).toBe(true);
    broker.publish(
      stamp({
        kind: "state",
        clientId: "stranger",
        // High enough revision to win the coarse race outright.
        encounter: seatless(
          master.encounter,
          (master.encounter.revision ?? 0) + 5,
        ),
      }),
    );
    expect(master.isDm).toBe(true);
    expect(alice.encounter.dmClientId).toBe(master.clientId);
  });

  // reclaimDmSeat matches on dmToken; losing it is unrecoverable.
  it("keeps the token, so the seat stays recoverable rather than merely unheld", () => {
    const { broker, master } = table();
    broker.publish(
      stamp({
        kind: "state",
        clientId: "stranger",
        encounter: seatless(
          master.encounter,
          (master.encounter.revision ?? 0) + 5,
        ),
      }),
    );
    expect(master.encounter.dmToken).toBe("dm-token");
  });

  // A release carries a newer seatRev and wins the lane.
  it("still goes when its holder gives it up on purpose", () => {
    const { master, alice } = table();
    master.edit(releaseDmSeat);
    expect(master.isDm).toBe(false);
    expect(alice.encounter.dmClientId).toBeUndefined();
    expect(alice.encounter.dmToken).toBeUndefined();
  });
});
