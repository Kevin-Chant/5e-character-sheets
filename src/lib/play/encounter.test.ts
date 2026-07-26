import { describe, expect, it } from "vitest";
import {
  addCondition,
  addParticipant,
  advanceTurn,
  claimParticipant,
  currentParticipant,
  EMPTY_ENCOUNTER,
  Encounter,
  endCombat,
  isInCombat,
  removeParticipant,
  setConcentration,
  setSpent,
  startCombat,
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
    // A fight ending is not a rest — you're still poisoned afterwards.
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
    // Everything Maelina spent on her turn, reaction included.
    encounter = setSpent(encounter, "b", "action", true);
    encounter = setSpent(encounter, "b", "reaction", true);
    // Brakka's turn, then round the order back to Maelina.
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

    // Brakka's turn: 2 → 1, still held.
    let step = advanceTurn(encounter);
    expect(
      step.encounter.participants.find((p) => p.id === "a")?.conditions,
    ).toEqual([{ name: "Frightened", rounds: 1 }]);
    expect(step.expired).toEqual([]);

    // Round back to Brakka: 1 → 0, gone, and reported so the UI can say so.
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
    // Order is Maelina, Brakka, Goblin — advance to Brakka.
    encounter = advanceTurn(encounter).encounter;
    expect(currentParticipant(encounter)?.name).toBe("Brakka");
    // Maelina drops out from *before* the current turn.
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
  // A DM brings a party sheet into the order; its player then opens it. Both
  // derive the participant id from the character uuid, and the fight should
  // contain one of them.
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

  // Ownership decides whose vitals are authoritative and who takes the
  // participant with them on the way out, so it has to follow the open sheet
  // rather than whoever happened to type the name in first.
  it("hands ownership to the client that opened the sheet", () => {
    const brought = addParticipant(EMPTY_ENCOUNTER, {
      id: "self:x",
      name: "Maelina",
      ownerClientId: "dm",
      initiative: 0,
    });
    const claimed = claimParticipant(brought, "self:x", "player");
    expect(claimed.participants[0].ownerClientId).toBe("player");
    // Claiming what you already own changes nothing, so an effect can call it
    // on every render without producing a broadcast.
    expect(claimParticipant(claimed, "self:x", "player")).toBe(claimed);
  });
});
