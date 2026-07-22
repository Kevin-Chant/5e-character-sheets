import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { rollD20Check } from "src/lib/roll";
import { Character } from "src/lib/types";
import {
  adjustDieRoll,
  applyTotalRiders,
  critThreshold,
  hitDieHealing,
  riderMinimumTotal,
  ridersFor,
} from "./riders";
import { ActiveRider } from "./types";

const withFeatures = (...titles: string[]): Character => {
  const c = structuredClone(defaultCharacter);
  c.features = titles.map((title) => ({ title, titleFormulas: [] }));
  return c;
};

afterEach(() => vi.restoreAllMocks());

describe("ridersFor", () => {
  it("collects riders from feature titles, filtered by roll kind", () => {
    const c = withFeatures("Durable", "Great Weapon Fighting");
    expect(ridersFor(c, "hitDie").map((r) => r.rider.rider)).toEqual([
      "minimumTotal",
    ]);
    expect(ridersFor(c, "damage").map((r) => r.rider.rider)).toEqual([
      "rerollBelow",
    ]);
    expect(ridersFor(c, "check")).toEqual([]);
  });

  it("matches titles case-insensitively with padding", () => {
    const c = withFeatures("  dUrAbLe ");
    expect(ridersFor(c, "hitDie")).toHaveLength(1);
  });

  it("collects riders from limited-use ability titles", () => {
    const c = withFeatures();
    c.limitedUseAbilities = [
      {
        info: { title: "Improved Critical", titleFormulas: [] },
        maxUses: 1,
        recharge: "long",
        expended: 0,
      },
    ];
    expect(critThreshold(ridersFor(c, "attack"))).toBe(19);
  });

  it("collects race-keyed riders by substring (Halfling Luck)", () => {
    const c = withFeatures();
    c.race.name = "Lightfoot Halfling";
    const riders = ridersFor(c, "attack");
    expect(riders).toHaveLength(1);
    expect(riders[0].rider).toEqual({ rider: "rerollBelow", threshold: 1 });
    // Damage rolls are unaffected.
    expect(ridersFor(c, "damage")).toEqual([]);
  });
});

describe("adjustDieRoll", () => {
  const reroll = (r: ActiveRider["rider"]): ActiveRider[] => [
    { source: "test", rider: r },
  ];

  it("rerolls at or below the threshold once, keeping the new roll", () => {
    const riders = reroll({ rider: "rerollBelow", threshold: 2 });
    expect(adjustDieRoll(2, riders, () => 1)).toBe(1); // must keep the new roll
    expect(adjustDieRoll(2, riders, () => 6)).toBe(6);
    expect(adjustDieRoll(3, riders, () => 6)).toBe(3); // above threshold: no reroll
  });

  it("floors individual dice at the minimum-die value", () => {
    const riders = reroll({ rider: "minimumDie", value: 10 });
    expect(
      adjustDieRoll(4, riders, () => {
        throw new Error("no reroll expected");
      }),
    ).toBe(10);
    expect(adjustDieRoll(15, riders, () => 0)).toBe(15);
  });

  it("applies reroll first, then the die floor", () => {
    const riders = [
      ...reroll({ rider: "rerollBelow", threshold: 1 }),
      ...reroll({ rider: "minimumDie", value: 10 }),
    ];
    expect(adjustDieRoll(1, riders, () => 4)).toBe(10);
  });
});

describe("total riders", () => {
  it("minimumTotal takes the highest applicable floor", () => {
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "minimumTotal", value: 3 } },
      { source: "b", rider: { rider: "minimumTotal", value: 6 } },
    ];
    const c = structuredClone(defaultCharacter);
    expect(riderMinimumTotal(riders, c)).toBe(6);
    expect(applyTotalRiders(4, riders, c)).toBe(6);
    expect(applyTotalRiders(9, riders, c)).toBe(9);
  });

  it("bonus riders add to the total after the floor", () => {
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "minimumTotal", value: 5 } },
      { source: "b", rider: { rider: "bonus", value: 2 } },
    ];
    expect(applyTotalRiders(1, riders, structuredClone(defaultCharacter))).toBe(
      7,
    );
  });
});

describe("critThreshold", () => {
  it("defaults to 20 and takes the widest range", () => {
    expect(critThreshold([])).toBe(20);
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "critRange", value: 19 } },
      { source: "b", rider: { rider: "critRange", value: 18 } },
    ];
    expect(critThreshold(riders)).toBe(18);
  });
});

describe("hitDieHealing", () => {
  const withDurable = (con: number): Character => {
    const c = withFeatures("Durable");
    c.stats.con = con;
    return c;
  };

  it("matches the rolled total without Durable, floored at 0", () => {
    const c = withFeatures();
    expect(hitDieHealing(c, 7)).toBe(7);
    // A bad roll with a negative CON modifier can't damage you.
    expect(hitDieHealing(c, -1)).toBe(0);
  });

  it("applies Durable's minimum of twice the CON modifier", () => {
    const c = withDurable(16); // +3 → minimum 6
    expect(hitDieHealing(c, 4)).toBe(6);
    expect(hitDieHealing(c, 9)).toBe(9);
  });

  it("Durable's floor is itself at least 2, even with low CON", () => {
    const c = withDurable(8); // -1 → 2×mod is -2, floor stays 2
    expect(hitDieHealing(c, 1)).toBe(2);
  });
});

describe("rollD20Check with riders", () => {
  it("Halfling Luck rerolls a natural 1", () => {
    const c = structuredClone(defaultCharacter);
    c.race.name = "Stout Halfling";
    // First d20 rolls a 1, the reroll comes up 18.
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // → 1
      .mockReturnValueOnce(0.85); // → 18
    const result = rollD20Check(3, "normal", ridersFor(c, "check"));
    expect(result.kept).toBe(18);
    expect(result.total).toBe(21);
  });

  it("Reliable Talent floors the d20 at 10", () => {
    const c = structuredClone(defaultCharacter);
    c.features = [{ title: "Reliable Talent", titleFormulas: [] }];
    vi.spyOn(Math, "random").mockReturnValueOnce(0.2); // → 5
    const result = rollD20Check(0, "normal", ridersFor(c, "check"));
    expect(result.kept).toBe(10);
  });
});
