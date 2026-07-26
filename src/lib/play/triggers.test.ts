import { describe, expect, it } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import {
  hasTriggerFor,
  matchesTrigger,
  planTrigger,
} from "src/lib/play/triggers";

function text(title: string) {
  return { title, titleFormulas: [] };
}

function characterWith(
  abilities: {
    title: string;
    recharge: string;
    max: number;
    expended: number;
  }[],
): Character {
  const character = structuredClone(defaultCharacter) as Character;
  character.limitedUseAbilities = abilities.map((a) => ({
    info: text(a.title),
    maxUses: a.max,
    recharge: a.recharge,
    expended: a.expended,
  })) as Character["limitedUseAbilities"];
  return character;
}

describe("matchesTrigger", () => {
  it("matches the phrasings the catalogs actually use", () => {
    expect(matchesTrigger("Dawn", "dawn")).toBe(true);
    expect(matchesTrigger("Initiative", "combatStart")).toBe(true);
    expect(matchesTrigger("When you roll initiative", "combatStart")).toBe(
      true,
    );
    expect(matchesTrigger("Start of your turn", "startOfTurn")).toBe(true);
    expect(matchesTrigger("End of each of your turns", "endOfTurn")).toBe(true);
  });

  it("does not fire on an unrelated event", () => {
    expect(matchesTrigger("Dawn", "combatStart")).toBe(false);
    expect(matchesTrigger("Initiative", "dawn")).toBe(false);
  });

  // The rest planner owns rest triggers. A homebrew "Long rest or dawn" must
  // not be restored by both planners.
  it("leaves rest triggers to the rest planner", () => {
    expect(matchesTrigger("Long Rest", "dawn")).toBe(false);
    expect(matchesTrigger("Short Rest", "combatStart")).toBe(false);
    expect(matchesTrigger("Long rest or dawn", "dawn")).toBe(false);
  });

  it("ignores an empty trigger", () => {
    expect(matchesTrigger("", "dawn")).toBe(false);
  });
});

describe("planTrigger", () => {
  it("restores a matching pool and accounts for it", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 3 },
    ]);
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toHaveLength(1);
    expect(plan.changes).toEqual([
      { key: "ability:0", label: "Arcane Ward", detail: "Restored 3 of 4" },
    ]);
  });

  it("leaves pools that listen for a different event alone", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 3 },
      { title: "Relentless", recharge: "Initiative", max: 1, expended: 1 },
    ]);
    expect(planTrigger(character, "combatStart").changes).toEqual([
      { key: "ability:1", label: "Relentless", detail: "Restored 1 of 1" },
    ]);
  });

  // A receipt that lists things which didn't change is how the rest panel's
  // first version told a hurt player "nothing to restore".
  it("says nothing about a pool that is already full", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 0 },
    ]);
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toEqual([]);
    expect(plan.changes).toEqual([]);
  });

  it("knows whether a character listens for an event at all", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 0 },
    ]);
    // True even when full — the control should exist, it just does nothing yet.
    expect(hasTriggerFor(character, "dawn")).toBe(true);
    expect(hasTriggerFor(character, "combatStart")).toBe(false);
  });
});
