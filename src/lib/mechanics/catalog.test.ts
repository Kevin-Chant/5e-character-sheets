import { describe, expect, it } from "vitest";
import { Character, LimitedUseAbility } from "src/lib/types";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  StandardDie,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import {
  classDamageRiders,
  FEATURE_MECHANICS,
  mechanicsForAbility,
  mechanicsForTitle,
  RACE_MECHANICS,
  SLOT_CREATION_COSTS,
} from "./catalog";

describe("catalog integrity", () => {
  it("slot creation costs follow the PHB table and stop at 5th", () => {
    expect(SLOT_CREATION_COSTS).toEqual({ 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 });
    expect(SLOT_CREATION_COSTS[6]).toBeUndefined();
  });

  it("keys are already normalized (lower-case, trimmed)", () => {
    for (const key of [
      ...Object.keys(FEATURE_MECHANICS),
      ...Object.keys(RACE_MECHANICS),
    ]) {
      expect(key).toBe(key.trim().toLowerCase());
    }
  });

  it("looks up titles case-insensitively", () => {
    expect(mechanicsForTitle(" Second Wind ")).toBe(
      FEATURE_MECHANICS["second wind"],
    );
    expect(mechanicsForTitle("Unknown Homebrew Thing")).toBeUndefined();
  });

  it("aliased titles reach the same entries", () => {
    expect(mechanicsForTitle("Sorcery Points")).toBe(
      mechanicsForTitle("Font of Magic"),
    );
    expect(mechanicsForTitle("Flexible Casting")).toBe(
      mechanicsForTitle("Sorcery Points"),
    );
    expect(mechanicsForTitle("Natural Recovery")).toBe(
      mechanicsForTitle("Arcane Recovery"),
    );
    // The battle master's die and the Martial Adept feat's die differ.
    expect(mechanicsForTitle("Superiority Dice")).not.toBe(
      mechanicsForTitle("Superiority Die"),
    );
  });

  it("an ability's own mechanics field beats the catalog title match", () => {
    const homebrew: LimitedUseAbility = {
      info: { title: "Second Wind", titleFormulas: [] },
      maxUses: 1,
      recharge: "short",
      expended: 0,
      mechanics: { actions: [] },
    };
    expect(mechanicsForAbility(homebrew)).toBe(homebrew.mechanics);
    expect(mechanicsForAbility({ ...homebrew, mechanics: undefined })).toBe(
      FEATURE_MECHANICS["second wind"],
    );
  });

  it("grant-name keys exist for the pools feats create", () => {
    // These names come from src/lib/data/feats.ts `grants.limitedUse.name`.
    for (const name of [
      "Chef's Treats",
      "Luck Points",
      "Superiority Die",
      "Sorcery Points",
    ]) {
      expect(mechanicsForTitle(name), name).toBeDefined();
    }
  });

  it("Ki carries a Stunning Strike action", () => {
    const ki = mechanicsForTitle("Ki");
    expect(ki?.actions?.map((a) => a.name)).toContain("Stunning Strike");
  });

  it("Stroke of Luck and the new barbarian riders are catalogued", () => {
    expect(mechanicsForTitle("Stroke of Luck")?.actions).toHaveLength(1);
    expect(mechanicsForTitle("Reckless Attack")?.riders?.[0].appliesTo).toEqual(
      ["attack"],
    );
    expect(mechanicsForTitle("Danger Sense")?.riders?.[0].appliesTo).toEqual([
      "check",
    ]);
  });

  it("every action carries an action-economy cost and unique id per entry", () => {
    for (const [key, entry] of Object.entries(FEATURE_MECHANICS)) {
      const ids = new Set<string>();
      for (const action of entry.actions ?? []) {
        expect(action.cost, `${key}/${action.id}`).toBeTruthy();
        expect(ids.has(action.id), `${key}/${action.id} duplicated`).toBe(
          false,
        );
        ids.add(action.id);
        // `special` costs must explain themselves.
        if (action.cost === "special")
          expect(action.costNote, `${key}/${action.id} costNote`).toBeTruthy();
      }
    }
  });

  it("actions with chosen-level or chosen-amount effects declare the picker", () => {
    for (const [key, entry] of Object.entries(FEATURE_MECHANICS)) {
      for (const action of entry.actions ?? []) {
        const needsLevel = action.effects.some(
          (ef) =>
            ("amount" in ef &&
              ef.amount &&
              ("chosenLevel" in ef.amount || "byChosenLevel" in ef.amount)) ||
            ((ef.effect === "expendSlot" || ef.effect === "restoreSlot") &&
              ef.level === undefined),
        );
        const needsAmount = action.effects.some(
          (ef) =>
            "amount" in ef &&
            ef.amount &&
            ("chosenAmount" in ef.amount || "chosenAmountDice" in ef.amount),
        );
        if (needsLevel)
          expect(action.choose?.slotLevel, `${key}/${action.id}`).toBeTruthy();
        if (needsAmount)
          expect(action.choose?.amount, `${key}/${action.id}`).toBe("uses");
      }
    }
  });
});

// The ranger archetype strikes are the only riders that scale on class level
// *and* gate on the subclass, so they're baked at roll time rather than living
// in the title-keyed map. Two of the three step their die at 11th and one steps
// its count, which is the part worth pinning down.
describe("ranger archetype strikes", () => {
  const ranger = (subclass: string, level: number): Character => {
    const c = structuredClone(defaultCharacter);
    c.class = [
      {
        id: randomUUID(),
        name: OfficialClass.Ranger,
        level,
        subclass,
      },
    ];
    return c;
  };

  const strike = (subclass: string, level: number) =>
    classDamageRiders(ranger(subclass, level)).find((r) =>
      ["Dreadful Strikes", "Planar Warrior", "Gathered Swarm"].includes(
        r.source,
      ),
    );

  const amountOf = (subclass: string, level: number) => {
    const rider = strike(subclass, level);
    if (rider?.rider.rider !== "extraDamage") return undefined;
    return rider.rider.amount;
  };

  it("offers nothing before 3rd level", () => {
    expect(strike("Gloom Stalker", 2)).toBeUndefined();
    expect(strike("Fey Wanderer", 2)).toBeUndefined();
  });

  it("offers nothing for an archetype without a scaled strike", () => {
    expect(strike("Hunter", 11)).toBeUndefined();
    expect(strike("Beast Master", 11)).toBeUndefined();
  });

  it("steps the die at 11th for Dreadful Strikes and Gathered Swarm", () => {
    expect(amountOf("Fey Wanderer", 3)).toEqual([
      1,
      StandardDie.d4,
      DieOperation.roll,
    ]);
    expect(amountOf("Fey Wanderer", 11)).toEqual([
      1,
      StandardDie.d6,
      DieOperation.roll,
    ]);
    expect(amountOf("Swarmkeeper", 10)).toEqual([
      1,
      StandardDie.d6,
      DieOperation.roll,
    ]);
    expect(amountOf("Swarmkeeper", 11)).toEqual([
      1,
      StandardDie.d8,
      DieOperation.roll,
    ]);
  });

  it("steps the count at 11th for Planar Warrior", () => {
    expect(amountOf("Horizon Walker", 10)).toEqual([
      1,
      StandardDie.d8,
      DieOperation.roll,
    ]);
    expect(amountOf("Horizon Walker", 11)).toEqual([
      2,
      StandardDie.d8,
      DieOperation.roll,
    ]);
  });

  it("types each strike and keeps them opt-in", () => {
    for (const [subclass, type] of [
      ["Fey Wanderer", DamageType.Psychic],
      ["Horizon Walker", DamageType.Force],
      ["Swarmkeeper", DamageType.Piercing],
    ] as const) {
      const rider = strike(subclass, 11);
      if (rider?.rider.rider !== "extraDamage") throw new Error("no rider");
      expect(rider.rider.damageType).toBe(type);
      expect(rider.rider.optional).toBe(true);
      expect(rider.rider.oncePerTurn).toBe(true);
    }
  });
});
