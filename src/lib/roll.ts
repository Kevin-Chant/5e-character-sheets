import { DamageType } from "./data/data-definitions";
import { OPERATORS, calculateAtomicVariable } from "./formula";
import { adjustDieRoll } from "./mechanics/riders";
import { ActiveRider } from "./mechanics/types";
import {
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  isArbitraryOperandOperation,
  isAtomicVariable,
  isDieExpression,
  isDoubleOperandOperation,
  isExpression,
  isStandardDie,
} from "./types";

// A real, random roll — deliberately not the engine's `calculate*`, which must
// stay deterministic since it runs on every render. Invoked only on an
// explicit "Roll" click.

const faces = (die: DieDefinition): number =>
  isStandardDie(die) ? parseInt(die.slice(1), 10) : die.numFaces;

const rollOneDie = (die: DieDefinition): number =>
  Math.floor(Math.random() * faces(die)) + 1;

const operandsOf = (formula: CustomFormula): CustomFormula[] => {
  if (isArbitraryOperandOperation(formula)) return formula.operands;
  if (isDoubleOperandOperation(formula))
    return [formula.operand1, formula.operand2];
  return [(formula as { operand1: CustomFormula }).operand1];
};

// How a critical hit inflates damage — a table-level setting.
// - `raw`     — 5e RAW: roll all damage dice twice, add together; modifiers don't double.
// - `maxDice` — "max + roll": maximum on normal dice, roll extra crit dice on top.
// - `total`   — roll normally, then double everything, modifiers included.
export type CritMode = "raw" | "maxDice" | "total";

export interface CritSpec {
  mode: CritMode;
  // Extra sets of critical dice beyond the first, from exploding crits.
  extraSets?: number;
}

// Sets of critical dice a spec adds on top of the attack's normal dice.
const critSets = (crit?: CritSpec): number =>
  crit ? 1 + (crit.extraSets ?? 0) : 0;

// How many dice a die leaf of `count` dice actually rolls under a crit spec.
// `total` mode scales the sum instead of adding dice, so count is unchanged.
export const critDiceCount = (count: number, crit?: CritSpec): number =>
  !crit || crit.mode === "total" ? count : count * (1 + critSets(crit));

/**
 * Evaluate a formula with dice actually rolled. Non-die leaves resolve
 * against the character as the engine does; every rolled die is pushed onto
 * `dice` when provided. Die-level riders (rerolls, minimum dice) adjust each
 * die as rolled — the pushed value is the one that counted.
 * `crit` applies the table's critical-hit flavor as a roll-time argument, so
 * the stored formula and its display stay untouched.
 */
export function rollFormula(
  formula: CustomFormula,
  character: Character,
  dice?: number[],
  riders?: ActiveRider[],
  crit?: CritSpec,
): number {
  const total = rollNode(formula, character, dice, riders, crit);
  // `total` mode scales the whole expression, so it applies once here, not per die leaf.
  return crit?.mode === "total" ? total * (1 + critSets(crit)) : total;
}

function rollNode(
  formula: CustomFormula,
  character: Character,
  dice?: number[],
  riders?: ActiveRider[],
  crit?: CritSpec,
): number {
  // DieExpression is itself an AtomicVariable, so handle it before the general
  // atomic case (which would hit the deterministic stub).
  if (isDieExpression(formula)) {
    const [count, die] = formula;
    const rollAdjusted = () => {
      const raw = rollOneDie(die);
      return riders ? adjustDieRoll(raw, riders, () => rollOneDie(die)) : raw;
    };
    // Normal dice: maximized under `maxDice`, otherwise rolled (`total` rolls
    // normally and doubles the sum at the top).
    const normal =
      crit?.mode === "maxDice"
        ? Array.from({ length: count }, () => faces(die))
        : Array.from({ length: count }, rollAdjusted);
    // Critical dice, always rolled; none under `total`, which scales the sum instead.
    const extra =
      crit && crit.mode !== "total"
        ? Array.from({ length: count * critSets(crit) }, rollAdjusted)
        : [];
    const all = [...normal, ...extra];
    dice?.push(...all);
    return all.reduce((sum, d) => sum + d, 0);
  }
  if (isAtomicVariable(formula))
    return calculateAtomicVariable(formula, character);
  if (isExpression(formula))
    return OPERATORS[formula.operation].calculator(
      operandsOf(formula).map((operand) =>
        rollNode(operand, character, dice, riders, crit),
      ),
    );
  return 0;
}

export interface DamageRollResult {
  damageType: DamageType;
  total: number;
  dice: number[];
}

export function rollDamage(
  formula: CustomFormulaWithDamage,
  character: Character,
  riders?: ActiveRider[],
  crit?: CritSpec,
): DamageRollResult[] {
  return (Object.entries(formula) as Array<[DamageType, CustomFormula]>).map(
    ([damageType, componentFormula]) => {
      const dice: number[] = [];
      const total = rollFormula(
        componentFormula,
        character,
        dice,
        riders,
        crit,
      );
      return { damageType, total, dice };
    },
  );
}

/**
 * A rolled total written out as its parts: each die as it landed, then
 * everything else as one flat term, derived as `total` minus the dice so the
 * breakdown always adds up to the total shown.
 *
 * Under the `total` crit flavor the multiplier is factored out and shown
 * rather than folded into the flat term. Returns undefined for a single term
 * ("12 (12)" is noise).
 */
export function formatRollBreakdown(
  total: number,
  dice: number[],
  crit?: CritSpec,
): string | undefined {
  const multiplier = crit?.mode === "total" ? 1 + critSets(crit) : 1;
  const base = total / multiplier;
  const flat = base - dice.reduce((sum, d) => sum + d, 0);
  const terms = [
    ...dice.map(String),
    ...(flat !== 0 ? [signedTerm(flat)] : []),
  ];
  if (terms.length < 2) return undefined;
  const joined = terms.join(" + ").replace(/\+ -/g, "- ");
  return multiplier > 1 ? `(${joined}) ×${multiplier}` : joined;
}

const signedTerm = (n: number) => (n < 0 ? `-${Math.abs(n)}` : String(n));

export type CheckMode = "normal" | "advantage" | "disadvantage";

export interface CheckRollResult {
  // The d20(s) rolled — two under advantage/disadvantage.
  dice: number[];
  // The die actually used (higher for advantage, lower for disadvantage).
  kept: number;
  modifier: number;
  total: number;
  // Exploding-crits follow-ups: every d20 rolled after the first crit, the
  // last of which stopped the chain. `explosions` counts how many crit again,
  // each adding another set of critical damage dice.
  explosionDice?: number[];
  explosions?: number;
}

// A safety stop for the exploding chain, so a bad `explodeAt` can't hang the tab.
const MAX_EXPLOSIONS = 20;

// A d20 ability/skill/attack check: roll one d20 (two under advantage/
// disadvantage, keeping higher/lower) plus the flat modifier. Die-level
// riders adjust each d20 as rolled (Halfling Luck, Reliable Talent) before
// the keep decision.
//
// `explodeAt` turns on exploding crits: when the kept die is at or above the
// threshold, keep rolling until one isn't, each repeat stacking another set
// of critical damage dice. Never changes the check's total.
export function rollD20Check(
  modifier: number,
  mode: CheckMode = "normal",
  riders?: ActiveRider[],
  explodeAt?: number,
): CheckRollResult {
  const count = mode === "normal" ? 1 : 2;
  const d20 = () => Math.floor(Math.random() * 20) + 1;
  const rollAdjusted = () => {
    const raw = d20();
    return riders ? adjustDieRoll(raw, riders, d20) : raw;
  };
  const dice = Array.from({ length: count }, rollAdjusted);
  const kept = mode === "disadvantage" ? Math.min(...dice) : Math.max(...dice);
  const result: CheckRollResult = {
    dice,
    kept,
    modifier,
    total: kept + modifier,
  };
  if (explodeAt === undefined || kept < explodeAt) return result;
  const explosionDice: number[] = [];
  while (explosionDice.length < MAX_EXPLOSIONS) {
    const next = rollAdjusted();
    explosionDice.push(next);
    if (next < explodeAt) break;
  }
  return {
    ...result,
    explosionDice,
    explosions: explosionDice.filter((d) => d >= explodeAt).length,
  };
}

// Whether a formula (or damage map) contains any dice — decides when to
// surface the roll button.
export function formulaHasDice(formula: CustomFormula): boolean {
  if (isDieExpression(formula)) return true;
  if (isExpression(formula)) return operandsOf(formula).some(formulaHasDice);
  return false;
}

export const damageHasDice = (formula: CustomFormulaWithDamage): boolean =>
  Object.values(formula).some((f) => f !== undefined && formulaHasDice(f));
