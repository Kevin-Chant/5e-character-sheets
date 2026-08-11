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

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

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

// Infinity for scores outside the buyable 8-15 range.
export function pointBuyCost(score: number): number {
  return score in POINT_BUY_COST ? POINT_BUY_COST[score] : Infinity;
}

export const pointBuyTotalCost = (stats: Record<StatKey, number>): number =>
  STAT_ORDER.reduce((sum, s) => sum + pointBuyCost(stats[s]), 0);

export const pointBuyRemaining = (stats: Record<StatKey, number>): number =>
  POINT_BUY_BUDGET - pointBuyTotalCost(stats);

export const isValidPointBuy = (stats: Record<StatKey, number>): boolean =>
  STAT_ORDER.every(
    (s) => stats[s] >= POINT_BUY_MIN && stats[s] <= POINT_BUY_MAX,
  ) && pointBuyTotalCost(stats) <= POINT_BUY_BUDGET;

export type RollMethod = "4d6-drop-lowest" | "3d6";

const rollDie = (): number => Math.floor(Math.random() * 6) + 1;

// Uses Math.random, seedable by the screenshot harness for reproducible captures.
export function rollScore(method: RollMethod): number {
  if (method === "3d6") return rollDie() + rollDie() + rollDie();
  const dice = [rollDie(), rollDie(), rollDie(), rollDie()].sort(
    (a, b) => a - b,
  );
  return dice[1] + dice[2] + dice[3];
}

// Unsorted; the UI lets the player assign them.
export const rollScoreSet = (method: RollMethod): number[] =>
  STAT_ORDER.map(() => rollScore(method));
