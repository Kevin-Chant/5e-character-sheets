import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DieOperation,
  OfficialClass,
  StandardDie,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { Character, LimitedUseAbility } from "src/lib/types";
import { FEATURE_MECHANICS, SLOT_CREATION_COSTS } from "./catalog";
import {
  actionBlocked,
  effectBlocked,
  EffectContext,
  resolveEffects,
  slotLevelOptions,
  staticAmount,
} from "./resolve";
import { Effect } from "./types";

afterEach(() => vi.restoreAllMocks());

const classed = (name: OfficialClass, level: number): Character => {
  const c = structuredClone(defaultCharacter);
  const id = randomUUID();
  c.class = [{ id, name, level }];
  c.spellcastingClasses = [{ classId: id }];
  // The fixture's HP fields would confound heal tests; pin them.
  c.maxHp = 50;
  c.currHp = 30;
  c.tempHp = 0;
  return c;
};

const pool = (expended: number, max = 5): LimitedUseAbility => ({
  info: { title: "Pool", titleFormulas: [] },
  maxUses: max,
  recharge: "long",
  expended,
});

const ctxFor = (
  character: Character,
  ability?: LimitedUseAbility,
  extra?: Partial<EffectContext>,
): EffectContext => ({ character, ability, abilityIndex: 0, ...extra });

// The update targeting a dot-path, for asserting on resolver output.
const updateFor = (
  updates: { type: string; subField?: string; payload: { value: unknown } }[],
  type: string,
  subField?: string,
) =>
  updates.find((u) => u.type === type && u.subField === subField)?.payload
    .value;

describe("staticAmount", () => {
  const c = classed(OfficialClass.Fighter, 5);

  it("resolves diceless fixed formulas, including plusLevelOf", () => {
    expect(staticAmount({ fixed: 3 }, ctxFor(c))).toBe(3);
    expect(
      staticAmount({ fixed: 2, plusLevelOf: OfficialClass.Fighter }, ctxFor(c)),
    ).toBe(7);
    // Not a fighter level in sight → just the formula.
    expect(
      staticAmount({ fixed: 2, plusLevelOf: OfficialClass.Monk }, ctxFor(c)),
    ).toBe(2);
  });

  it("is undefined for dicey formulas and unmade choices", () => {
    expect(
      staticAmount(
        { fixed: [1, StandardDie.d10, DieOperation.roll] },
        ctxFor(c),
      ),
    ).toBeUndefined();
    expect(staticAmount({ chosenAmount: true }, ctxFor(c))).toBeUndefined();
    expect(
      staticAmount({ byChosenLevel: { 1: 2 } }, ctxFor(c)),
    ).toBeUndefined();
  });

  it("reads choices from the context", () => {
    expect(
      staticAmount(
        { chosenAmount: true },
        ctxFor(c, undefined, { chosenAmount: 4 }),
      ),
    ).toBe(4);
    expect(
      staticAmount(
        { chosenLevel: true },
        ctxFor(c, undefined, { chosenLevel: 3 }),
      ),
    ).toBe(3);
    expect(
      staticAmount(
        { byChosenLevel: SLOT_CREATION_COSTS },
        ctxFor(c, undefined, { chosenLevel: 3 }),
      ),
    ).toBe(5);
  });
});

describe("effectBlocked", () => {
  it("heal blocks only at full HP", () => {
    const c = classed(OfficialClass.Fighter, 3);
    const heal: Effect = { effect: "heal", amount: { fixed: 5 } };
    expect(effectBlocked(heal, ctxFor(c))).toBeUndefined();
    c.currHp = 50;
    expect(effectBlocked(heal, ctxFor(c))).toBe("Already at full HP");
  });

  it("spendUses needs enough remaining", () => {
    const c = classed(OfficialClass.Fighter, 3);
    const spend: Effect = { effect: "spendUses", amount: { fixed: 3 } };
    expect(effectBlocked(spend, ctxFor(c, pool(0)))).toBeUndefined();
    expect(effectBlocked(spend, ctxFor(c, pool(3)))).toBe(
      "Not enough uses left",
    );
  });

  it("restoreUses blocks when the pool is full", () => {
    const c = classed(OfficialClass.Fighter, 3);
    const restore: Effect = { effect: "restoreUses", amount: { fixed: 1 } };
    expect(effectBlocked(restore, ctxFor(c, pool(0)))).toBe(
      "Pool already full",
    );
    expect(effectBlocked(restore, ctxFor(c, pool(2)))).toBeUndefined();
  });

  it("slot effects check availability at the chosen level", () => {
    const c = classed(OfficialClass.Sorcerer, 5); // 4/3/2 slots
    const expend: Effect = { effect: "expendSlot" };
    const restore: Effect = { effect: "restoreSlot" };
    expect(
      effectBlocked(expend, ctxFor(c, undefined, { chosenLevel: 1 })),
    ).toBeUndefined();
    expect(
      effectBlocked(restore, ctxFor(c, undefined, { chosenLevel: 1 })),
    ).toBe("No expended slot at this level to restore");
    c.spellSlots[1].expended = 4;
    expect(
      effectBlocked(expend, ctxFor(c, undefined, { chosenLevel: 1 })),
    ).toBe("No unspent slot at this level");
    expect(
      effectBlocked(restore, ctxFor(c, undefined, { chosenLevel: 1 })),
    ).toBeUndefined();
  });

  it("spendHitDie needs a die remaining", () => {
    const c = classed(OfficialClass.Fighter, 2); // 2 × d10
    c.totalHitDice = undefined; // clear the fixture's override
    const spend: Effect = { effect: "spendHitDie", die: StandardDie.d10 };
    expect(effectBlocked(spend, ctxFor(c))).toBeUndefined();
    c.expendedHitDice = { d10: 2 };
    expect(effectBlocked(spend, ctxFor(c))).toBe("No hit dice remaining");
  });
});

describe("resolveEffects", () => {
  it("heal clamps to max HP", () => {
    const c = classed(OfficialClass.Fighter, 3);
    c.currHp = 48;
    const { updates } = resolveEffects(
      [{ effect: "heal", amount: { fixed: 10 } }],
      ctxFor(c),
    );
    expect(updateFor(updates, "update_currHp")).toBe(50);
  });

  it("heal rolls dice at execution time and reports them", () => {
    const c = classed(OfficialClass.Fighter, 5);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d10 → 6
    const { updates, rolls } = resolveEffects(
      [
        {
          effect: "heal",
          amount: {
            fixed: [1, StandardDie.d10, DieOperation.roll],
            plusLevelOf: OfficialClass.Fighter,
          },
        },
      ],
      ctxFor(c),
    );
    // 6 (die) + 5 (fighter level) on top of 30 HP.
    expect(updateFor(updates, "update_currHp")).toBe(41);
    expect(rolls).toEqual([{ label: "Healing", total: 11, dice: [6] }]);
  });

  it("gainTempHp applies only when higher than current temp HP", () => {
    const c = classed(OfficialClass.Fighter, 3);
    c.tempHp = 8;
    const low = resolveEffects(
      [{ effect: "gainTempHp", amount: { fixed: 5 } }],
      ctxFor(c),
    );
    expect(low.updates).toHaveLength(0);
    const high = resolveEffects(
      [{ effect: "gainTempHp", amount: { fixed: 12 } }],
      ctxFor(c),
    );
    expect(updateFor(high.updates, "update_tempHp")).toBe(12);
  });

  it("spend and restore compose within one action (Font of Magic convert)", () => {
    const c = classed(OfficialClass.Sorcerer, 5);
    const ability = pool(2);
    const { updates } = resolveEffects(
      [
        { effect: "expendSlot" },
        { effect: "restoreUses", amount: { chosenLevel: true } },
      ],
      ctxFor(c, ability, { chosenLevel: 2 }),
    );
    expect(updateFor(updates, "update_spellSlots", "2.expended")).toBe(1);
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      0,
    );
  });

  it("restoreUses clamps at the pool maximum", () => {
    const c = classed(OfficialClass.Sorcerer, 5);
    const { updates } = resolveEffects(
      [{ effect: "restoreUses", amount: { fixed: 9 } }],
      ctxFor(c, pool(2)),
    );
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      0,
    );
  });

  it("roll effects report without writing; reminders pass through", () => {
    const c = classed(OfficialClass.Fighter, 1);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { updates, reminders, rolls } = resolveEffects(
      [
        {
          effect: "roll",
          label: "Reduced by",
          amount: { fixed: [1, StandardDie.d12, DieOperation.roll] },
        },
        { effect: "remind", note: "Stay angry." },
      ],
      ctxFor(c),
    );
    expect(updates).toHaveLength(0);
    expect(rolls[0].label).toBe("Reduced by");
    expect(rolls[0].dice).toHaveLength(1);
    expect(reminders).toEqual(["Stay angry."]);
  });

  it("throws if asked to resolve a blocked effect", () => {
    const c = classed(OfficialClass.Fighter, 1);
    expect(() =>
      resolveEffects(
        [{ effect: "spendUses", amount: { fixed: 2 } }],
        ctxFor(c, pool(4)),
      ),
    ).toThrow(/blocked/);
  });
});

describe("catalog actions end to end", () => {
  it("Second Wind spends a use and heals 1d10 + fighter level", () => {
    const c = classed(OfficialClass.Fighter, 5);
    const ability = pool(0, 1);
    const action = FEATURE_MECHANICS["second wind"].actions![0];
    const ctx = ctxFor(c, ability);
    expect(actionBlocked(action, ctx)).toBeUndefined();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d10 → 6
    const { updates } = resolveEffects(action.effects, ctx);
    expect(updateFor(updates, "update_currHp")).toBe(41); // 30 + 6 + 5
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      1,
    );
  });

  it("Second Wind is blocked at full HP or with no uses", () => {
    const c = classed(OfficialClass.Fighter, 5);
    const action = FEATURE_MECHANICS["second wind"].actions![0];
    expect(actionBlocked(action, ctxFor(c, pool(1, 1)))).toBe(
      "Not enough uses left",
    );
    c.currHp = 50;
    expect(actionBlocked(action, ctxFor(c, pool(0, 1)))).toBe(
      "Already at full HP",
    );
  });

  it("Lay on Hands spends the chosen amount and heals it", () => {
    const c = classed(OfficialClass.Paladin, 5);
    const ability = pool(0, 25);
    const action = FEATURE_MECHANICS["lay on hands"].actions![0];
    const ctx = ctxFor(c, ability, { chosenAmount: 7 });
    expect(actionBlocked(action, ctx)).toBeUndefined();
    const { updates } = resolveEffects(action.effects, ctx);
    expect(updateFor(updates, "update_currHp")).toBe(37);
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      7,
    );
    // Can't spend more than the pool holds.
    expect(
      actionBlocked(action, ctxFor(c, pool(20, 25), { chosenAmount: 7 })),
    ).toBe("Not enough uses left");
  });

  it("Wholeness of Body heals three times the monk level", () => {
    const c = classed(OfficialClass.Monk, 6);
    const action = FEATURE_MECHANICS["wholeness of body"].actions![0];
    const { updates } = resolveEffects(action.effects, ctxFor(c, pool(0, 1)));
    expect(updateFor(updates, "update_currHp")).toBe(48); // 30 + 3×6
  });

  it("Chef's Treats grant temp HP equal to proficiency bonus", () => {
    const c = classed(OfficialClass.Fighter, 5); // PB +3
    const action = FEATURE_MECHANICS["chef's treats"].actions![0];
    const { updates } = resolveEffects(action.effects, ctxFor(c, pool(0, 3)));
    expect(updateFor(updates, "update_tempHp")).toBe(3);
  });

  it("Healing Light spends N dice and heals N d6", () => {
    const c = classed(OfficialClass.Warlock, 5);
    const ability = pool(0, 6);
    const action = FEATURE_MECHANICS["healing light"].actions![0];
    const ctx = ctxFor(c, ability, { chosenAmount: 3 });
    expect(actionBlocked(action, ctx)).toBeUndefined();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // every d6 → 4
    const { updates, rolls } = resolveEffects(action.effects, ctx);
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      3,
    );
    expect(updateFor(updates, "update_currHp")).toBe(42); // 30 + 3×4
    expect(rolls).toEqual([{ label: "Healing", total: 12, dice: [4, 4, 4] }]);
  });

  it("Font of Magic slot creation pays the PHB point costs", () => {
    const c = classed(OfficialClass.Sorcerer, 9); // has 5th-level slots
    const ability = pool(0, 9);
    c.spellSlots[3].expended = 1;
    const create = FEATURE_MECHANICS["sorcery points"].actions!.find(
      (a) => a.id === "create-slot",
    )!;
    const ctx = ctxFor(c, ability, { chosenLevel: 3 });
    expect(actionBlocked(create, ctx)).toBeUndefined();
    const { updates } = resolveEffects(create.effects, ctx);
    expect(updateFor(updates, "update_limitedUseAbilities", "0.expended")).toBe(
      5,
    );
    expect(updateFor(updates, "update_spellSlots", "3.expended")).toBe(0);
    // No expended slot at the level → nothing to restore.
    expect(actionBlocked(create, ctxFor(c, ability, { chosenLevel: 2 }))).toBe(
      "No expended slot at this level to restore",
    );
  });

  it("slot pickers respect the level cap and known slot levels", () => {
    const c = classed(OfficialClass.Sorcerer, 9); // slots through 5th
    const create = FEATURE_MECHANICS["sorcery points"].actions!.find(
      (a) => a.id === "create-slot",
    )!;
    const convert = FEATURE_MECHANICS["sorcery points"].actions!.find(
      (a) => a.id === "convert-slot",
    )!;
    expect(slotLevelOptions(create, c)).toEqual([1, 2, 3, 4, 5]);
    expect(slotLevelOptions(convert, c)).toEqual([1, 2, 3, 4, 5]);
    const wizard = classed(OfficialClass.Wizard, 17); // slots through 9th
    expect(slotLevelOptions(create, wizard)).toEqual([1, 2, 3, 4, 5]); // capped
    expect(slotLevelOptions(convert, wizard)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });
});
