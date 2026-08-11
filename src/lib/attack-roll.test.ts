import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DamageType,
  DieOperation,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, CustomFormulaWithDamage } from "src/lib/types";
import {
  availableSlotLevels,
  damageMapFor,
  damageOnSave,
  ExtraDamageEntry,
  extrasForAttack,
  resolveDamage,
  slotDiceCount,
  spellExtrasForCast,
  usesPoolState,
} from "./attack-roll";
import { Spell } from "src/lib/types";

// Dice are pinned to their maximum so totals are exact.

const character = (): Character => {
  const c = structuredClone(defaultCharacter) as Character;
  c.stats.str = 20; // +5
  c.features = [];
  // Plain fighter: the default character is a paladin with Divine Smite.
  c.class = [
    { id: "00000000-0000-0000-0000-000000000001", name: "Fighter", level: 1 },
  ];
  c.spellcastingClasses = [];
  return c;
};

const GREATSWORD: CustomFormulaWithDamage = {
  [DamageType.Slashing]: {
    operation: Operation.addition,
    operands: [[2, StandardDie.d6, DieOperation.roll], StatKey.str],
  },
};

const entry = (
  source: string,
  rider: Partial<ExtraDamageEntry["rider"]>,
): ExtraDamageEntry => ({
  source,
  rider: {
    rider: "extraDamage",
    amount: 2,
    declareAt: "on-hit",
    ...rider,
  } as ExtraDamageEntry["rider"],
  optIn: !!rider.optional,
});

const resolve = (over: Partial<Parameters<typeof resolveDamage>[0]> = {}) =>
  resolveDamage({
    character: character(),
    map: GREATSWORD,
    extras: [],
    chosen: new Set(),
    riders: [],
    applyTotals: (t) => t,
    ...over,
  });

afterEach(() => vi.restoreAllMocks());
const maxRolls = () => vi.spyOn(Math, "random").mockReturnValue(0.999);

describe("extrasForAttack", () => {
  it("is empty for a spell — extra weapon damage must never ride a spell", () => {
    const c = character();
    c.features = [{ title: "Dueling", titleFormulas: [] }];
    expect(
      extrasForAttack(c, GREATSWORD, { spellcastingClass: "x" } as never),
    ).toEqual([]);
    expect(extrasForAttack(c, undefined, undefined)).toEqual([]);
  });

  it("collects a weapon attack's riders", () => {
    const c = character();
    c.features = [{ title: "Dueling", titleFormulas: [] }];
    expect(
      extrasForAttack(c, GREATSWORD, undefined).map((e) => e.source),
    ).toEqual(["Dueling"]);
  });

  it("always asks before a rider that costs a use, whatever the weapon settles", () => {
    const c = character();
    c.limitedUseAbilities = [
      {
        info: { title: "Fire Rune", titleFormulas: [] },
        maxUses: 1,
        expended: 0,
        recharge: "shortRest",
        mechanics: {
          riders: [
            {
              appliesTo: ["damage"],
              rider: {
                rider: "extraDamage",
                amount: [2, StandardDie.d6, DieOperation.roll],
                declareAt: "on-hit",
                uses: { pool: "Fire Rune" },
              },
            },
          ],
        },
      } as never,
    ];
    const [fire] = extrasForAttack(c, GREATSWORD, undefined);
    expect(fire.optIn).toBe(true);
  });
});

describe("usesPoolState", () => {
  const withRune = (expended: number): Character => {
    const c = character();
    c.limitedUseAbilities = [
      {
        info: { title: "Fire Rune", titleFormulas: [] },
        maxUses: 2,
        expended,
        recharge: "shortRest",
      } as never,
    ];
    return c;
  };

  it("reads the named pool's remaining uses, matched loosely on title", () => {
    expect(usesPoolState(withRune(1), "fire rune ")).toEqual({
      index: 0,
      remaining: 1,
    });
  });

  it("is undefined when no such pool is on the sheet, rather than 0", () => {
    expect(usesPoolState(character(), "Fire Rune")).toBeUndefined();
  });
});

describe("spellExtrasForCast", () => {
  const spell = { spellcastingClass: "x" } as unknown as Spell;
  const clericWithWis = (): Character => {
    const c = character();
    c.stats.wis = 18; // +4
    c.features = [{ title: "Potent Spellcasting", titleFormulas: [] }];
    return c;
  };

  it("is empty for a weapon — a spell bonus must never ride a weapon", () => {
    expect(spellExtrasForCast(clericWithWis(), undefined, true)).toEqual([]);
  });

  it("applies a cantrip-scoped bonus only on a cantrip", () => {
    const c = clericWithWis();
    expect(spellExtrasForCast(c, spell, true).map((e) => e.source)).toEqual([
      "Potent Spellcasting",
    ]);
    // A leveled cast: the cantrip-only bonus drops out.
    expect(spellExtrasForCast(c, spell, false)).toEqual([]);
  });

  it("marks Potent Spellcasting auto and Empowered Evocation opt-in", () => {
    const c = character();
    c.features = [
      { title: "Potent Spellcasting", titleFormulas: [] },
      { title: "Empowered Evocation", titleFormulas: [] },
    ];
    const cantrip = spellExtrasForCast(c, spell, true);
    expect(cantrip.find((e) => e.source === "Potent Spellcasting")?.optIn).toBe(
      false,
    );
    // Empowered Evocation is `any` scope, so present on the cantrip too, opt-in.
    expect(cantrip.find((e) => e.source === "Empowered Evocation")?.optIn).toBe(
      true,
    );
  });

  it("folds a spell bonus through resolveDamage as a flat, non-crit extra", () => {
    maxRolls();
    const c = clericWithWis();
    const extras = spellExtrasForCast(c, spell, true);
    const fireBolt: CustomFormulaWithDamage = {
      [DamageType.Fire]: [1, StandardDie.d10, DieOperation.roll],
    };
    const { total, extras: results } = resolveDamage({
      character: c,
      map: fireBolt,
      extras,
      chosen: new Set(),
      riders: [],
      applyTotals: (t) => t,
    });
    // 1d10 max (10) + WIS (+4), applied once.
    expect(total).toBe(14);
    expect(results).toEqual([
      expect.objectContaining({ source: "Potent Spellcasting", total: 4 }),
    ]);
  });
});

describe("resolveDamage", () => {
  it("rolls the weapon's own dice plus its modifier", () => {
    maxRolls();
    expect(resolve().total).toBe(2 * 6 + 5);
  });

  it("applies always-on extras but not unticked opt-in ones", () => {
    maxRolls();
    const extras = [
      entry("Rage", { amount: 3 }),
      entry("Sneak Attack", { amount: 4, optional: true }),
    ];
    expect(resolve({ extras }).total).toBe(2 * 6 + 5 + 3);
    expect(resolve({ extras, chosen: new Set(["Sneak Attack"]) }).total).toBe(
      2 * 6 + 5 + 3 + 4,
    );
  });

  it("inflates extra dice along with the weapon's on a crit", () => {
    maxRolls();
    const extras = [
      entry("Sneak Attack", {
        amount: [1, StandardDie.d6, DieOperation.roll],
        optional: true,
      }),
    ];
    const out = resolve({
      extras,
      chosen: new Set(["Sneak Attack"]),
      crit: { mode: "raw" },
    });
    // 4d6 weapon + 5, and the rider's 1d6 doubles to 2d6.
    expect(out.total).toBe(4 * 6 + 5 + 2 * 6);
    expect(out.critical).toEqual({ mode: "raw" });
  });

  it("rolls a slot-powered rider at the chosen level without spending it", () => {
    maxRolls();
    const smite = entry("Divine Smite", {
      optional: true,
      slot: {
        minLevel: 1,
        die: StandardDie.d8,
        diceAtMin: 2,
        maxDice: 5,
        bonus: { dice: 1, label: "undead" },
      },
    });
    const out = resolve({
      extras: [smite],
      chosen: new Set(["Divine Smite"]),
      slot: { entry: smite, level: 3, withBonus: false },
    });
    // 2 dice at 1st +1 per level above → 4d8 at a 3rd-level slot.
    expect(
      out.extras.find((e) => e.source === "Divine Smite")?.dice,
    ).toHaveLength(4);
    expect(out.total).toBe(2 * 6 + 5 + 4 * 8);
  });

  it("adds the situational bonus dice when toggled", () => {
    maxRolls();
    const smite = entry("Divine Smite", {
      optional: true,
      slot: {
        minLevel: 1,
        die: StandardDie.d8,
        diceAtMin: 2,
        maxDice: 5,
        bonus: { dice: 1, label: "undead" },
      },
    });
    const out = resolve({
      extras: [smite],
      chosen: new Set(["Divine Smite"]),
      slot: { entry: smite, level: 1, withBonus: true },
    });
    expect(out.total).toBe(2 * 6 + 5 + 3 * 8); // 2d8 + 1d8 bonus
  });

  it("folds total-level riders over everything", () => {
    maxRolls();
    expect(resolve({ applyTotals: (t) => t + 100 }).total).toBe(
      2 * 6 + 5 + 100,
    );
  });
});

describe("slot helpers", () => {
  it("caps the dice at maxDice", () => {
    const slot = { minLevel: 1, die: StandardDie.d8, diceAtMin: 2, maxDice: 5 };
    expect(slotDiceCount(slot, 1)).toBe(2);
    expect(slotDiceCount(slot, 4)).toBe(5);
    expect(slotDiceCount(slot, 9)).toBe(5); // capped
  });

  it("offers only slot levels the character still has", () => {
    const c = character();
    c.class = [
      { id: "00000000-0000-0000-0000-000000000001", name: "Wizard", level: 3 },
    ];
    c.spellcastingClasses = [{ classId: c.class[0].id }];
    const levels = availableSlotLevels(c, 1);
    expect(levels).toContain(1);
    expect(levels).not.toContain(9);
  });
});

describe("damageMapFor / damageOnSave", () => {
  it("passes a weapon's fixed map straight through", () => {
    expect(damageMapFor(undefined, GREATSWORD, 1)).toBe(GREATSWORD);
  });

  it("is empty for a spell with no structured damage", () => {
    expect(
      damageMapFor({ spellcastingClass: "x" } as never, undefined, 1),
    ).toEqual({});
  });

  it("halves (rounding down) or zeroes on a successful save", () => {
    expect(damageOnSave(13, "half")).toBe(6);
    expect(damageOnSave(13, "none")).toBe(0);
  });
});
