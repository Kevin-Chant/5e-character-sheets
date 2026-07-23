import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { Character, CustomFormula, DieExpression } from "src/lib/types";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  critDiceCount,
  damageHasDice,
  formulaHasDice,
  rollD20Check,
  rollDamage,
  rollFormula,
} from "./roll";

const roll = (count: number, die: StandardDie): DieExpression => [
  count,
  die,
  DieOperation.roll,
];

describe("formulaHasDice", () => {
  it("detects dice anywhere in the tree", () => {
    expect(formulaHasDice(roll(1, StandardDie.d6))).toBe(true);
    expect(
      formulaHasDice({
        operation: Operation.addition,
        operands: [roll(2, StandardDie.d8), StatKey.str],
      }),
    ).toBe(true);
  });

  it("is false for diceless formulas", () => {
    expect(formulaHasDice(5)).toBe(false);
    expect(formulaHasDice(StatKey.dex)).toBe(false);
    expect(
      formulaHasDice({
        operation: Operation.addition,
        operands: [StatKey.dex, "proficiencyBonus"],
      }),
    ).toBe(false);
  });

  it("damageHasDice checks every component", () => {
    expect(damageHasDice({ [DamageType.Fire]: roll(8, StandardDie.d6) })).toBe(
      true,
    );
    expect(damageHasDice({ [DamageType.Fire]: 3 })).toBe(false);
  });
});

describe("rollFormula", () => {
  it("keeps every roll within the die's bounds and collects the dice", () => {
    const character = structuredClone(defaultCharacter) as Character;
    for (let i = 0; i < 200; i++) {
      const dice: number[] = [];
      const total = rollFormula(roll(3, StandardDie.d6), character, dice);
      expect(dice).toHaveLength(3);
      expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true);
      expect(total).toBe(dice.reduce((a, b) => a + b, 0));
      expect(total).toBeGreaterThanOrEqual(3);
      expect(total).toBeLessThanOrEqual(18);
    }
  });

  it("adds resolved non-dice leaves (stat modifier) to the roll", () => {
    const character = structuredClone(defaultCharacter) as Character;
    character.stats.str = 20; // +5
    const formula: CustomFormula = {
      operation: Operation.addition,
      operands: [roll(1, StandardDie.d8), StatKey.str],
    };
    for (let i = 0; i < 100; i++) {
      const total = rollFormula(formula, character);
      // 1d8 (1..8) + 5 → 6..13
      expect(total).toBeGreaterThanOrEqual(6);
      expect(total).toBeLessThanOrEqual(13);
    }
  });

  it("keeps within bounds and adds the modifier for a d20 check", () => {
    for (let i = 0; i < 200; i++) {
      const r = rollD20Check(5, "normal");
      expect(r.dice).toHaveLength(1);
      expect(r.kept).toBeGreaterThanOrEqual(1);
      expect(r.kept).toBeLessThanOrEqual(20);
      expect(r.total).toBe(r.kept + 5);
    }
  });

  it("keeps the higher die on advantage and the lower on disadvantage", () => {
    for (let i = 0; i < 200; i++) {
      const adv = rollD20Check(0, "advantage");
      expect(adv.dice).toHaveLength(2);
      expect(adv.kept).toBe(Math.max(...adv.dice));
      const dis = rollD20Check(0, "disadvantage");
      expect(dis.kept).toBe(Math.min(...dis.dice));
    }
  });

  // 2d6 + STR modifier (+5) — the shape every crit mode is measured against.
  const critFormula: CustomFormula = {
    operation: Operation.addition,
    operands: [roll(2, StandardDie.d6), StatKey.str],
  };
  const critCharacter = () => {
    const character = structuredClone(defaultCharacter) as Character;
    character.stats.str = 20; // +5
    return character;
  };

  it("raw crits double the dice count but not the flat modifier", () => {
    const character = critCharacter();
    for (let i = 0; i < 100; i++) {
      const dice: number[] = [];
      const total = rollFormula(critFormula, character, dice, undefined, {
        mode: "raw",
      });
      expect(dice).toHaveLength(4); // 2d6 → 4d6
      // 4d6 (4..24) + 5, the modifier still counted once
      expect(total).toBe(dice.reduce((a, b) => a + b, 0) + 5);
      expect(total).toBeGreaterThanOrEqual(9);
      expect(total).toBeLessThanOrEqual(29);
    }
  });

  it("maxDice crits maximize the normal dice and roll the critical set", () => {
    const character = critCharacter();
    for (let i = 0; i < 100; i++) {
      const dice: number[] = [];
      const total = rollFormula(critFormula, character, dice, undefined, {
        mode: "maxDice",
      });
      expect(dice).toHaveLength(4);
      // The first set is maximized, the second genuinely rolled.
      expect(dice.slice(0, 2)).toEqual([6, 6]);
      expect(dice.slice(2).every((d) => d >= 1 && d <= 6)).toBe(true);
      // 12 (maxed) + 2d6 (2..12) + 5 → 19..29, never below RAW's floor.
      expect(total).toBeGreaterThanOrEqual(19);
      expect(total).toBeLessThanOrEqual(29);
    }
  });

  it("total crits double the modifier too, without adding dice", () => {
    const character = critCharacter();
    for (let i = 0; i < 100; i++) {
      const dice: number[] = [];
      const total = rollFormula(critFormula, character, dice, undefined, {
        mode: "total",
      });
      expect(dice).toHaveLength(2); // no extra dice — the sum is scaled
      expect(total).toBe((dice.reduce((a, b) => a + b, 0) + 5) * 2);
    }
  });

  it("exploding crits stack another set of critical dice per repeat", () => {
    const character = critCharacter();
    const dice: number[] = [];
    // One repeat crit: RAW's two sets of dice become three.
    rollFormula(critFormula, character, dice, undefined, {
      mode: "raw",
      extraSets: 1,
    });
    expect(dice).toHaveLength(6);

    // Under `total` the multiplier grows instead of the dice count.
    const totalDice: number[] = [];
    const scaled = rollFormula(critFormula, character, totalDice, undefined, {
      mode: "total",
      extraSets: 1,
    });
    expect(totalDice).toHaveLength(2);
    expect(scaled).toBe((totalDice.reduce((a, b) => a + b, 0) + 5) * 3);
  });

  it("critDiceCount reports the dice a leaf will roll per mode", () => {
    expect(critDiceCount(2, undefined)).toBe(2);
    expect(critDiceCount(2, { mode: "raw" })).toBe(4);
    expect(critDiceCount(2, { mode: "maxDice" })).toBe(4);
    expect(critDiceCount(2, { mode: "total" })).toBe(2);
    expect(critDiceCount(2, { mode: "raw", extraSets: 2 })).toBe(8);
  });

  it("doubles every component of a damage map on a critical", () => {
    const character = structuredClone(defaultCharacter) as Character;
    const results = rollDamage(
      {
        [DamageType.Fire]: roll(2, StandardDie.d6),
        [DamageType.Cold]: roll(1, StandardDie.d4),
      },
      character,
      undefined,
      { mode: "raw" },
    );
    expect(
      results.find((r) => r.damageType === DamageType.Fire)!.dice,
    ).toHaveLength(4);
    expect(
      results.find((r) => r.damageType === DamageType.Cold)!.dice,
    ).toHaveLength(2);
  });

  it("explodes the d20 while it keeps critting, and not otherwise", () => {
    // A threshold of 21 is unreachable, so the chain never starts.
    expect(
      rollD20Check(0, "normal", undefined, 21).explosionDice,
    ).toBeUndefined();
    // A threshold of 1 always crits, so the chain runs to its safety cap.
    const runaway = rollD20Check(0, "normal", undefined, 1);
    expect(runaway.explosionDice).toHaveLength(20);
    expect(runaway.explosions).toBe(20);
    // Exploding never changes the check's own total.
    expect(runaway.total).toBe(runaway.kept);
  });

  it("rolls each damage component of a damage map", () => {
    const character = structuredClone(defaultCharacter) as Character;
    const results = rollDamage(
      {
        [DamageType.Fire]: roll(2, StandardDie.d6),
        [DamageType.Cold]: roll(1, StandardDie.d4),
      },
      character,
    );
    const fire = results.find((r) => r.damageType === DamageType.Fire)!;
    const cold = results.find((r) => r.damageType === DamageType.Cold)!;
    expect(fire.dice).toHaveLength(2);
    expect(fire.total).toBeGreaterThanOrEqual(2);
    expect(fire.total).toBeLessThanOrEqual(12);
    expect(cold.total).toBeGreaterThanOrEqual(1);
    expect(cold.total).toBeLessThanOrEqual(4);
  });
});
