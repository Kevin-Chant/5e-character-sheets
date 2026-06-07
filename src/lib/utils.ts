import Ajv from "ajv";
import { UUID } from "crypto";
import { isNumber, sum } from "lodash";
import {
  AtomicVariable,
  Character,
  ClassName,
  CoinAmounts,
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  Expression,
  ExpressionCalculator,
  HitDice,
  IClass,
  isArbitraryOperandOperation,
  isAtomicVariable,
  isClassName,
  isDieExpression,
  isDoubleOperandOperation,
  isExpression,
  isNonStandardDie,
  isOfficialClass,
  isPb,
  isSingleOperandOperation,
  isStandardDie,
  isStatKey,
} from "src/lib/types";
import * as schema from "src/schema.json";
import {
  CoinType,
  CoinValues,
  DamageType,
  DieOperation,
  FIELD,
  HIT_DICE,
  OfficialClass,
  Operation,
  SPELLCASTING_ABILITIES,
  SkillName,
  SpellLevel,
  StandardDie,
  StatKey,
} from "./data/data-definitions";

// `crypto.randomUUID` is only exposed in secure contexts (HTTPS or localhost).
// Over plain HTTP on a LAN IP it's undefined, so fall back to a v4 UUID built
// from `crypto.getRandomValues`, which is available in non-secure contexts too.
export function randomUUID(): UUID {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-") as UUID;
}

// Like `crypto.randomUUID`, `navigator.clipboard` is only exposed in secure
// contexts, so it's undefined over plain HTTP on a LAN IP. Fall back to the
// legacy `execCommand("copy")` against an off-screen textarea in that case.
export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  } finally {
    document.body.removeChild(textarea);
  }
}

const ORDINAL_SUFFIXES = ["th", "st", "nd", "rd"];

export const STAT_NAMES: Record<StatKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const DAMAGE_TYPES = Object.keys(DamageType);

export const SKILL_SOURCE_STATS: Record<SkillName, StatKey> = {
  Acrobatics: StatKey.dex,
  "Animal Handling": StatKey.wis,
  Arcana: StatKey.int,
  Athletics: StatKey.str,
  Deception: StatKey.cha,
  History: StatKey.int,
  Insight: StatKey.wis,
  Intimidation: StatKey.cha,
  Investigation: StatKey.int,
  Medicine: StatKey.wis,
  Nature: StatKey.int,
  Perception: StatKey.wis,
  Performance: StatKey.cha,
  Persuasion: StatKey.cha,
  Religion: StatKey.int,
  "Sleight of Hand": StatKey.dex,
  Stealth: StatKey.dex,
  Survival: StatKey.wis,
  "Thieves Tools": StatKey.dex,
};

export function modifier(stat: number) {
  return Math.floor((stat - 10) / 2);
}

export function strmod(character: Character) {
  return modifier(character.stats.str);
}

export function dexmod(character: Character) {
  return modifier(character.stats.dex);
}

export function conmod(character: Character) {
  return modifier(character.stats.con);
}

export function intmod(character: Character) {
  return modifier(character.stats.int);
}

export function wismod(character: Character) {
  return modifier(character.stats.wis);
}

export function chamod(character: Character) {
  return modifier(character.stats.cha);
}

export function getPB(character: Character) {
  if (character.pbOverride) {
    return character.pbOverride;
  } else {
    const totalLevel = sum(character.class.map((classDef) => classDef.level));
    return Math.floor((totalLevel - 1) / 4) + 2;
  }
}

export function averageDie(die: DieDefinition, rounder = Math.round) {
  let numFaces;
  if (isStandardDie(die)) {
    numFaces = parseInt(die.replace("d", ""));
  } else {
    numFaces = die.numFaces;
  }
  return rounder((numFaces + 1) / 2);
}

export function rollDie(die: DieDefinition) {
  if (isStandardDie(die)) return 1;
  if (isNonStandardDie(die)) return 2;
  throw new Error(
    "Tried to roll something that wasn't a die!" + JSON.stringify(die),
  );
}

export function getDieOperation(
  operation: DieOperation,
): (die: DieDefinition) => number {
  switch (operation) {
    case "average":
      return averageDie;
    case "average-roundedup":
      return (die) => averageDie(die, Math.ceil);
    case "average-roundeddown":
      return (die) => averageDie(die, Math.floor);
    case "roll":
      return rollDie;
    case "max":
      return (die: DieDefinition) =>
        isStandardDie(die) ? parseInt(die.replace("d", "")) : die.numFaces;
    default:
      throw new Error(
        "Reached unreachable code in getDieOperation due to" + operation,
      );
  }
}

/**
 * A formatted piece of a formula, carrying the structural context a parent
 * expression needs to combine it correctly. Returning these instead of bare
 * strings is what lets the formatter parenthesize by precedence, flip the sign
 * of negative terms, and fold constant subtrees together.
 */
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

/**
 * Like {@link paren} but also wraps equal-precedence children — needed on the
 * right side of non-associative operators (`a - (b - c)`, `a / (b * c)`).
 */
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

/**
 * Edit-mode chrome (the labels rendered between operand inputs in the formula
 * builder). Kept separate from the display formatter above so the two don't
 * have to share one vocabulary — the builder shows raw structure, the display
 * formatter shows polished prose.
 */
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

/**
 * Render an addition, collapsing all constant terms into a single number and
 * flipping the sign of negative terms (`a + -1` becomes `a - 1`).
 */
function formatAdditive(parts: FormattedPart[]): string {
  const constSum = parts
    .filter((p) => p.numericValue !== undefined)
    .reduce((acc, p) => acc + (p.numericValue as number), 0);
  const ordered = parts.filter((p) => p.numericValue === undefined);
  // Keep a folded constant only when it carries weight (or is all we have).
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
  // Numbers are already calculated
  if (isNumber(atomicVariable)) return atomicVariable;
  // StatKeys pull the modifier for the specified stat
  if (isStatKey(atomicVariable))
    return modifier(character.stats[atomicVariable]);
  // Die expressions run the specified operation on the given die multiplied by the number specified
  if (isDieExpression(atomicVariable))
    return (
      atomicVariable[0] * getDieOperation(atomicVariable[2])(atomicVariable[1])
    );
  if (isPb(atomicVariable)) {
    return getPB(character);
  }
  // Classnames pull the level for the character in the specified class
  if (isClassName(atomicVariable))
    return levelInClass(atomicVariable, character);
  throw new Error(
    "Reached unreachable code in calculateAtomicVariable due to" +
      JSON.stringify(atomicVariable),
  );
}

export function withoutZero(num: number) {
  return num !== 0 ? num.toString() : "";
}

function formatAtomicVariablePart(
  atomicVariable: AtomicVariable,
  character: Character,
  evaluateReferences: boolean,
): FormattedPart {
  // Numbers are constants and fold like any other resolved value.
  if (isNumber(atomicVariable)) return numberPart(atomicVariable);
  // StatKeys pull the modifier for the specified stat.
  if (isStatKey(atomicVariable))
    return evaluateReferences
      ? numberPart(modifier(character.stats[atomicVariable]))
      : { text: `${atomicVariable} mod`, precedence: PREC_ATOM };
  // Die expressions render in the form xdy and never resolve to a constant.
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
  // Classnames pull the level for the character in the specified class.
  if (isClassName(atomicVariable))
    return evaluateReferences
      ? numberPart(levelInClass(atomicVariable, character))
      : { text: `${atomicVariable} level`, precedence: PREC_ATOM };
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
 * undefined for any shape that isn't a clamp (3+ operands, symbolic bounds, or
 * a value that would itself fold to a constant), so callers fall back to the
 * generic functional `min(...)`/`max(...)` form.
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
      // A constant value should fold to a number rather than read as a clamp.
      if (valuePart.numericValue !== undefined) continue;
      // `max` supplies the lower bound, `min` the upper bound.
      const lo = outer === "maximum" ? outerBound : innerBound;
      const hi = outer === "maximum" ? innerBound : outerBound;
      // Bounds print literally — a 0 bound is meaningful, unlike additive terms.
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

export function totalGP(coins: CoinAmounts) {
  return sum(
    (Object.entries(coins) as Array<[CoinType, number]>).map(
      ([coin, numCoins]) => CoinValues[coin] * numCoins,
    ),
  );
}

export function ordinal(num: number) {
  const mod = num % 100;
  return (
    num +
    (ORDINAL_SUFFIXES[(mod - 20) % 10] ||
      ORDINAL_SUFFIXES[mod] ||
      ORDINAL_SUFFIXES[0])
  );
}

export function formatClass(klasses: IClass[]) {
  return klasses
    .map(
      (klass) =>
        `${ordinal(klass.level)} ${klass.name}` +
        (klass.subclass ? ` (${klass.subclass})` : ""),
    )
    .join(", ");
}

export function levelInClass(className: ClassName, character: Character) {
  return character.class.find((klass) => klass.name === className)?.level || 0;
}

export function traverse(path: string, obj: any) {
  let result: any = obj;
  path.split(".").forEach((pathSegment) => {
    if (!pathSegment || !result) return;
    result = result[pathSegment];
  });
  return result;
}

export function getFieldValue(fieldName: string, character: Character) {
  return traverse(fieldName, character);
}

export function setFieldValue(
  fieldName: string,
  character: Character,
  value: any,
) {
  const partialFieldName = fieldName.split(".").slice(0, -1).join(".");
  const leafNode = traverse(partialFieldName, character);
  let index: string | number = fieldName.split(".").slice(-1)[0];
  const parsed = parseInt(index);
  if (!isNaN(parsed)) index = parsed;
  leafNode[index] = value;
}

export function validateCharacterData(characterData: string) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(characterData);

  return [valid, validate.errors];
}

function getHitDie(className: ClassName): StandardDie {
  return isOfficialClass(className)
    ? HIT_DICE[className]
    : // TODO: Allow for homebrew classes to define hit dice
      StandardDie.d8;
}

export function getHitDice(character: Character): HitDice {
  const hitDice: HitDice = {};
  character.class.forEach(
    (klass) =>
      (hitDice[getHitDie(klass.name)] =
        (hitDice[getHitDie(klass.name)] || 0) + klass.level),
  );
  return hitDice;
}

export function getHpFormula(character: Character): CustomFormula {
  const firstClass = character.class[0];
  const rest = character.class.slice(1);
  const firstClassHp = {
    operation: Operation.addition,
    operands: (
      [
        [1, getHitDie(firstClass.name), DieOperation.max],
        StatKey.con,
      ] as CustomFormula[]
    ).concat(
      firstClass.level > 1
        ? [
            {
              operation: Operation.multiplication,
              operands: [
                {
                  operation: Operation.addition,
                  operands: [
                    [
                      1,
                      getHitDie(firstClass.name),
                      DieOperation["average-roundedup"],
                    ],
                    StatKey.con,
                  ],
                },
                {
                  operation: Operation.subtraction,
                  operand1: firstClass.name,
                  operand2: 1,
                },
              ],
            },
          ]
        : [],
    ),
  } as CustomFormula;
  if (rest.length === 0) return firstClassHp;
  return {
    operation: Operation.addition,
    operands: [firstClassHp].concat(
      rest.map((classDef) => {
        return {
          operation: Operation.multiplication,
          operands: [
            classDef.name,
            {
              operation: Operation.addition,
              operands: [
                [
                  1,
                  getHitDie(classDef.name),
                  DieOperation["average-roundedup"],
                ],
                StatKey.con,
              ],
            },
          ],
        };
      }),
    ),
  };
}

export function getSpellcastingAbility(className: ClassName) {
  return isOfficialClass(className)
    ? SPELLCASTING_ABILITIES[className] || StatKey.int
    : StatKey.int;
}

export function getNumericSpellSlotLevel(level: SpellLevel) {
  return {
    [SpellLevel.First]: 1,
    [SpellLevel.Second]: 2,
    [SpellLevel.Third]: 3,
    [SpellLevel.Fourth]: 4,
    [SpellLevel.Fifth]: 5,
    [SpellLevel.Sixth]: 6,
    [SpellLevel.Seventh]: 7,
    [SpellLevel.Eighth]: 8,
    [SpellLevel.Ninth]: 9,
  }[level];
}

export function getPactSlotInfo(character: Character) {
  const warlockLevel =
    character.class.find((klass) => klass.name === OfficialClass.Warlock)
      ?.level || 0;
  const total =
    warlockLevel < 2
      ? warlockLevel
      : warlockLevel < 11
        ? 2
        : warlockLevel < 17
          ? 3
          : 4;
  const level = Math.min(5, Math.floor((warlockLevel + 1) / 2));
  return {
    level: level,
    total: total,
  };
}

export function getSpellSlotsByLevelAndSpellcasterLevel(
  slotLevel: SpellLevel,
  spellcastingLevel: number,
) {
  switch (slotLevel) {
    case SpellLevel.First:
      return spellcastingLevel < 1
        ? 0
        : spellcastingLevel === 1
          ? 2
          : spellcastingLevel === 2
            ? 3
            : 4;
    case SpellLevel.Second:
      return spellcastingLevel < 3 ? 0 : spellcastingLevel === 3 ? 2 : 3;
    case SpellLevel.Third:
      return spellcastingLevel < 5 ? 0 : spellcastingLevel === 5 ? 2 : 3;
    case SpellLevel.Fourth:
      return spellcastingLevel < 7
        ? 0
        : spellcastingLevel === 7
          ? 1
          : spellcastingLevel === 8
            ? 2
            : 3;
    case SpellLevel.Fifth:
      return spellcastingLevel < 9
        ? 0
        : spellcastingLevel === 9
          ? 1
          : spellcastingLevel < 18
            ? 2
            : 3;
    case SpellLevel.Sixth:
      return spellcastingLevel < 11 ? 0 : spellcastingLevel < 19 ? 1 : 2;
    case SpellLevel.Seventh:
      return spellcastingLevel < 13 ? 0 : spellcastingLevel < 20 ? 1 : 2;
    case SpellLevel.Eighth:
      return spellcastingLevel < 15 ? 0 : 1;
    case SpellLevel.Ninth:
      return spellcastingLevel < 17 ? 0 : 1;
  }
}

export function calculateSpellcasterLevel(character: Character) {
  return character.class
    .map((klass) => {
      if (!isOfficialClass(klass.name)) return 0;
      if (
        [
          OfficialClass.Bard,
          OfficialClass.Cleric,
          OfficialClass.Druid,
          OfficialClass.Sorcerer,
          OfficialClass.Wizard,
        ].includes(klass.name)
      )
        return klass.level;
      if ([OfficialClass.Paladin, OfficialClass.Ranger].includes(klass.name))
        return Math.floor(klass.level / 2);
      if (klass.name === OfficialClass.Artificer)
        return Math.ceil(klass.level / 2);
      if (
        (klass.name === OfficialClass.Fighter &&
          klass.subclass === "Eldritch Knight") ||
        (klass.name === OfficialClass.Rogue &&
          klass.subclass === "Arcane Trickster")
      )
        return Math.floor(klass.level / 3);
      return 0;
    })
    .reduce((a, b) => a + b);
}

export function getDefaultSpellSlots(
  character: Character,
  slotLevel: SpellLevel,
): number {
  return getSpellSlotsByLevelAndSpellcasterLevel(
    slotLevel,
    calculateSpellcasterLevel(character),
  );
}

export const OPTIONAL_FIELD_INITIALIZERS: {
  [key in FIELD]?: (
    character: Character,
    subField?: string,
  ) => CustomFormula | undefined;
} = {
  pbOverride: getPB,
  maxHp: getHpFormula,
  expendedHitDice: () => 0,
  exp: () => 0,
  coins: () => 0,
  spellcastingClasses: (character, subField) => {
    if (!subField)
      throw new Error(
        "cannot get optional info for spellcastingClasses without a subField",
      );
    const [index, subSubField] = subField.split(".");
    if (subSubField === "abilityOverride") {
      return getSpellcastingAbility(
        character.spellcastingClasses[parseInt(index)].class,
      );
    }
    if (subSubField === "saveDcOverride") {
      return {
        operation: Operation.addition,
        operands: [
          8,
          "proficiencyBonus",
          character.spellcastingClasses[parseInt(index)].abilityOverride ||
            getSpellcastingAbility(
              character.spellcastingClasses[parseInt(index)].class,
            ),
        ],
      };
    } else if (subSubField === "attackBonusOverride") {
      return {
        operation: Operation.addition,
        operands: [
          "proficiencyBonus",
          character.spellcastingClasses[parseInt(index)].abilityOverride ||
            getSpellcastingAbility(
              character.spellcastingClasses[parseInt(index)].class,
            ),
        ],
      };
    }
    return undefined;
  },
  spellSlots: (character, subField) =>
    subField?.split(".")[1] === "totalOverride"
      ? getDefaultSpellSlots(character, subField?.split(".")[0] as SpellLevel)
      : undefined,
  pactSlots: (character, subField) =>
    subField === "totalOverride"
      ? getPactSlotInfo(character).total
      : subField === "levelOverride"
        ? getPactSlotInfo(character).level
        : undefined,
};
