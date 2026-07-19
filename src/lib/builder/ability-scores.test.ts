import { describe, expect, it, vi } from "vitest";
import { StatKey } from "src/lib/data/data-definitions";
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  isValidPointBuy,
  pointBuyCost,
  pointBuyRemaining,
  pointBuyTotalCost,
  rollScore,
  rollScoreSet,
} from "src/lib/builder/ability-scores";

const stats = (
  v: Partial<Record<StatKey, number>>,
): Record<StatKey, number> => ({
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
  ...v,
});

describe("point buy", () => {
  it("uses the standard cost table", () => {
    expect(pointBuyCost(8)).toBe(0);
    expect(pointBuyCost(13)).toBe(5);
    expect(pointBuyCost(14)).toBe(7);
    expect(pointBuyCost(15)).toBe(9);
  });

  it("treats out-of-range scores as invalid (infinite cost)", () => {
    expect(pointBuyCost(7)).toBe(Infinity);
    expect(pointBuyCost(16)).toBe(Infinity);
  });

  it("all 8s spends nothing and leaves the full budget", () => {
    const s = stats({});
    expect(pointBuyTotalCost(s)).toBe(0);
    expect(pointBuyRemaining(s)).toBe(POINT_BUY_BUDGET);
    expect(isValidPointBuy(s)).toBe(true);
  });

  it("a standard 15/15/15/8/8/8 spread costs exactly the budget", () => {
    const s = stats({ str: 15, dex: 15, con: 15 });
    expect(pointBuyTotalCost(s)).toBe(27);
    expect(pointBuyRemaining(s)).toBe(0);
    expect(isValidPointBuy(s)).toBe(true);
  });

  it("rejects overspending and out-of-range scores", () => {
    expect(isValidPointBuy(stats({ str: 15, dex: 15, con: 15, int: 10 }))).toBe(
      false,
    );
    expect(isValidPointBuy(stats({ str: 16 }))).toBe(false);
  });
});

describe("standard array", () => {
  it("is the canonical six values", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe("rolling", () => {
  it("4d6-drop-lowest stays within 3–18 and drops the lowest die", () => {
    // Force dice to 1,1,4,6 → drop a 1, sum 1+4+6 = 11.
    const seq = [1, 1, 4, 6];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (seq[i++] - 1) / 6);
    expect(rollScore("4d6-drop-lowest")).toBe(11);
    vi.restoreAllMocks();
  });

  it("3d6 sums three dice", () => {
    const seq = [2, 3, 5];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (seq[i++] - 1) / 6);
    expect(rollScore("3d6")).toBe(10);
    vi.restoreAllMocks();
  });

  it("a rolled set has six scores, each in range", () => {
    const set = rollScoreSet("4d6-drop-lowest");
    expect(set).toHaveLength(6);
    for (const s of set) {
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(18);
    }
  });
});
