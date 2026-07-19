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
