import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "src/lib/browser";
import {
  OfficialClass,
  RestType,
  StandardDie,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, LimitedUseAbility } from "src/lib/types";
import {
  allocateHitDiceRecovery,
  applyHitDieRoll,
  applyRestPlan,
  DEFAULT_REST_RULES,
  formatRecharge,
  hitDiceBudget,
  planRest,
  rechargesOnRest,
  restDuration,
  RestRules,
  rollHitDie,
  spendableHitDice,
} from "./rest";

afterEach(() => vi.restoreAllMocks());

const classed = (
  name: OfficialClass,
  level: number,
  extra: Partial<Character> = {},
): Character => {
  const c = structuredClone(defaultCharacter);
  const id = randomUUID();
  c.class = [{ id, name, level }];
  c.spellcastingClasses = [{ classId: id }];
  c.maxHp = 50;
  c.currHp = 20;
  c.tempHp = 0;
  c.limitedUseAbilities = [];
  // The fixture is a played-in multiclass sample: it has a hit-dice override and
  // ships mid-day (spent slots, a level of exhaustion). Reset all of that so
  // each test states its own starting resources.
  delete c.totalHitDice;
  c.expendedHitDice = {};
  c.spellSlots = Object.fromEntries(
    Object.keys(c.spellSlots).map((level) => [level, { expended: 0 }]),
  ) as Character["spellSlots"];
  c.pactSlots = { expended: 0 };
  c.exhaustion = 0;
  return { ...c, ...extra };
};

const pool = (
  title: string,
  recharge: string,
  expended: number,
  max = 4,
): LimitedUseAbility => ({
  info: { title, titleFormulas: [] },
  maxUses: max,
  recharge,
  expended,
});

const rules = (over: Partial<RestRules> = {}): RestRules => ({
  ...DEFAULT_REST_RULES,
  ...over,
});

// The value an update writes at a dot-path, for asserting on plan output.
const wrote = (
  plan: {
    updates: { type: string; subField?: string; payload: { value: unknown } }[];
  },
  type: string,
  subField?: string,
) =>
  plan.updates.find((u) => u.type === type && u.subField === subField)?.payload
    .value;

const changeKeys = (list: { key: string }[]) => list.map((c) => c.key);

describe("rechargesOnRest", () => {
  it("refreshes a short-rest pool on either rest", () => {
    expect(rechargesOnRest(RestType.shortRest, "short")).toBe(true);
    expect(rechargesOnRest(RestType.shortRest, "long")).toBe(true);
  });

  it("holds a long-rest pool back on a short rest", () => {
    expect(rechargesOnRest(RestType.longRest, "short")).toBe(false);
    expect(rechargesOnRest(RestType.longRest, "long")).toBe(true);
  });

  it("matches the loose wordings features actually use", () => {
    expect(rechargesOnRest("short or long rest", "short")).toBe(true);
    expect(rechargesOnRest("Long Rest ", "long")).toBe(true);
    // The shorthand the feat catalog writes.
    expect(rechargesOnRest("short", "short")).toBe(true);
    expect(rechargesOnRest("long", "short")).toBe(false);
  });

  it("ignores triggers that aren't rests", () => {
    expect(rechargesOnRest("Dawn", "long")).toBe(false);
    expect(rechargesOnRest("", "long")).toBe(false);
  });
});

describe("formatRecharge", () => {
  it("lowercases the two presets so the caption reads as a sentence", () => {
    expect(formatRecharge(RestType.shortRest)).toBe("short rest");
    expect(formatRecharge(RestType.longRest)).toBe("long rest");
  });

  it("leaves homebrew triggers exactly as they were written", () => {
    // "Dawn" may well be a proper noun at someone's table, and the sheet has no
    // way to tell — so it isn't the sheet's business to recase it.
    expect(formatRecharge("Dawn")).toBe("Dawn");
    expect(formatRecharge("short or long rest")).toBe("short or long rest");
    expect(formatRecharge("")).toBe("");
  });
});

describe("restDuration", () => {
  it("reports the variant's pacing", () => {
    expect(restDuration("short", rules())).toBe("1 hour");
    expect(restDuration("long", rules())).toBe("8 hours");
    expect(restDuration("short", rules({ restVariant: "epic" }))).toBe(
      "5 minutes",
    );
    expect(restDuration("long", rules({ restVariant: "gritty" }))).toBe(
      "7 days",
    );
  });
});

describe("hitDiceBudget", () => {
  const spent = (expendedHitDice: Character["expendedHitDice"], level = 10) =>
    classed(OfficialClass.Fighter, level, { expendedHitDice });

  it("gives back half the total, rounded down (RAW)", () => {
    expect(hitDiceBudget(spent({ d10: 8 }), rules())).toBe(5);
  });

  it("never gives back more than was spent", () => {
    expect(hitDiceBudget(spent({ d10: 2 }), rules())).toBe(2);
  });

  it("guarantees one die even for a level 1 character", () => {
    expect(hitDiceBudget(spent({ d10: 1 }, 1), rules())).toBe(1);
  });

  it("honors the all/none variants", () => {
    const c = spent({ d10: 8 });
    expect(hitDiceBudget(c, rules({ longRestHitDiceRecovery: "all" }))).toBe(8);
    expect(hitDiceBudget(c, rules({ longRestHitDiceRecovery: "none" }))).toBe(
      0,
    );
  });

  it("is zero when nothing was spent", () => {
    expect(hitDiceBudget(spent({}), rules())).toBe(0);
  });
});

describe("allocateHitDiceRecovery", () => {
  it("recovers the biggest spent dice first", () => {
    const c = classed(OfficialClass.Fighter, 6, {
      expendedHitDice: { d10: 2, d6: 3 },
    });
    expect(allocateHitDiceRecovery(c, 3)).toEqual({ d10: 2, d6: 1 });
  });

  it("never exceeds what was spent of a size", () => {
    const c = classed(OfficialClass.Fighter, 6, {
      expendedHitDice: { d10: 1 },
    });
    expect(allocateHitDiceRecovery(c, 5)).toEqual({ d10: 1 });
  });
});

describe("planRest — short rest", () => {
  it("refreshes short-rest pools and pact slots, and leaves the rest alone", () => {
    const c = classed(OfficialClass.Warlock, 5, {
      expendedHitDice: { d8: 2 },
      pactSlots: { expended: 2 },
    });
    c.spellSlots[1] = { totalOverride: 4, expended: 3 };
    c.limitedUseAbilities = [
      pool("Ki", RestType.shortRest, 3),
      pool("Mystic Arcanum", RestType.longRest, 1, 1),
    ];

    const plan = planRest(c, "short", rules());

    expect(plan.duration).toBe("1 hour");
    expect(wrote(plan, "update_pactSlots", "expended")).toBe(0);
    expect(wrote(plan, "update_limitedUseAbilities", "0.expended")).toBe(0);
    // The long-rest pool, the spell slots and the HP are all untouched.
    expect(
      wrote(plan, "update_limitedUseAbilities", "1.expended"),
    ).toBeUndefined();
    expect(wrote(plan, "update_spellSlots", "1.expended")).toBeUndefined();
    expect(wrote(plan, "update_currHp")).toBeUndefined();
    expect(changeKeys(plan.unchanged)).toContain("spellSlots");
    expect(changeKeys(plan.unchanged)).toContain("hp");
    expect(plan.hitDiceBudget).toBe(0);
  });

  it("offers hit dice as a follow-up when HP are missing", () => {
    const c = classed(OfficialClass.Fighter, 5, {
      expendedHitDice: { d10: 1 },
    });
    const followUp = planRest(c, "short", rules()).followUps.find(
      (f) => f.kind === "spendHitDice",
    );
    expect(followUp).toEqual({
      kind: "spendHitDice",
      missingHp: 30,
      diceRemaining: 4,
    });
  });

  it("does not offer hit dice at full HP", () => {
    const c = classed(OfficialClass.Fighter, 5, { currHp: 50 });
    expect(planRest(c, "short", rules()).followUps).toEqual([]);
  });

  it("reports non-rest recharge triggers instead of guessing", () => {
    const c = classed(OfficialClass.Fighter, 5, { currHp: 50 });
    c.limitedUseAbilities = [pool("Sunlit Blade", "Dawn", 1, 1)];
    const plan = planRest(c, "short", rules());
    expect(plan.followUps).toEqual([
      {
        kind: "manualRecharge",
        abilities: [{ title: "Sunlit Blade", when: "Dawn" }],
      },
    ]);
    expect(plan.updates).toEqual([]);
  });
});

describe("planRest — long rest", () => {
  const rested = (over: Partial<Character> = {}) => {
    const c = classed(OfficialClass.Fighter, 8, {
      currHp: 10,
      tempHp: 5,
      exhaustion: 2,
      expendedHitDice: { d10: 6 },
      deathSaves: { successes: 1, failures: 2 },
      ...over,
    });
    c.limitedUseAbilities = [
      pool("Second Wind", RestType.shortRest, 1, 1),
      pool("Action Surge", RestType.longRest, 1, 1),
    ];
    return c;
  };

  it("restores HP, temp HP, hit dice, pools, exhaustion and death saves", () => {
    const plan = planRest(rested(), "long", rules());

    expect(wrote(plan, "update_currHp")).toBe(50);
    expect(wrote(plan, "update_tempHp")).toBe(0);
    // Half of 8 total dice = 4 back, so 2 remain spent.
    expect(wrote(plan, "update_expendedHitDice", "d10")).toBe(2);
    expect(plan.hitDiceBudget).toBe(4);
    expect(plan.hitDiceRecovered).toEqual({ d10: 4 });
    expect(wrote(plan, "update_limitedUseAbilities", "0.expended")).toBe(0);
    expect(wrote(plan, "update_limitedUseAbilities", "1.expended")).toBe(0);
    expect(wrote(plan, "update_exhaustion")).toBe(1);
    expect(wrote(plan, "update_deathSaves")).toEqual({
      successes: 0,
      failures: 0,
    });
    expect(plan.followUps.some((f) => f.kind === "spendHitDice")).toBe(false);
  });

  it("restores every expended spell slot level", () => {
    const c = rested();
    c.spellSlots[1] = { totalOverride: 4, expended: 4 };
    c.spellSlots[3] = { totalOverride: 3, expended: 1 };
    const plan = planRest(c, "long", rules());
    expect(wrote(plan, "update_spellSlots", "1.expended")).toBe(0);
    expect(wrote(plan, "update_spellSlots", "3.expended")).toBe(0);
    expect(
      plan.changes.find((ch) => ch.key === "spellSlots")?.detail,
    ).toContain("5 slots");
  });

  it("clears all exhaustion under the all variant, and none under none", () => {
    expect(
      wrote(
        planRest(
          rested(),
          "long",
          rules({ longRestExhaustionRecovery: "all" }),
        ),
        "update_exhaustion",
      ),
    ).toBe(0);
    const noneplan = planRest(
      rested(),
      "long",
      rules({ longRestExhaustionRecovery: "none" }),
    );
    expect(wrote(noneplan, "update_exhaustion")).toBeUndefined();
    expect(changeKeys(noneplan.unchanged)).toContain("exhaustion");
  });

  it("gives every hit die back under the all variant", () => {
    const plan = planRest(
      rested(),
      "long",
      rules({ longRestHitDiceRecovery: "all" }),
    );
    expect(wrote(plan, "update_expendedHitDice", "d10")).toBe(0);
    expect(plan.hitDiceRecovered).toEqual({ d10: 6 });
  });

  it("leaves HP to hit dice under slow natural healing", () => {
    const plan = planRest(
      rested(),
      "long",
      rules({ longRestHpRecovery: "none" }),
    );
    expect(wrote(plan, "update_currHp")).toBeUndefined();
    expect(changeKeys(plan.unchanged)).toContain("hp");
    // Dice recovered by the rest are spendable in the same rest.
    expect(plan.followUps).toContainEqual({
      kind: "spendHitDice",
      missingHp: 40,
      diceRemaining: 6,
    });
  });

  it("keeps temp HP when the table doesn't expire them", () => {
    const plan = planRest(
      rested(),
      "long",
      rules({ longRestClearsTempHp: false }),
    );
    expect(wrote(plan, "update_tempHp")).toBeUndefined();
  });

  it("respects a caller's hit-dice split, clamped to the budget", () => {
    const c = classed(OfficialClass.Fighter, 8, {
      expendedHitDice: { d10: 3, d8: 3 },
    });
    const plan = planRest(c, "long", rules(), {
      hitDiceRecovery: { d8: 3, d10: 3 },
    });
    // Budget is 4 (half of 8); the d8s are honored first as asked, then one d10.
    expect(plan.hitDiceRecovered).toEqual({ d10: 1, d8: 3 });
  });

  it("asks a prepared caster to re-prepare", () => {
    const c = classed(OfficialClass.Cleric, 5, { currHp: 50 });
    c.stats.wis = 16;
    const followUp = planRest(c, "long", rules()).followUps.find(
      (f) => f.kind === "prepareSpells",
    );
    expect(followUp).toMatchObject({
      className: OfficialClass.Cleric,
      prepared: 0,
      allowed: 8,
    });
  });

  it("does not ask a known caster to prepare anything", () => {
    const c = classed(OfficialClass.Sorcerer, 5, { currHp: 50 });
    expect(
      planRest(c, "long", rules()).followUps.some(
        (f) => f.kind === "prepareSpells",
      ),
    ).toBe(false);
  });

  it("plans nothing for a character who needs nothing", () => {
    const c = classed(OfficialClass.Fighter, 5, { currHp: 50 });
    const plan = planRest(c, "long", rules());
    expect(plan.updates).toEqual([]);
    expect(plan.changes).toEqual([]);
  });
});

describe("applyRestPlan", () => {
  it("folds every update into one rested character", () => {
    const c = classed(OfficialClass.Fighter, 8, {
      currHp: 10,
      tempHp: 5,
      exhaustion: 2,
      expendedHitDice: { d10: 6 },
    });
    c.limitedUseAbilities = [pool("Action Surge", RestType.longRest, 1, 1)];
    c.spellSlots[1] = { totalOverride: 4, expended: 4 };

    const plan = planRest(c, "long", rules());
    const rested = applyRestPlan(c, plan);

    expect(rested.currHp).toBe(50);
    expect(rested.tempHp).toBe(0);
    expect(rested.exhaustion).toBe(1);
    expect(rested.expendedHitDice.d10).toBe(2);
    expect(rested.spellSlots[1]?.expended).toBe(0);
    expect(rested.limitedUseAbilities[0].expended).toBe(0);
    // The original is untouched, so the reducer's inverse still captures the
    // pre-rest state for undo.
    expect(c.currHp).toBe(10);
    expect(c.expendedHitDice.d10).toBe(6);
  });

  it("returns an equivalent character when a rest changes nothing", () => {
    const c = classed(OfficialClass.Fighter, 5, { currHp: 50 });
    const plan = planRest(c, "short", rules());
    expect(applyRestPlan(c, plan)).toEqual(c);
  });
});

describe("hit dice spending", () => {
  it("rolls the die plus CON and clamps healing to what's missing", () => {
    const c = classed(OfficialClass.Fighter, 5, { currHp: 48 });
    c.stats.con = 14; // +2
    vi.spyOn(Math, "random").mockReturnValue(0.99); // max the die
    const roll = rollHitDie(c, StandardDie.d10);
    expect(roll.total).toBe(12);
    expect(roll.healed).toBe(2);

    const updates = applyHitDieRoll(c, roll);
    expect(updates[0].payload.value).toBe(50);
    expect(updates[1].payload.value).toBe(1);
  });

  it("offers only sizes with dice left, biggest first", () => {
    const c = classed(OfficialClass.Fighter, 6, {
      expendedHitDice: { d10: 6 },
    });
    c.totalHitDice = { d10: 6, d6: 2 };
    expect(spendableHitDice(c)).toEqual([StandardDie.d6]);
  });
});
