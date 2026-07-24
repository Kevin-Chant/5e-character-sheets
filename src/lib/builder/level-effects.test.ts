import { describe, expect, it } from "vitest";
import { DamageType, Operation, StatKey } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import {
  applyLevelEffects,
  formulaIncludes,
  levelEffectsAt,
} from "./level-effects";

const char = (): Character => structuredClone(defaultCharacter);

describe("applyLevelEffects", () => {
  it("grants saving-throw proficiencies", () => {
    const c = char();
    applyLevelEffects(c, { savingThrows: [StatKey.int, StatKey.cha] });
    expect(c.proficiencies.savingThrows[StatKey.int]).toBe(true);
    expect(c.proficiencies.savingThrows[StatKey.cha]).toBe(true);
    // `Proficiencies` is sparse — an untouched save is absent, not `false`.
    expect(c.proficiencies.savingThrows[StatKey.str]).toBeFalsy();
  });

  it("merges damage modifiers without duplicating", () => {
    const c = char();
    // The default sheet ships with sample modifiers; this is about the merge.
    c.damageModifiers = {
      resistances: [],
      immunities: [],
      vulnerabilities: [],
    };
    const effects = {
      resistances: [DamageType.Lightning, DamageType.Thunder],
      immunities: [DamageType.Fire],
    };
    applyLevelEffects(c, effects);
    applyLevelEffects(c, effects);
    expect(c.damageModifiers.resistances).toEqual([
      DamageType.Lightning,
      DamageType.Thunder,
    ]);
    expect(c.damageModifiers.immunities).toEqual([DamageType.Fire]);
  });

  it("raises a speed but never lowers one", () => {
    const c = char();
    c.speeds.walk = 30;
    c.speeds.fly = 60;
    applyLevelEffects(c, { speeds: { fly: 40, swim: 20 } });
    expect(c.speeds.fly).toBe(60);
    expect(c.speeds.swim).toBe(20);
  });

  it('resolves a "walk" speed against the character\'s walking speed', () => {
    const c = char();
    c.speeds.walk = 35;
    applyLevelEffects(c, { speeds: { fly: "walk" } });
    expect(c.speeds.fly).toBe(35);
  });

  it("adds an initiative modifier, and only once", () => {
    const c = char();
    applyLevelEffects(c, { initiativeAbility: StatKey.wis });
    expect(c.initiativeFormula).toEqual({
      operation: Operation.addition,
      operands: [StatKey.dex, StatKey.wis],
    });
    // Re-applying the same level must not stack a second copy.
    applyLevelEffects(c, { initiativeAbility: StatKey.wis });
    expect(c.initiativeFormula).toEqual({
      operation: Operation.addition,
      operands: [StatKey.dex, StatKey.wis],
    });
  });

  it("keeps an existing initiative bonus when adding an ability", () => {
    const c = char();
    // Alert's flat +5, already folded in by the feat.
    c.initiativeFormula = {
      operation: Operation.addition,
      operands: [StatKey.dex, 5],
    };
    applyLevelEffects(c, { initiativeAbility: StatKey.cha });
    expect(formulaIncludes(c.initiativeFormula, 5)).toBe(true);
    expect(formulaIncludes(c.initiativeFormula, StatKey.cha)).toBe(true);
  });
});

describe("levelEffectsAt", () => {
  it("returns a base-class entry (Diamond Soul at monk 14)", () => {
    const [effects] = levelEffectsAt("Monk", undefined, 14);
    expect(effects?.savingThrows).toHaveLength(6);
    expect(levelEffectsAt("Monk", undefined, 13)).toEqual([]);
  });

  it("returns a subclass entry only for the matching subclass", () => {
    expect(
      levelEffectsAt("Sorcerer", "Storm Sorcery", 6)[0]?.resistances,
    ).toEqual([DamageType.Lightning, DamageType.Thunder]);
    expect(levelEffectsAt("Sorcerer", "Wild Magic", 6)).toEqual([]);
  });

  it("gates a late grant to its own level (Dragon Wings at 14)", () => {
    expect(levelEffectsAt("Sorcerer", "Draconic Bloodline", 13)).toEqual([]);
    expect(
      levelEffectsAt("Sorcerer", "Draconic Bloodline", 14)[0]?.speeds,
    ).toEqual({ fly: "walk" });
  });

  it("gives a Gloom Stalker its initiative ability at 3rd", () => {
    expect(
      levelEffectsAt("Ranger", "Gloom Stalker", 3)[0]?.initiativeAbility,
    ).toBe(StatKey.wis);
  });
});
