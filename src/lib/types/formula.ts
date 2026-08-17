import { UUID } from "crypto";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  PB,
  HitDie,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";

// The recursive `CustomFormula` data model computed fields (AC, HP, attack
// damage) are stored as. The fold/render engines live in `src/lib/formula.ts`.

// A spellcasting class's live ability modifier, resolved against the character
// (honoring `abilityOverride`). Carries the class id, not name, so it survives
// a rename and works across multiclassing.
export interface SpellMod {
  spellMod: UUID;
}

// Character's level in a specific class, by stable class id (e.g. Sorcery
// Points = Sorcerer level).
export interface ClassLevel {
  classLevel: UUID;
}

// Live AC from equipped armor/shields (see `equippedArmorAC`); falls back to
// 10 + DEX unarmored. Marker object rather than a bare string so type guards
// can distinguish it structurally.
export interface EquippedArmor {
  equippedArmor: true;
}

export type AtomicVariable =
  | number
  | StatKey
  | DieExpression
  | ClassLevel
  | SpellMod
  | EquippedArmor
  | typeof PB;

// The three operand shapes an `Expression` is built from; consumers compose
// the concrete operations below, not these directly.
export interface SingleOperandOperation {
  operand1: CustomFormula;
}

export interface DoubleOperandOperation {
  operand1: CustomFormula;
  operand2: CustomFormula;
}

export interface ArbitraryOperandOperation {
  operands: CustomFormula[];
}

export type CustomFormula = AtomicVariable | Expression;

export interface Ceil extends SingleOperandOperation {
  operation: "ceil";
}

export interface Floor extends SingleOperandOperation {
  operation: "floor";
}

export interface Subtraction extends DoubleOperandOperation {
  operation: "subtraction";
}

export interface Division extends DoubleOperandOperation {
  operation: "division";
}

export interface Addition extends ArbitraryOperandOperation {
  operation: "addition";
}

export interface Multiplication extends ArbitraryOperandOperation {
  operation: "multiplication";
}

export interface Maximum extends ArbitraryOperandOperation {
  operation: "maximum";
}

export interface Minimum extends ArbitraryOperandOperation {
  operation: "minimum";
}

export type Expression =
  | Ceil
  | Floor
  | Subtraction
  | Division
  | Addition
  | Multiplication
  | Maximum
  | Minimum;

export type ExpressionCalculator = (args: number[]) => number;

export type CustomFormulaWithDamage = { [key in DamageType]?: CustomFormula };

export interface NonStandardDie {
  numFaces: number;
}

export type DieDefinition = StandardDie | NonStandardDie;

export type DieExpression = [number, DieDefinition, DieOperation];

export type ClassName = OfficialClass | string;

export type HitDice = {
  [key in HitDie]?: number;
};
