import { describe, expect, it } from "vitest";
import {
  addCondition,
  addParticipant,
  advanceTurn,
  applyDamage,
  applyHealing,
  claimParticipant,
  clearFallen,
  currentParticipant,
  DEFAULT_SHARING,
  EMPTY_ENCOUNTER,
  fallenParticipants,
  healthDescriptor,
  Encounter,
  endCombat,
  isInCombat,
  removeParticipant,
  reseatParticipant,
  setConcentration,
  setHidden,
  setHideDeathSaves,
  setSharing,
  setSpent,
  setVitals,
  startCombat,
  visibleParticipants,
  isFoe,
  setSide,
  vitalsVisibility,
} from "src/lib/play/encounter";

function roster(): Encounter {
  let encounter = EMPTY_ENCOUNTER;
  encounter = addParticipant(encounter, {
    id: "a",
    name: "Brakka",
    initiative: 12,
  });
  encounter = addParticipant(encounter, {
    id: "b",
    name: "Maelina",
    initiative: 19,
  });
  encounter = addParticipant(encounter, {
    id: "c",
    name: "Goblin",
    initiative: 7,
  });
  return encounter;
}

describe("starting and ending combat", () => {
  it("sorts into initiative order, highest first", () => {
    const encounter = startCombat(roster());
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Brakka",
      "Goblin",
    ]);
    expect(encounter.round).toBe(1);
    expect(currentParticipant(encounter)?.name).toBe("Maelina");
  });

  it("treats round 0 as not being in a fight", () => {
    expect(isInCombat(EMPTY_ENCOUNTER)).toBe(false);
    expect(isInCombat(startCombat(roster()))).toBe(true);
  });

  it("keeps conditions when the fight ends but clears the turn economy", () => {
    let encounter = startCombat(roster());
    encounter = addCondition(encounter, "a", { name: "Poisoned" });
    encounter = setSpent(encounter, "a", "action", true);
    encounter = endCombat(encounter);
    const brakka = encounter.participants.find((p) => p.id === "a");
    expect(brakka?.conditions.map((c) => c.name)).toEqual(["Poisoned"]);
    expect(brakka?.spent.action).toBe(false);
    expect(encounter.round).toBe(0);
  });
});

describe("advancing turns", () => {
  it("moves through the order and increments the round on wrap", () => {
    const encounter = startCombat(roster());
    expect(currentParticipant(encounter)?.name).toBe("Maelina");

    let step = advanceTurn(encounter);
    expect(step.newRound).toBe(false);
    expect(currentParticipant(step.encounter)?.name).toBe("Brakka");

    step = advanceTurn(step.encounter);
    expect(currentParticipant(step.encounter)?.name).toBe("Goblin");
    expect(step.encounter.round).toBe(1);

    step = advanceTurn(step.encounter);
    expect(step.newRound).toBe(true);
    expect(step.encounter.round).toBe(2);
    expect(currentParticipant(step.encounter)?.name).toBe("Maelina");
  });

  it("refreshes the incoming participant's economy, including the reaction", () => {
    let encounter = startCombat(roster());
    encounter = setSpent(encounter, "b", "action", true);
    encounter = setSpent(encounter, "b", "reaction", true);
    let step = advanceTurn(encounter);
    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    const maelina = step.encounter.participants.find((p) => p.id === "b");
    expect(maelina?.spent).toEqual({
      action: false,
      bonusAction: false,
      reaction: false,
    });
  });

  it("ticks a condition down at the start of its bearer's turn and reports expiry", () => {
    let encounter = startCombat(roster());
    encounter = addCondition(encounter, "a", { name: "Frightened", rounds: 2 });

    let step = advanceTurn(encounter);
    expect(
      step.encounter.participants.find((p) => p.id === "a")?.conditions,
    ).toEqual([{ name: "Frightened", rounds: 1 }]);
    expect(step.expired).toEqual([]);

    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    expect(
      step.encounter.participants.find((p) => p.id === "a")?.conditions,
    ).toEqual([]);
    expect(step.expired).toEqual(["Frightened"]);
  });

  it("leaves an open-ended condition alone", () => {
    let encounter = startCombat(roster());
    encounter = addCondition(encounter, "a", { name: "Prone" });
    let step = advanceTurn(encounter);
    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    expect(
      step.encounter.participants.find((p) => p.id === "a")?.conditions,
    ).toEqual([{ name: "Prone" }]);
  });

  it("does nothing outside combat", () => {
    const encounter = roster();
    expect(advanceTurn(encounter).encounter).toBe(encounter);
  });
});

describe("roster edits mid-fight", () => {
  it("keeps the current turn on the same participant when an earlier one leaves", () => {
    let encounter = startCombat(roster());
    encounter = advanceTurn(encounter).encounter;
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
    encounter = removeParticipant(encounter, "b");
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
  });

  it("re-applying a condition refreshes it instead of stacking a duplicate", () => {
    let encounter = startCombat(roster());
    encounter = addCondition(encounter, "a", { name: "Poisoned", rounds: 1 });
    encounter = addCondition(encounter, "a", { name: "Poisoned", rounds: 10 });
    expect(
      encounter.participants.find((p) => p.id === "a")?.conditions,
    ).toEqual([{ name: "Poisoned", rounds: 10 }]);
  });

  it("tracks concentration per participant", () => {
    let encounter = startCombat(roster());
    encounter = setConcentration(encounter, "b", {
      spell: "Haste",
      startedRound: 1,
    });
    expect(
      encounter.participants.find((p) => p.id === "b")?.concentration?.spell,
    ).toBe("Haste");
    encounter = setConcentration(encounter, "b", undefined);
    expect(
      encounter.participants.find((p) => p.id === "b")?.concentration,
    ).toBeUndefined();
  });
});

describe("contributing the same character twice", () => {
  it("adds a duplicate id as a no-op", () => {
    const brought = addParticipant(EMPTY_ENCOUNTER, {
      id: "self:x",
      name: "Maelina",
      ownerClientId: "dm",
      initiative: 0,
    });
    const again = addParticipant(brought, {
      id: "self:x",
      name: "Maelina",
      ownerClientId: "player",
      initiative: 0,
    });
    expect(again).toBe(brought);
    expect(again.participants).toHaveLength(1);
  });

  it("hands ownership to the client that opened the sheet", () => {
    const brought = addParticipant(EMPTY_ENCOUNTER, {
      id: "self:x",
      name: "Maelina",
      ownerClientId: "dm",
      initiative: 0,
    });
    const claimed = claimParticipant(brought, "self:x", "player");
    expect(claimed.participants[0].ownerClientId).toBe("player");
    // No-op when already owned, so a per-render effect can call it safely.
    expect(claimParticipant(claimed, "self:x", "player")).toBe(claimed);
  });
});

describe("clearing the fallen", () => {
  it("removes only hand-typed combatants at zero HP", () => {
    let encounter = addParticipant(EMPTY_ENCOUNTER, {
      id: "self:x",
      name: "Maelina",
      characterUuid: "00000000-0000-0000-0000-000000000000",
      initiative: 19,
    });
    encounter = addParticipant(encounter, {
      id: "g1",
      name: "Goblin 1",
      initiative: 7,
    });
    encounter = addParticipant(encounter, {
      id: "g2",
      name: "Goblin 2",
      initiative: 7,
    });
    encounter = setVitals(encounter, "self:x", {
      currHp: 0,
      maxHp: 20,
      ac: 12,
    });
    encounter = setVitals(encounter, "g1", { currHp: 0, maxHp: 7, ac: 0 });
    encounter = setVitals(encounter, "g2", { currHp: 3, maxHp: 7, ac: 0 });

    expect(fallenParticipants(encounter).map((p) => p.id)).toEqual(["g1"]);
    const swept = clearFallen(encounter);
    expect(swept.participants.map((p) => p.id)).toEqual(["self:x", "g2"]);
  });

  it("leaves untracked combatants alone", () => {
    const encounter = addParticipant(EMPTY_ENCOUNTER, {
      id: "g1",
      name: "Goblin",
      initiative: 7,
    });
    expect(fallenParticipants(encounter)).toEqual([]);
    expect(clearFallen(encounter)).toBe(encounter);
  });

  it("keeps the turn on whoever is acting", () => {
    let encounter = addParticipant(EMPTY_ENCOUNTER, {
      id: "g1",
      name: "Goblin",
      initiative: 20,
    });
    encounter = addParticipant(encounter, {
      id: "a",
      name: "Brakka",
      initiative: 12,
    });
    encounter = setVitals(encounter, "g1", { currHp: 0, maxHp: 7, ac: 0 });
    encounter = startCombat(encounter);
    encounter = advanceTurn(encounter).encounter;
    const swept = clearFallen(encounter);
    expect(currentParticipant(swept)?.id).toBe("a");
  });
});

describe("joining a fight already in progress", () => {
  it("splices a newcomer into initiative position, not the end", () => {
    let encounter = startCombat(roster());
    encounter = addParticipant(encounter, {
      id: "d",
      name: "Ogre",
      initiative: 15,
    });
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Ogre",
      "Brakka",
      "Goblin",
    ]);
    expect(currentParticipant(encounter)?.name).toBe("Maelina");
  });

  it("keeps the current actor current when the newcomer's count already passed", () => {
    let encounter = advanceTurn(startCombat(roster())).encounter;
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
    encounter = addParticipant(encounter, {
      id: "d",
      name: "Assassin",
      initiative: 19,
    });
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Assassin",
      "Brakka",
      "Goblin",
    ]);
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
    let step = advanceTurn(encounter);
    step = advanceTurn(step.encounter);
    step = advanceTurn(step.encounter);
    expect(currentParticipant(step.encounter)?.name).toBe("Assassin");
  });

  it("a tie goes after everyone already holding that count", () => {
    let encounter = startCombat(roster());
    encounter = addParticipant(encounter, {
      id: "d",
      name: "Wolf",
      initiative: 12,
    });
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Brakka",
      "Wolf",
      "Goblin",
    ]);
  });

  it("the lowest roll still goes last", () => {
    let encounter = startCombat(roster());
    encounter = addParticipant(encounter, {
      id: "d",
      name: "Zombie",
      initiative: 1,
    });
    expect(encounter.participants.at(-1)?.name).toBe("Zombie");
    expect(currentParticipant(encounter)?.name).toBe("Maelina");
  });

  it("still appends out of combat, where display order is sorted anyway", () => {
    const encounter = addParticipant(roster(), {
      id: "d",
      name: "Ogre",
      initiative: 15,
    });
    expect(encounter.participants.at(-1)?.name).toBe("Ogre");
  });
});

describe("re-seating an initiative mid-fight", () => {
  it("moves the row to where the new number says", () => {
    let encounter = startCombat(roster());
    encounter = reseatParticipant(encounter, "c", 15);
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Goblin",
      "Brakka",
    ]);
    expect(currentParticipant(encounter)?.name).toBe("Maelina");
  });

  it("keeps the current actor current when a row moves past them", () => {
    let encounter = advanceTurn(startCombat(roster())).encounter;
    encounter = reseatParticipant(encounter, "c", 21);
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Goblin",
      "Maelina",
      "Brakka",
    ]);
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
  });

  it("keeps the moved row current when it is the one acting", () => {
    let encounter = advanceTurn(startCombat(roster())).encounter;
    encounter = reseatParticipant(encounter, "a", 1);
    expect(encounter.participants.map((p) => p.name)).toEqual([
      "Maelina",
      "Goblin",
      "Brakka",
    ]);
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
  });

  it("is a plain initiative write out of combat", () => {
    const encounter = reseatParticipant(roster(), "c", 21);
    expect(encounter.participants.find((p) => p.id === "c")?.initiative).toBe(
      21,
    );
    expect(encounter.participants.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("staging hidden combatants", () => {
  it("hides and reveals without touching anything else", () => {
    let encounter = roster();
    encounter = setHidden(encounter, "c", true);
    expect(encounter.participants.find((p) => p.id === "c")?.hidden).toBe(true);
    expect(
      visibleParticipants(encounter.participants).map((p) => p.id),
    ).toEqual(["a", "b"]);
    expect(encounter.participants.map((p) => p.id)).toEqual(["a", "b", "c"]);
    encounter = setHidden(encounter, "c", false);
    expect(visibleParticipants(encounter.participants)).toHaveLength(3);
  });

  it("no-ops on a repeat or a missing id", () => {
    const encounter = setHidden(roster(), "c", true);
    expect(setHidden(encounter, "c", true)).toBe(encounter);
    expect(setHidden(encounter, "ghost", true)).toBe(encounter);
  });
});

describe("which side a row fights for", () => {
  it("reads a sheetless row as a foe and a sheet-backed one as party", () => {
    const encounter = roster();
    const goblin = encounter.participants.find((p) => p.id === "c")!;
    expect(isFoe(goblin)).toBe(true);
    expect(isFoe({ ...goblin, characterUuid: "0-0-0-0-0" as never })).toBe(
      false,
    );
  });

  it("lets the DM's explicit side override the heuristic both ways", () => {
    let encounter = roster();
    encounter = setSide(encounter, "c", "party");
    const ally = encounter.participants.find((p) => p.id === "c")!;
    expect(isFoe(ally)).toBe(false);
    expect(
      isFoe({
        ...ally,
        side: "foe",
        characterUuid: "0-0-0-0-0" as never,
      }),
    ).toBe(true);
  });

  it("writes on the identity lane, and no-ops on a repeat or a ghost", () => {
    const encounter = setSide(roster(), "c", "party");
    expect(encounter.participants.find((p) => p.id === "c")?.identityRev).toBe(
      1,
    );
    expect(setSide(encounter, "c", "party")).toBe(encounter);
    expect(setSide(encounter, "ghost", "party")).toBe(encounter);
  });
});

describe("damage as a delta", () => {
  it("drains temporary hit points before current", () => {
    const hit = applyDamage({ currHp: 20, maxHp: 20, ac: 15, tempHp: 5 }, 8);
    expect(hit).toEqual({ currHp: 17, maxHp: 20, ac: 15, tempHp: 0 });
  });

  it("stops at zero and treats absent temp HP as none", () => {
    expect(applyDamage({ currHp: 3, maxHp: 20, ac: 15 }, 10).currHp).toBe(0);
    expect(applyDamage({ currHp: 3, maxHp: 20, ac: 15 }, 10).tempHp).toBe(0);
  });

  it("absorbs entirely within temp HP when it covers the hit", () => {
    const hit = applyDamage({ currHp: 20, maxHp: 20, ac: 15, tempHp: 12 }, 7);
    expect(hit.currHp).toBe(20);
    expect(hit.tempHp).toBe(5);
  });
});

describe("death saves in the projection", () => {
  it("setVitals treats a death-save change as a real change", () => {
    let encounter = roster();
    const base = { currHp: 0, maxHp: 20, ac: 15 };
    encounter = setVitals(encounter, "a", base);
    const withSaves = setVitals(encounter, "a", {
      ...base,
      deathSaves: { successes: 1, failures: 0 },
    });
    expect(withSaves).not.toBe(encounter);
    // And an identical write is still a no-op.
    expect(
      setVitals(withSaves, "a", {
        ...base,
        deathSaves: { successes: 1, failures: 0 },
      }),
    ).toBe(withSaves);
  });

  it("the hide toggle is table policy with a no-op guard", () => {
    const encounter = roster();
    expect(setHideDeathSaves(encounter, false)).toBe(encounter);
    const hidden = setHideDeathSaves(encounter, true);
    expect(hidden.hideDeathSaves).toBe(true);
    expect(setHideDeathSaves(hidden, true)).toBe(hidden);
  });
});

describe("healing as a delta", () => {
  it("clamps to the maximum and leaves temp HP alone", () => {
    const healed = applyHealing(
      { currHp: 14, maxHp: 20, ac: 15, tempHp: 3 },
      10,
    );
    expect(healed).toEqual({ currHp: 20, maxHp: 20, ac: 15, tempHp: 3 });
  });

  it("ignores nonsense amounts", () => {
    const vitals = { currHp: 14, maxHp: 20, ac: 15 };
    expect(applyHealing(vitals, -5).currHp).toBe(14);
  });
});

describe("the sharing policy", () => {
  it("maps each level onto ally and enemy visibility", () => {
    expect(vitalsVisibility("exact", true)).toBe("exact");
    expect(vitalsVisibility("exact", false)).toBe("exact");
    expect(vitalsVisibility("bloodied-enemies", true)).toBe("exact");
    expect(vitalsVisibility("bloodied-enemies", false)).toBe("descriptor");
    expect(vitalsVisibility("bloodied", true)).toBe("descriptor");
    expect(vitalsVisibility("private", true)).toBe("none");
    // Absent means the default.
    expect(vitalsVisibility(undefined, false)).toBe(
      vitalsVisibility(DEFAULT_SHARING, false),
    );
  });

  it("reads health the way a table calls it out", () => {
    expect(healthDescriptor({ currHp: 20, maxHp: 20, ac: 0 })).toBe("Healthy");
    expect(healthDescriptor({ currHp: 10, maxHp: 20, ac: 0 })).toBe("Bloodied");
    expect(healthDescriptor({ currHp: 0, maxHp: 20, ac: 0 })).toBe("Down");
  });

  it("writes the policy onto the encounter, no-op on a repeat", () => {
    const tightened = setSharing(EMPTY_ENCOUNTER, "private");
    expect(tightened.sharing).toBe("private");
    expect(setSharing(tightened, "private")).toBe(tightened);
    // The default level is also a no-op on a fresh encounter.
    expect(setSharing(EMPTY_ENCOUNTER, DEFAULT_SHARING)).toBe(EMPTY_ENCOUNTER);
  });
});
