import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { CustomFormula, DieExpression, SpellMechanics } from "src/lib/types";
import {
  defaultMechanics,
  diceInputToFormula,
  formToMechanics,
  formatDice,
  formulaToDiceInput,
  mechanicsToForm,
  parseDice,
} from "src/lib/spells/mechanics-form";

const roll = (n: number, die: StandardDie): DieExpression => [
  n,
  die,
  DieOperation.roll,
];

const add = (...operands: CustomFormula[]): CustomFormula => ({
  operation: Operation.addition,
  operands,
});

describe("dice text <-> DieExpression", () => {
  it("parses and formats NdM", () => {
    expect(parseDice("8d6")).toEqual(roll(8, StandardDie.d6));
    expect(parseDice(" 1 d 10 ")).toEqual(roll(1, StandardDie.d10));
    expect(formatDice(roll(8, StandardDie.d6))).toBe("8d6");
  });

  it("rejects junk and non-standard dice", () => {
    expect(parseDice("8d")).toBeUndefined();
    expect(parseDice("0d6")).toBeUndefined();
    expect(parseDice("d6")).toBeUndefined();
    expect(parseDice("8d7")).toBeUndefined();
  });
});

describe("formula <-> simple dice input", () => {
  it("round-trips bare dice", () => {
    const f = roll(2, StandardDie.d8);
    expect(formulaToDiceInput(f)).toEqual({ dice: "2d8", addSpellMod: false });
    expect(
      diceInputToFormula({ dice: "2d8", addSpellMod: false }, "Wizard"),
    ).toEqual(f);
  });

  it("round-trips dice + spell mod", () => {
    const f = add(roll(1, StandardDie.d8), { spellMod: "Cleric" });
    expect(formulaToDiceInput(f)).toEqual({ dice: "1d8", addSpellMod: true });
    expect(
      diceInputToFormula({ dice: "1d8", addSpellMod: true }, "Cleric"),
    ).toEqual(f);
  });

  it("returns undefined for shapes it can't express (dice + flat)", () => {
    const magicMissile = add(roll(1, StandardDie.d4), 1);
    expect(formulaToDiceInput(magicMissile)).toBeUndefined();
  });
});

describe("mechanics <-> form round-trip", () => {
  const roundTrips = (m: SpellMechanics, className: string) =>
    expect(formToMechanics(mechanicsToForm(m), m.level, className)).toEqual(m);

  it("preserves a save spell with slot damage scaling (Fireball)", () => {
    roundTrips(
      {
        level: 3,
        resolution: { kind: "save", ability: StatKey.dex, halfOnSuccess: true },
        damage: [
          { damageType: DamageType.Fire, formula: roll(8, StandardDie.d6) },
        ],
        scaling: {
          driver: "slot",
          perLevels: 1,
          damage: [
            { damageType: DamageType.Fire, formula: roll(1, StandardDie.d6) },
          ],
        },
      },
      "Wizard",
    );
  });

  it("preserves a healing spell with spell mod (Cure Wounds)", () => {
    roundTrips(
      {
        level: 1,
        resolution: { kind: "auto" },
        healing: add(roll(1, StandardDie.d8), { spellMod: "Cleric" }),
        scaling: {
          driver: "slot",
          perLevels: 1,
          healing: roll(1, StandardDie.d8),
        },
      },
      "Cleric",
    );
  });

  it("preserves instances and an advanced (raw) damage formula (Magic Missile)", () => {
    roundTrips(
      {
        level: 1,
        resolution: { kind: "auto" },
        instances: 3,
        damage: [
          {
            damageType: DamageType.Force,
            formula: add(roll(1, StandardDie.d4), 1),
          },
        ],
        scaling: { driver: "slot", perLevels: 1, instances: 1 },
      },
      "Wizard",
    );
  });

  it("preserves an imported damageTable untouched", () => {
    roundTrips(
      {
        level: 0,
        resolution: { kind: "attack", range: "ranged" },
        damage: [
          { damageType: DamageType.Fire, formula: roll(1, StandardDie.d10) },
        ],
        damageTable: {
          5: [
            { damageType: DamageType.Fire, formula: roll(2, StandardDie.d10) },
          ],
          11: [
            { damageType: DamageType.Fire, formula: roll(3, StandardDie.d10) },
          ],
        },
      },
      "Sorcerer",
    );
  });
});

describe("defaultMechanics", () => {
  it("seeds a ready-to-edit ranged attack cantrip", () => {
    const m = defaultMechanics(0);
    expect(m.level).toBe(0);
    expect(m.resolution).toEqual({ kind: "attack", range: "ranged" });
    expect(m.damage?.[0]).toEqual({
      damageType: DamageType.Fire,
      formula: roll(1, StandardDie.d6),
    });
  });
});
