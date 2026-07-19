import { DamageType } from "./data/data-definitions";
import { OPERATORS, calculateAtomicVariable } from "./formula";
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

// A real, random roll — deliberately *not* the engine's `calculate*`, which must
// stay deterministic because it runs on every render (and whose `roll`
// DieOperation is a fixed stub). This path is invoked only on an explicit
// "Roll" click, so randomness here is safe.

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

/**
 * Evaluate a formula with dice actually rolled. Non-die leaves (stats, PB, class
 * levels, spellMod, constants) resolve against the character exactly as the
 * engine does; every rolled die is pushed onto `dice` when provided, so callers
 * can show the breakdown.
 */
export function rollFormula(
  formula: CustomFormula,
  character: Character,
  dice?: number[],
): number {
  // DieExpression is itself an AtomicVariable, so handle it before the general
  // atomic case (which would hit the deterministic stub).
  if (isDieExpression(formula)) {
    let sum = 0;
    for (let i = 0; i < formula[0]; i++) {
      const result = rollOneDie(formula[1]);
      dice?.push(result);
      sum += result;
    }
    return sum;
  }
  if (isAtomicVariable(formula))
    return calculateAtomicVariable(formula, character);
  if (isExpression(formula))
    return OPERATORS[formula.operation].calculator(
      operandsOf(formula).map((operand) =>
        rollFormula(operand, character, dice),
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
): DamageRollResult[] {
  return (Object.entries(formula) as Array<[DamageType, CustomFormula]>).map(
    ([damageType, componentFormula]) => {
      const dice: number[] = [];
      const total = rollFormula(componentFormula, character, dice);
      return { damageType, total, dice };
    },
  );
}

export type CheckMode = "normal" | "advantage" | "disadvantage";

export interface CheckRollResult {
  // The d20(s) rolled — two under advantage/disadvantage.
  dice: number[];
  // The die actually used (higher for advantage, lower for disadvantage).
  kept: number;
  modifier: number;
  total: number;
}

// A d20 ability/skill/attack check: roll one d20 (or two, keeping the higher for
// advantage / lower for disadvantage) and add the flat modifier.
export function rollD20Check(
  modifier: number,
  mode: CheckMode = "normal",
): CheckRollResult {
  const count = mode === "normal" ? 1 : 2;
  const dice = Array.from(
    { length: count },
    () => Math.floor(Math.random() * 20) + 1,
  );
  const kept = mode === "disadvantage" ? Math.min(...dice) : Math.max(...dice);
  return { dice, kept, modifier, total: kept + modifier };
}

// Whether a formula (or damage map) contains any dice — i.e. whether rolling it
// is meaningful. Used to decide when to surface the roll button.
export function formulaHasDice(formula: CustomFormula): boolean {
  if (isDieExpression(formula)) return true;
  if (isExpression(formula)) return operandsOf(formula).some(formulaHasDice);
  return false;
}

export const damageHasDice = (formula: CustomFormulaWithDamage): boolean =>
  Object.values(formula).some((f) => f !== undefined && formulaHasDice(f));
