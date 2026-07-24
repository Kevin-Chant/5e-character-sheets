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
} from "./attack-roll";

// The damage arithmetic behind the roll dialog, now that it's out of the
// component. Dice are pinned to their maximum so totals are exact.

const character = (): Character => {
  const c = structuredClone(defaultCharacter) as Character;
  c.stats.str = 20; // +5
  c.features = [];
  // A plain fighter, so no class grants an extra-damage rider of its own —
  // the default character is a paladin and would bring Divine Smite along.
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
  // These tests exercise the arithmetic, not the eligibility rules: the entry
  // arrives already resolved, so `optIn` just mirrors what the rider asked for.
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
