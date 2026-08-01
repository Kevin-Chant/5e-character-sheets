import { afterEach, describe, expect, it, vi } from "vitest";
import { DieOperation } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, CustomFormula } from "src/lib/types";
import {
  hasTriggerFor,
  matchesTrigger,
  planTrigger,
  rechargeIntervalDays,
  tickDawn,
} from "src/lib/play/triggers";

function text(title: string) {
  return { title, titleFormulas: [] };
}

function characterWith(
  abilities: {
    title: string;
    recharge: string;
    max: number;
    expended: number;
    restore?: CustomFormula;
    daysUntilRecharge?: number;
  }[],
): Character {
  const character = structuredClone(defaultCharacter) as Character;
  character.limitedUseAbilities = abilities.map((a) => ({
    info: text(a.title),
    maxUses: a.max,
    recharge: a.recharge,
    expended: a.expended,
    restore: a.restore,
    daysUntilRecharge: a.daysUntilRecharge,
  })) as Character["limitedUseAbilities"];
  return character;
}

afterEach(() => vi.restoreAllMocks());

describe("matchesTrigger", () => {
  it("matches the phrasings the catalogs actually use", () => {
    expect(matchesTrigger("Dawn", "dawn")).toBe(true);
    expect(matchesTrigger("Initiative", "combatStart")).toBe(true);
    expect(matchesTrigger("When you roll initiative", "combatStart")).toBe(
      true,
    );
    expect(matchesTrigger("Start of your turn", "startOfTurn")).toBe(true);
    expect(matchesTrigger("End of each of your turns", "endOfTurn")).toBe(true);
  });

  it("does not fire on an unrelated event", () => {
    expect(matchesTrigger("Dawn", "combatStart")).toBe(false);
    expect(matchesTrigger("Initiative", "dawn")).toBe(false);
  });

  // The rest planner owns rest triggers. A homebrew "Long rest or dawn" must
  // not be restored by both planners.
  it("leaves rest triggers to the rest planner", () => {
    expect(matchesTrigger("Long Rest", "dawn")).toBe(false);
    expect(matchesTrigger("Short Rest", "combatStart")).toBe(false);
    expect(matchesTrigger("Long rest or dawn", "dawn")).toBe(false);
  });

  it("ignores an empty trigger", () => {
    expect(matchesTrigger("", "dawn")).toBe(false);
  });
});

describe("planTrigger", () => {
  it("restores a matching pool and accounts for it", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 3 },
    ]);
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toHaveLength(1);
    expect(plan.changes).toEqual([
      { key: "ability:0", label: "Arcane Ward", detail: "Restored 3 of 4" },
    ]);
  });

  it("leaves pools that listen for a different event alone", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 3 },
      { title: "Relentless", recharge: "Initiative", max: 1, expended: 1 },
    ]);
    expect(planTrigger(character, "combatStart").changes).toEqual([
      { key: "ability:1", label: "Relentless", detail: "Restored 1 of 1" },
    ]);
  });

  // "Regains 1d3 expended charges daily at dawn" — the magic-item pattern.
  it("rolls a partial restore when the pool carries a restore formula", () => {
    const character = characterWith([
      {
        title: "Wand of Magic Missiles",
        recharge: "Dawn",
        max: 7,
        expended: 5,
        restore: [1, { numFaces: 3 }, DieOperation.roll],
      },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0); // every die rolls its minimum
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].payload.value).toBe(4);
    expect(plan.changes).toEqual([
      {
        key: "ability:0",
        label: "Wand of Magic Missiles",
        detail: "Restored 1 (rolled) — now 3 of 7",
      },
    ]);
  });

  it("clamps a rolled restore to what was actually spent", () => {
    const character = characterWith([
      {
        title: "Wand of Magic Missiles",
        recharge: "Dawn",
        max: 7,
        expended: 1,
        restore: [1, { numFaces: 3 }, DieOperation.roll],
      },
    ]);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // d3 rolls a 3
    const plan = planTrigger(character, "dawn");
    expect(plan.updates[0].payload.value).toBe(0);
    expect(plan.changes[0].detail).toBe("Restored 1 (rolled) — now 7 of 7");
  });

  // A receipt that lists things which didn't change is how the rest panel's
  // first version told a hurt player "nothing to restore".
  it("says nothing about a pool that is already full", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 0 },
    ]);
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toEqual([]);
    expect(plan.changes).toEqual([]);
  });

  it("ticks an interval countdown at dawn instead of restoring", () => {
    const character = characterWith([
      { title: "Luck Blade", recharge: "Every 7 days", max: 1, expended: 1 },
    ]);
    const plan = planTrigger(character, "dawn");
    // First dawn after the use: the countdown seeds from the interval and
    // ticks once; nothing comes back yet.
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].payload.value).toBe(6);
    expect(plan.changes).toEqual([
      {
        key: "ability:0",
        label: "Luck Blade",
        detail: "6 days until recharge",
      },
    ]);
  });

  it("restores an interval pool when its countdown comes due", () => {
    const character = characterWith([
      {
        title: "Luck Blade",
        recharge: "Every 7 days",
        max: 1,
        expended: 1,
        daysUntilRecharge: 1,
      },
    ]);
    const plan = planTrigger(character, "dawn");
    // Two updates: the pool refills and the countdown clears.
    expect(plan.updates).toHaveLength(2);
    expect(plan.updates[0].payload.value).toBe(0);
    expect(plan.updates[1].payload.value).toBeUndefined();
    expect(plan.changes).toEqual([
      { key: "ability:0", label: "Luck Blade", detail: "Restored 1 of 1" },
    ]);
  });

  it("leaves a full interval pool's countdown alone", () => {
    const character = characterWith([
      { title: "Luck Blade", recharge: "Every 7 days", max: 1, expended: 0 },
    ]);
    const plan = planTrigger(character, "dawn");
    expect(plan.updates).toEqual([]);
    expect(plan.changes).toEqual([]);
  });

  it("knows whether a character listens for an event at all", () => {
    const character = characterWith([
      { title: "Arcane Ward", recharge: "Dawn", max: 4, expended: 0 },
    ]);
    // True even when full — the control should exist, it just does nothing yet.
    expect(hasTriggerFor(character, "dawn")).toBe(true);
    expect(hasTriggerFor(character, "combatStart")).toBe(false);
  });

  it("counts interval abilities as dawn listeners", () => {
    const character = characterWith([
      { title: "Luck Blade", recharge: "Every 7 days", max: 1, expended: 0 },
    ]);
    expect(hasTriggerFor(character, "dawn")).toBe(true);
  });
});

describe("rechargeIntervalDays", () => {
  it("reads the X out of an every-X-days trigger, however cased", () => {
    expect(rechargeIntervalDays("Every 7 days")).toBe(7);
    expect(rechargeIntervalDays("every 3 Days")).toBe(3);
    expect(rechargeIntervalDays("Regains all charges every 10 days")).toBe(10);
    expect(rechargeIntervalDays("Every 1 day")).toBe(1);
  });

  it("answers undefined for anything else", () => {
    expect(rechargeIntervalDays("Dawn")).toBeUndefined();
    expect(rechargeIntervalDays("Long Rest")).toBeUndefined();
    expect(rechargeIntervalDays("Every day")).toBeUndefined();
    expect(rechargeIntervalDays("")).toBeUndefined();
  });

  // The phrase match must not full-restore what the countdown owns.
  it("keeps interval triggers out of the plain dawn match", () => {
    expect(matchesTrigger("Every 7 days", "dawn")).toBe(false);
  });
});

describe("tickDawn", () => {
  it("spans several days at once, restoring when the interval elapses", () => {
    const character = characterWith([
      { title: "Luck Blade", recharge: "Every 7 days", max: 1, expended: 1 },
    ]);
    const ability = character.limitedUseAbilities[0];
    // A gritty-realism long rest spans 7 dawns — the whole interval.
    const tick = tickDawn(character, ability, 0, 7);
    expect(tick?.restored).toBe(1);
    expect(tick?.newExpended).toBe(0);
    expect(tick?.daysLeft).toBeUndefined();
  });

  it("answers undefined for a pool that does not listen for dawn", () => {
    const character = characterWith([
      { title: "Second Wind", recharge: "Short Rest", max: 1, expended: 1 },
    ]);
    expect(tickDawn(character, character.limitedUseAbilities[0], 0, 1)).toBe(
      undefined,
    );
  });
});
