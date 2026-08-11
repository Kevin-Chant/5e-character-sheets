import { isNumber } from "lodash";
import {
  AtomicVariable,
  Character,
  CustomFormula,
  CustomFormulaWithDamage,
  Expression,
  ExpressionCalculator,
  SaveEffect,
  isArbitraryOperandOperation,
  isAtomicVariable,
  isClassLevel,
  isEquippedArmor,
  isDieExpression,
  isDoubleOperandOperation,
  isExpression,
  isPb,
  isSingleOperandOperation,
  isSpellMod,
  isStandardDie,
  isStatKey,
} from "src/lib/types";
import { UUID } from "crypto";
import { DamageType, Operation } from "./data/data-definitions";
import {
  classNameForId,
  equippedArmorAC,
  getDieOperation,
  getPB,
  levelOfClassId,
  modifier,
  saveDcFormula,
  spellcastingAbilityFor,
} from "./rules";

// Spell save DC for a class: `saveDcOverride` if set, else 8 + PB + spellcasting ability.
export function getSpellSaveDcFormula(
  character: Character,
  classId: UUID,
): CustomFormula {
  const entry = character.spellcastingClasses.find(
    (c) => c.classId === classId,
  );
  return (
    entry?.saveDcOverride ??
    saveDcFormula(spellcastingAbilityFor(character, classId))
  );
}

// Spell attack bonus for a class: `attackBonusOverride` if set, else PB + spellcasting modifier.
export function getSpellAttackBonus(
  character: Character,
  classId: UUID,
): number {
  const entry = character.spellcastingClasses.find(
    (c) => c.classId === classId,
  );
  if (entry?.attackBonusOverride)
    return calculateCustomFormula(entry.attackBonusOverride, character);
  return (
    getPB(character) +
    modifier(character.stats[spellcastingAbilityFor(character, classId)])
  );
}

/** A formatted formula piece, carrying the precedence a parent needs to combine it correctly. */
export interface FormattedPart {
  text: string;
  /** Binding strength, used to decide when a parent must wrap this in parens. */
  precedence: number;
  /** Set iff this whole subtree resolves to a constant number. */
  numericValue?: number;
}

// Precedence levels. Higher binds tighter; atoms (and self-delimiting
// function-call forms like `min(...)`) never need outer parens.
const PREC_CLAMP = 0; // "x, between a and b" — not self-delimiting, wrap when nested
const PREC_ADD = 1;
const PREC_MUL = 2;
const PREC_ATOM = Infinity;

function numberPart(value: number): FormattedPart {
  return {
    text: withoutZero(value),
    precedence: PREC_ATOM,
    numericValue: value,
  };
}

/** Wrap a child in parens when it binds more loosely than the parent context. */
function paren(part: FormattedPart, threshold: number): string {
  return part.precedence < threshold ? `(${part.text})` : part.text;
}

/** Like {@link paren}, but also wraps equal-precedence children (right side of `-`, `/`). */
function parenStrict(part: FormattedPart, threshold: number): string {
  return part.precedence <= threshold ? `(${part.text})` : part.text;
}

interface OperatorDescriptor {
  calculator: ExpressionCalculator;
  /** Precedence of the node this operator produces. */
  precedence: number;
  /** Combine already-formatted operand parts into this node's text. */
  format: (parts: FormattedPart[]) => string;
}

export const OPERATORS: Record<Operation, OperatorDescriptor> = {
  ceil: {
    calculator: (args: number[]) => Math.ceil(args[0]),
    precedence: PREC_ATOM,
    format: (parts) => `round up(${parts[0].text})`,
  },
  floor: {
    calculator: (args: number[]) => Math.floor(args[0]),
    precedence: PREC_ATOM,
    format: (parts) => `round down(${parts[0].text})`,
  },
  subtraction: {
    calculator: (args: number[]) => args[0] - args[1],
    precedence: PREC_ADD,
    format: ([a, b]) =>
      // Subtracting a negative reads better as an addition.
      b.numericValue !== undefined && b.numericValue < 0
        ? `${paren(a, PREC_ADD)} + ${-b.numericValue}`
        : `${paren(a, PREC_ADD)} - ${parenStrict(b, PREC_ADD)}`,
  },
  division: {
    calculator: (args: number[]) => args[0] / args[1],
    precedence: PREC_MUL,
    format: ([n, d]) => `${paren(n, PREC_MUL)} / ${parenStrict(d, PREC_MUL)}`,
  },
  addition: {
    calculator: (args: number[]) => args.reduce((a, b) => a + b),
    precedence: PREC_ADD,
    format: (parts) => formatAdditive(parts),
  },
  multiplication: {
    calculator: (args: number[]) => args.reduce((a, b) => a * b),
    precedence: PREC_MUL,
    format: (parts) => formatMultiplicative(parts),
  },
  minimum: {
    calculator: (args: number[]) => args.reduce((a, b) => Math.min(a, b)),
    precedence: PREC_ATOM,
    format: (parts) => `min(${parts.map((p) => p.text).join(", ")})`,
  },
  maximum: {
    calculator: (args: number[]) => args.reduce((a, b) => Math.max(a, b)),
    precedence: PREC_ATOM,
    format: (parts) => `max(${parts.map((p) => p.text).join(", ")})`,
  },
};

/** Labels between operand inputs in the formula builder; separate vocabulary from the display formatter. */
export const EDITOR_SYNTAX: Record<
  Operation,
  { startStr: string; connector: string; endStr: string }
> = {
  ceil: { startStr: "round up(", connector: "", endStr: ")" },
  floor: { startStr: "round down(", connector: "", endStr: ")" },
  subtraction: { startStr: "", connector: " - ", endStr: "" },
  division: { startStr: "(", connector: ") / (", endStr: ")" },
  addition: { startStr: "", connector: " + ", endStr: "" },
  multiplication: { startStr: "(", connector: ") * (", endStr: ")" },
  minimum: { startStr: "min(", connector: ", ", endStr: ")" },
  maximum: { startStr: "max(", connector: ", ", endStr: ")" },
};

export function withoutZero(num: number) {
  return num !== 0 ? num.toString() : "";
}

/** Render an addition, folding constants and flipping negatives (`a + -1` → `a - 1`). */
function formatAdditive(parts: FormattedPart[]): string {
  const constSum = parts
    .filter((p) => p.numericValue !== undefined)
    .reduce((acc, p) => acc + (p.numericValue as number), 0);
  const ordered = parts.filter((p) => p.numericValue === undefined);
  if (constSum !== 0 || ordered.length === 0)
    ordered.push(numberPart(constSum));

  return ordered.reduce((out, p, i) => {
    const negative = p.numericValue !== undefined && p.numericValue < 0;
    if (i === 0) return paren(p, PREC_ADD);
    if (negative) return `${out} - ${withoutZero(-(p.numericValue as number))}`;
    return `${out} + ${paren(p, PREC_ADD)}`;
  }, "");
}

/** Render a multiplication, folding constant factors into a single number. */
function formatMultiplicative(parts: FormattedPart[]): string {
  const product = parts
    .filter((p) => p.numericValue !== undefined)
    .reduce((acc, p) => acc * (p.numericValue as number), 1);
  const terms = parts
    .filter((p) => p.numericValue === undefined)
    .map((p) => paren(p, PREC_MUL));
  if (product !== 1) terms.push(`${product}`);
  return terms.join(" * ") || `${product}`;
}

export function calculateAtomicVariable(
  atomicVariable: AtomicVariable,
  character: Character,
): number {
  if (isNumber(atomicVariable)) return atomicVariable;
  if (isStatKey(atomicVariable))
    return modifier(character.stats[atomicVariable]);
  if (isDieExpression(atomicVariable))
    return (
      atomicVariable[0] * getDieOperation(atomicVariable[2])(atomicVariable[1])
    );
  if (isPb(atomicVariable)) {
    return getPB(character);
  }
  if (isSpellMod(atomicVariable))
    return modifier(
      character.stats[
        spellcastingAbilityFor(character, atomicVariable.spellMod)
      ],
    );
  if (isClassLevel(atomicVariable))
    return levelOfClassId(character, atomicVariable.classLevel);
  if (isEquippedArmor(atomicVariable)) return equippedArmorAC(character);
  throw new Error(
    "Reached unreachable code in calculateAtomicVariable due to" +
      JSON.stringify(atomicVariable),
  );
}

function formatAtomicVariablePart(
  atomicVariable: AtomicVariable,
  character: Character,
  evaluateReferences: boolean,
): FormattedPart {
  if (isNumber(atomicVariable)) return numberPart(atomicVariable);
  if (isStatKey(atomicVariable))
    return evaluateReferences
      ? numberPart(modifier(character.stats[atomicVariable]))
      : { text: `${atomicVariable} mod`, precedence: PREC_ATOM };
  // Die expressions render as xdy and never resolve to a constant.
  if (isDieExpression(atomicVariable))
    return {
      text: `${atomicVariable[0]}${
        isStandardDie(atomicVariable[1])
          ? atomicVariable[1]
          : `d${atomicVariable[1].numFaces}`
      }`,
      precedence: PREC_ATOM,
    };
  if (isPb(atomicVariable))
    return evaluateReferences
      ? numberPart(getPB(character))
      : { text: "PB", precedence: PREC_ATOM };
  if (isSpellMod(atomicVariable))
    return evaluateReferences
      ? numberPart(
          modifier(
            character.stats[
              spellcastingAbilityFor(character, atomicVariable.spellMod)
            ],
          ),
        )
      : { text: "spellcasting mod", precedence: PREC_ATOM };
  if (isClassLevel(atomicVariable))
    return evaluateReferences
      ? numberPart(levelOfClassId(character, atomicVariable.classLevel))
      : {
          text: `${classNameForId(character, atomicVariable.classLevel) ?? "Class"} level`,
          precedence: PREC_ATOM,
        };
  if (isEquippedArmor(atomicVariable))
    return evaluateReferences
      ? numberPart(equippedArmorAC(character))
      : { text: "armor", precedence: PREC_ATOM };
  throw new Error(
    "Reached unreachable code in formatAtomicVariable due to" +
      JSON.stringify(atomicVariable),
  );
}

function formatCustomFormulaPart(
  formula: CustomFormula,
  character: Character,
  evaluateReferences: boolean,
): FormattedPart {
  if (isAtomicVariable(formula))
    return formatAtomicVariablePart(formula, character, evaluateReferences);
  if (isExpression(formula))
    return formatExpressionPart(formula, character, evaluateReferences);
  throw new Error(
    "Reached unreachable code in formatCustomFormula due to" +
      JSON.stringify(formula),
  );
}

/**
 * Recognize the clamp idiom — `max(lo, min(hi, x))` or `min(hi, max(lo, x))`
 * with constant bounds — and render it as "x, between lo and hi". Returns
 * undefined otherwise, so callers fall back to the generic `min`/`max` form.
 */
function asClamp(
  expr: Expression,
  character: Character,
  evaluateReferences: boolean,
): FormattedPart | undefined {
  const outer = expr.operation;
  if (outer !== "maximum" && outer !== "minimum") return undefined;
  if (!isArbitraryOperandOperation(expr) || expr.operands.length !== 2)
    return undefined;
  const innerOp = outer === "maximum" ? "minimum" : "maximum";

  for (const [boundIdx, innerIdx] of [
    [0, 1],
    [1, 0],
  ]) {
    const outerBound = expr.operands[boundIdx];
    const inner = expr.operands[innerIdx];
    if (!isNumber(outerBound)) continue;
    if (
      !isExpression(inner) ||
      inner.operation !== innerOp ||
      !isArbitraryOperandOperation(inner) ||
      inner.operands.length !== 2
    )
      continue;

    for (const [innerBoundIdx, valueIdx] of [
      [0, 1],
      [1, 0],
    ]) {
      const innerBound = inner.operands[innerBoundIdx];
      const value = inner.operands[valueIdx];
      if (!isNumber(innerBound)) continue;
      const valuePart = formatCustomFormulaPart(
        value,
        character,
        evaluateReferences,
      );
      if (valuePart.numericValue !== undefined) continue;
      // `max` supplies the lower bound, `min` the upper bound.
      const lo = outer === "maximum" ? outerBound : innerBound;
      const hi = outer === "maximum" ? innerBound : outerBound;
      return {
        text: `${valuePart.text}, between ${lo} and ${hi}`,
        precedence: PREC_CLAMP,
      };
    }
  }
  return undefined;
}

function formatExpressionPart(
  expr: Expression,
  character: Character,
  evaluateReferences: boolean,
): FormattedPart {
  const op = OPERATORS[expr.operation];
  let operands: CustomFormula[];
  if (isArbitraryOperandOperation(expr)) operands = expr.operands;
  else if (isDoubleOperandOperation(expr))
    operands = [expr.operand1, expr.operand2];
  else operands = [expr.operand1];

  const parts = operands.map((operand) =>
    formatCustomFormulaPart(operand, character, evaluateReferences),
  );

  // A subtree with no symbolic leaves folds to a single constant.
  if (parts.length > 0 && parts.every((p) => p.numericValue !== undefined))
    return numberPart(
      op.calculator(parts.map((p) => p.numericValue as number)),
    );

  const clamp = asClamp(expr, character, evaluateReferences);
  if (clamp) return clamp;

  return { text: op.format(parts), precedence: op.precedence };
}

export function formatAtomicVariable(
  atomicVariable: AtomicVariable,
  character: Character,
  evaluateReferences: boolean = true,
): string {
  return formatAtomicVariablePart(atomicVariable, character, evaluateReferences)
    .text;
}

export function formatCustomFormula(
  formula: CustomFormula,
  character: Character,
  evaluateReferences: boolean = true,
): string {
  return formatCustomFormulaPart(formula, character, evaluateReferences).text;
}

export function formatExpression(
  expr: Expression,
  character: Character,
  evaluateReferences: boolean = true,
): string {
  return formatExpressionPart(expr, character, evaluateReferences).text;
}

export function formatCustomFormulaWithDamage(
  formula: CustomFormulaWithDamage,
  character: Character,
  evaluateReferences: boolean = true,
) {
  return (Object.entries(formula) as Array<[DamageType, CustomFormula]>)
    .map(([damageType, customFormula]) => {
      return `${formatCustomFormula(
        customFormula,
        character,
        evaluateReferences,
      )} ${damageType}`;
    })
    .join(", ");
}

// "DC 15 DEX" — the at-a-glance form of a `SaveEffect`. Ability is omitted
// when the effect doesn't fix one, leaving a bare "DC 15".
export function formatSaveEffect(
  save: SaveEffect,
  character: Character,
): string {
  const dc = calculateCustomFormula(save.dc, character);
  return save.stat ? `DC ${dc} ${save.stat.toUpperCase()}` : `DC ${dc}`;
}

// Longer prose form: the DC, what a success does, and any advisory note.
export function describeSaveEffect(
  save: SaveEffect,
  character: Character,
): string {
  const parts = [`${formatSaveEffect(save, character)} saving throw`];
  if (save.onSuccess === "half") parts.push("half damage on a success");
  else if (save.onSuccess === "none") parts.push("no damage on a success");
  if (save.note) parts.push(save.note);
  return parts.join(" — ");
}

export function calculateCustomFormula(
  formula: CustomFormula,
  character: Character,
): number {
  if (isAtomicVariable(formula))
    return calculateAtomicVariable(formula, character);
  if (isExpression(formula)) return calculateExpression(formula, character);
  throw new Error(
    "Reached unreachable code in calculateCustomFormula due to" +
      JSON.stringify(formula),
  );
}

export function calculateExpression(
  expr: Expression,
  character: Character,
): number {
  if (isDoubleOperandOperation(expr))
    return OPERATORS[expr.operation].calculator([
      calculateCustomFormula(expr.operand1, character),
      calculateCustomFormula(expr.operand2, character),
    ]);
  if (isArbitraryOperandOperation(expr))
    return OPERATORS[expr.operation].calculator(
      expr.operands.map((operand) =>
        calculateCustomFormula(operand, character),
      ),
    );
  if (isSingleOperandOperation(expr))
    return OPERATORS[expr.operation].calculator([
      calculateCustomFormula(expr.operand1, character),
    ]);
  return 0;
}

export function calculateCustomFormulaWithDamage(
  formula: CustomFormulaWithDamage,
  character: Character,
) {
  return Object.fromEntries(
    (Object.entries(formula) as Array<[DamageType, CustomFormula]>).map(
      ([damageType, customFormula]) => {
        return [damageType, calculateCustomFormula(customFormula, character)];
      },
    ),
  );
}
