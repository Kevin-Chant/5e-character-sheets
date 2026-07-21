import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { calculateCustomFormula, formatCustomFormula } from "src/lib/formula";
import {
  Character,
  DieExpression,
  SpellMechanics,
  isDieExpression,
} from "src/lib/types";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import {
  scalingSteps,
  spellDamageAtLevel,
  spellHealingAtLevel,
  spellInstancesAtLevel,
} from "./spell-scaling";

const CLERIC_ID = randomUUID();

const roll = (count: number, die: StandardDie): DieExpression => [
  count,
  die,
  DieOperation.roll,
];

const fireball: SpellMechanics = {
  level: 3,
  resolution: { kind: "save", ability: StatKey.dex, halfOnSuccess: true },
  damage: [{ damageType: DamageType.Fire, formula: roll(8, StandardDie.d6) }],
  scaling: {
    driver: "slot",
    perLevels: 1,
    damage: [{ damageType: DamageType.Fire, formula: roll(1, StandardDie.d6) }],
  },
};

const fireBolt: SpellMechanics = {
  level: 0,
  resolution: { kind: "attack", range: "ranged" },
  damage: [{ damageType: DamageType.Fire, formula: roll(1, StandardDie.d10) }],
  scaling: {
    driver: "character",
    damage: [
      { damageType: DamageType.Fire, formula: roll(1, StandardDie.d10) },
    ],
  },
};

const spiritualWeapon: SpellMechanics = {
  level: 2,
  resolution: { kind: "attack", range: "melee" },
  damage: [{ damageType: DamageType.Force, formula: roll(1, StandardDie.d8) }],
  scaling: {
    driver: "slot",
    perLevels: 2,
    damage: [
      { damageType: DamageType.Force, formula: roll(1, StandardDie.d8) },
    ],
  },
};

describe("scalingSteps", () => {
  it("slot driver counts levels above base, honoring perLevels", () => {
    expect(scalingSteps(fireball, 3)).toBe(0);
    expect(scalingSteps(fireball, 5)).toBe(2);
    // Spiritual Weapon scales every two slot levels above 2nd.
    expect(scalingSteps(spiritualWeapon, 3)).toBe(0);
    expect(scalingSteps(spiritualWeapon, 4)).toBe(1);
    expect(scalingSteps(spiritualWeapon, 6)).toBe(2);
  });

  it("character driver counts the 5/11/17 cantrip tiers", () => {
    expect(scalingSteps(fireBolt, 1)).toBe(0);
    expect(scalingSteps(fireBolt, 5)).toBe(1);
    expect(scalingSteps(fireBolt, 11)).toBe(2);
    expect(scalingSteps(fireBolt, 20)).toBe(3);
  });
});

describe("spellDamageAtLevel", () => {
  it("collapses same-die scaling into a single dice-count bump", () => {
    // Fireball at slot 5 = 8d6 + 2·1d6 = 10d6, not an addition node.
    expect(spellDamageAtLevel(fireball, 5)).toEqual({
      [DamageType.Fire]: roll(10, StandardDie.d6),
    });
    // Fire Bolt at character level 11 = 3d10.
    expect(spellDamageAtLevel(fireBolt, 11)).toEqual({
      [DamageType.Fire]: roll(3, StandardDie.d10),
    });
  });

  it("returns the base unchanged at or below base level", () => {
    expect(spellDamageAtLevel(fireball, 3)).toEqual({
      [DamageType.Fire]: roll(8, StandardDie.d6),
    });
  });

  it("prefers an explicit damageTable entry (nearest at or below)", () => {
    const witchBolt: SpellMechanics = {
      level: 1,
      resolution: { kind: "attack", range: "ranged" },
      damageTable: {
        1: [
          {
            damageType: DamageType.Lightning,
            formula: roll(1, StandardDie.d12),
          },
        ],
        3: [
          {
            damageType: DamageType.Lightning,
            formula: roll(2, StandardDie.d12),
          },
        ],
      },
    };
    expect(spellDamageAtLevel(witchBolt, 2)).toEqual({
      [DamageType.Lightning]: roll(1, StandardDie.d12),
    });
    expect(spellDamageAtLevel(witchBolt, 5)).toEqual({
      [DamageType.Lightning]: roll(2, StandardDie.d12),
    });
  });

  it("scales a dice increment by its count, not by multiplying one roll", () => {
    // Non-collapsing scaling (mixed dice) must add *more dice*, so an actual
    // roll rolls them — 1d8 + 2·1d6 → 1d8 + a 2d6 term, not 2×(one d6).
    const oddball: SpellMechanics = {
      level: 1,
      resolution: { kind: "auto" },
      damage: [
        { damageType: DamageType.Cold, formula: roll(1, StandardDie.d8) },
      ],
      scaling: {
        driver: "slot",
        damage: [
          { damageType: DamageType.Cold, formula: roll(1, StandardDie.d6) },
        ],
      },
    };
    const at3 = spellDamageAtLevel(oddball, 3)[DamageType.Cold] as {
      operands: DieExpression[];
    };
    expect(at3.operands[1]).toEqual([2, StandardDie.d6, DieOperation.roll]);
    expect(isDieExpression(at3.operands[1])).toBe(true);
  });

  it("expands mixed dice into an addition node the engine can total", () => {
    const oddball: SpellMechanics = {
      level: 1,
      resolution: { kind: "auto" },
      damage: [
        { damageType: DamageType.Cold, formula: roll(1, StandardDie.d8) },
      ],
      scaling: {
        driver: "slot",
        damage: [
          { damageType: DamageType.Cold, formula: roll(1, StandardDie.d6) },
        ],
      },
    };
    const result = spellDamageAtLevel(oddball, 3)[DamageType.Cold];
    // 1d8 + 2·1d6 — a mixed-dice addition node the engine can still total.
    expect(typeof calculateCustomFormula(result!, defaultCharacter)).toBe(
      "number",
    );
    expect(formatCustomFormula(result!, defaultCharacter, false)).toContain(
      "d6",
    );
  });
});

describe("spellHealingAtLevel", () => {
  const cureWounds: SpellMechanics = {
    level: 1,
    resolution: { kind: "auto" },
    healing: {
      operation: "addition",
      operands: [roll(1, StandardDie.d8), { spellMod: CLERIC_ID }],
    },
    scaling: { driver: "slot", perLevels: 1, healing: roll(1, StandardDie.d8) },
  };

  it("returns the base healing at base level", () => {
    expect(spellHealingAtLevel(cureWounds, 1)).toEqual(cureWounds.healing);
  });

  it("adds dice (not a multiplied roll) when upcast", () => {
    // Cure Wounds at slot 3 = (1d8 + mod) + 2d8 — the increment is a 2d8 term.
    const at3 = spellHealingAtLevel(cureWounds, 3) as {
      operands: DieExpression[];
    };
    expect(at3.operands[1]).toEqual([2, StandardDie.d8, DieOperation.roll]);
  });

  it("scales flat healing by a flat step (Heal: 70 +10/slot)", () => {
    const heal: SpellMechanics = {
      level: 6,
      resolution: { kind: "auto" },
      healing: 70,
      scaling: { driver: "slot", perLevels: 1, healing: 10 },
    };
    expect(
      calculateCustomFormula(spellHealingAtLevel(heal, 8)!, defaultCharacter),
    ).toBe(90);
  });

  it("returns undefined for a non-healing spell", () => {
    expect(spellHealingAtLevel(fireball, 3)).toBeUndefined();
  });
});

describe("spellInstancesAtLevel", () => {
  it("grows instance count per step (Magic Missile darts)", () => {
    const magicMissile: SpellMechanics = {
      level: 1,
      resolution: { kind: "auto" },
      instances: 3,
      scaling: { driver: "slot", instances: 1 },
    };
    expect(spellInstancesAtLevel(magicMissile, 1)).toBe(3);
    expect(spellInstancesAtLevel(magicMissile, 4)).toBe(6);
  });

  it("defaults to a single instance when unspecified", () => {
    expect(spellInstancesAtLevel(fireball, 5)).toBe(1);
  });
});

describe("spellMod formula leaf", () => {
  it("resolves to the class's spellcasting ability modifier, live", () => {
    const character: Character = structuredClone(defaultCharacter);
    character.class = [{ id: CLERIC_ID, name: OfficialClass.Cleric, level: 1 }];
    character.spellcastingClasses = [{ classId: CLERIC_ID }];
    character.stats.wis = 18; // Cleric casts off WIS → +4
    const formula = { spellMod: CLERIC_ID };
    expect(calculateCustomFormula(formula, character)).toBe(4);
    expect(formatCustomFormula(formula, character, false)).toBe(
      "spellcasting mod",
    );
    expect(formatCustomFormula(formula, character, true)).toBe("4");
  });

  it("honors a per-class abilityOverride", () => {
    const character: Character = structuredClone(defaultCharacter);
    character.class = [{ id: CLERIC_ID, name: OfficialClass.Cleric, level: 1 }];
    character.spellcastingClasses = [
      { classId: CLERIC_ID, abilityOverride: StatKey.cha },
    ];
    character.stats.wis = 10;
    character.stats.cha = 20; // override → CHA +5
    const formula = { spellMod: CLERIC_ID };
    expect(calculateCustomFormula(formula, character)).toBe(5);
  });
});
