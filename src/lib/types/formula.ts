import { UUID } from "crypto";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";

// The formula engine's data model: the recursive `CustomFormula` a computed
// field (AC, HP, an attack's damage) is stored as, plus the dice and class-name
// primitives it leans on. The engine that folds these to a number, and the one
// that renders them as prose, live in `src/lib/formula.ts`.

// The spellcasting-ability modifier of a specific spellcasting class. Resolved
// live against the character (honoring any `abilityOverride`), so a spell like
// Cure Wounds — `1d8 + spellMod` — tracks the class's current ability. Carries
// the class *id* because a multiclassed character has more than one (and so a
// class rename never breaks the reference).
export interface SpellMod {
  spellMod: UUID;
}

// The character's level in a specific class, as a formula leaf (e.g. Sorcery
// Points = Sorcerer level). References the class by stable `id`.
export interface ClassLevel {
  classLevel: UUID;
}

// A computed AC leaf: the AC from the character's *equipped* armor and shields,
// resolved live (see `equippedArmorAC`) so equipping/unequipping updates AC with
// no formula rewrite. Falls back to the unarmored 10 + DEX when no armor is worn.
// A marker object (mirrors `ClassLevel`/`SpellMod`) rather than a bare string so
// the engine's type guards can distinguish it structurally.
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

// The three operand shapes an `Expression` is built from. Exported only so the
// typeguards in `types/guards.ts` can name them — no consumer composes these
// directly, they compose the concrete operations below.
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
  [key in StandardDie]?: number;
};
