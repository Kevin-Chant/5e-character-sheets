import { StatKey } from "src/lib/data/data-definitions";

// The six abilities in canonical sheet order.
export const STAT_ORDER: StatKey[] = [
  StatKey.str,
  StatKey.dex,
  StatKey.con,
  StatKey.int,
  StatKey.wis,
  StatKey.cha,
];

// --- Standard array -------------------------------------------------------

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// --- Point buy ------------------------------------------------------------

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

// Standard 5e point-buy cost table (score → points spent).
const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

// Point cost of a single score, or Infinity when it's outside the buyable
// 8–15 range (callers treat that as invalid).
export function pointBuyCost(score: number): number {
  return score in POINT_BUY_COST ? POINT_BUY_COST[score] : Infinity;
}

export const pointBuyTotalCost = (stats: Record<StatKey, number>): number =>
  STAT_ORDER.reduce((sum, s) => sum + pointBuyCost(stats[s]), 0);

export const pointBuyRemaining = (stats: Record<StatKey, number>): number =>
  POINT_BUY_BUDGET - pointBuyTotalCost(stats);

// Valid when every score is in range and the total spend fits the budget.
export const isValidPointBuy = (stats: Record<StatKey, number>): boolean =>
  STAT_ORDER.every(
    (s) => stats[s] >= POINT_BUY_MIN && stats[s] <= POINT_BUY_MAX,
  ) && pointBuyTotalCost(stats) <= POINT_BUY_BUDGET;

// --- Rolling --------------------------------------------------------------

export type RollMethod = "4d6-drop-lowest" | "3d6";

const rollDie = (): number => Math.floor(Math.random() * 6) + 1;

// Roll one ability score. `4d6-drop-lowest` rolls four d6 and sums the best
// three; `3d6` sums three straight. Uses `Math.random`, which the screenshot
// harness can seed for reproducible captures.
export function rollScore(method: RollMethod): number {
  if (method === "3d6") return rollDie() + rollDie() + rollDie();
  const dice = [rollDie(), rollDie(), rollDie(), rollDie()].sort(
    (a, b) => a - b,
  );
  return dice[1] + dice[2] + dice[3];
}

// Roll a full set of six scores (unsorted; the UI lets the player assign them).
export const rollScoreSet = (method: RollMethod): number[] =>
  STAT_ORDER.map(() => rollScore(method));
