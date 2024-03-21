import Ajv from "ajv";
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
  IClass,
  isArbitraryOperandOperation,
  isAtomicVariable,
  isClassName,
  isDieExpression,
  isDoubleOperandOperation,
  isExpression,
  isNonStandardDie,
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
  Operation,
  SkillName,
  StatKey,
} from "./data/data-definitions";

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

export function averageDie(die: DieDefinition) {
  let numFaces;
  if (isStandardDie(die)) {
    numFaces = parseInt(die.replace("d", ""));
  } else {
    numFaces = die.numFaces;
  }
  return Math.round((numFaces + 1) / 2);
}

export function rollDie(die: DieDefinition) {
  if (isStandardDie(die)) return 1;
  if (isNonStandardDie(die)) return 2;
  throw new Error(
    "Tried to roll something that wasn't a die!" + JSON.stringify(die)
  );
}

function formatOperator(
  args: string[],
  startStr: string,
  endStr: string,
  connector?: string
) {
  return startStr + args.join(connector) + endStr;
}

export const OPERATORS: Record<
  Operation,
  {
    calculator: ExpressionCalculator;
    startStr: string;
    endStr: string;
    connector?: string;
  }
> = {
  ceil: {
    calculator: (args: number[]) => Math.ceil(args[0]),
    startStr: "",
    endStr: "",
  },
  floor: {
    calculator: (args: number[]) => Math.floor(args[0]),
    startStr: "",
    endStr: "",
  },
  subtraction: {
    calculator: (args: number[]) => args[0] - args[1],
    connector: " - ",
    startStr: "",
    endStr: "",
  },
  division: {
    calculator: (args: number[]) => args[0] / args[1],
    connector: ") / (",
    startStr: "(",
    endStr: ")",
  },
  addition: {
    calculator: (args: number[]) => args.reduce((a, b) => a + b),
    connector: " + ",
    startStr: "",
    endStr: "",
  },
  multiplication: {
    calculator: (args: number[]) => args.reduce((a, b) => a * b),
    connector: ") * (",
    startStr: "(",
    endStr: ")",
  },
  minimum: {
    calculator: (args: number[]) => args.reduce((a, b) => Math.min(a, b)),
    connector: " or ",
    startStr: "",
    endStr: ", whichever is lowest",
  },
  maximum: {
    calculator: (args: number[]) => args.reduce((a, b) => Math.max(a, b)),
    connector: " or ",
    startStr: "",
    endStr: ", whichever is highest",
  },
};

export function calculateAtomicVariable(
  atomicVariable: AtomicVariable,
  character: Character
): number {
  // Numbers are already calculated
  if (isNumber(atomicVariable)) return atomicVariable;
  // StatKeys pull the modifier for the specified stat
  if (isStatKey(atomicVariable))
    return modifier(character.stats[atomicVariable]);
  // Die expressions take the average value of the die specified multiplied by the number specified
  if (isDieExpression(atomicVariable))
    return atomicVariable[0] * averageDie(atomicVariable[1]);
  if (isPb(atomicVariable)) {
    return getPB(character);
  }
  // Classnames pull the level for the character in the specified class
  if (isClassName(atomicVariable))
    return levelInClass(atomicVariable, character);
  throw new Error(
    "Reached unreachable code in calculateAtomicVariable due to" +
      JSON.stringify(atomicVariable)
  );
}

export function withoutZero(num: number) {
  return num !== 0 ? num.toString() : "";
}

export function formatAtomicVariable(
  atomicVariable: AtomicVariable,
  character: Character,
  evaluateReferences: boolean = true
): string {
  // Numbers format as themselves
  if (isNumber(atomicVariable)) return withoutZero(atomicVariable);
  // StatKeys pull the modifier for the specified stat
  if (isStatKey(atomicVariable))
    return evaluateReferences
      ? withoutZero(modifier(character.stats[atomicVariable]))
      : atomicVariable;
  // Die expressions render in the form xdy where x is the number of dice and y is the number of faces per die
  if (isDieExpression(atomicVariable))
    return `${atomicVariable[0]}${
      isStandardDie(atomicVariable[1])
        ? atomicVariable[1]
        : `d${atomicVariable[1].numFaces}`
    }`;
  if (isPb(atomicVariable))
    return evaluateReferences ? getPB(character).toString() : "PB";
  // Classnames pull the level for the character in the specified class
  if (isClassName(atomicVariable))
    return evaluateReferences
      ? withoutZero(levelInClass(atomicVariable, character))
      : `${atomicVariable} level`;
  throw new Error(
    "Reached unreachable code in formatAtomicVariable due to" +
      JSON.stringify(atomicVariable)
  );
}

function formatCustomFormula(
  formula: CustomFormula,
  character: Character,
  evaluateReferences: boolean = true
): string {
  if (isAtomicVariable(formula))
    return formatAtomicVariable(formula, character, evaluateReferences);
  if (isExpression(formula))
    return formatExpression(formula, character, evaluateReferences);
  throw new Error(
    "Reached unreachable code in formatCustomFormula due to" +
      JSON.stringify(formula)
  );
}

export function formatExpression(
  expr: Expression,
  character: Character,
  evaluateReferences: boolean = true
): string {
  if (isDoubleOperandOperation(expr))
    return formatOperator(
      [
        formatCustomFormula(expr.operand1, character, evaluateReferences),
        formatCustomFormula(expr.operand2, character, evaluateReferences),
      ],
      OPERATORS[expr.operation].startStr,
      OPERATORS[expr.operation].endStr,
      OPERATORS[expr.operation].connector
    );
  if (isArbitraryOperandOperation(expr))
    return formatOperator(
      expr.operands.map((operand) =>
        formatCustomFormula(operand, character, evaluateReferences)
      ),
      OPERATORS[expr.operation].startStr,
      OPERATORS[expr.operation].endStr,
      OPERATORS[expr.operation].connector
    );
  if (isSingleOperandOperation(expr))
    return formatOperator(
      [formatCustomFormula(expr.operand1, character, evaluateReferences)],
      OPERATORS[expr.operation].startStr,
      OPERATORS[expr.operation].endStr,
      OPERATORS[expr.operation].connector
    );
  return "";
}

export function formatCustomFormulaWithDamage(
  formula: CustomFormulaWithDamage,
  character: Character
) {
  return (Object.entries(formula) as Array<[DamageType, CustomFormula]>)
    .map(([damageType, customFormula]) => {
      return `${formatCustomFormula(customFormula, character)} ${damageType}`;
    })
    .join(", ");
}

export function calculateCustomFormula(
  formula: CustomFormula,
  character: Character
): number {
  if (isAtomicVariable(formula))
    return calculateAtomicVariable(formula, character);
  if (isExpression(formula)) return calculateExpression(formula, character);
  throw new Error(
    "Reached unreachable code in calculateCustomFormula due to" +
      JSON.stringify(formula)
  );
}

export function calculateExpression(
  expr: Expression,
  character: Character
): number {
  if (isDoubleOperandOperation(expr))
    return OPERATORS[expr.operation].calculator([
      calculateCustomFormula(expr.operand1, character),
      calculateCustomFormula(expr.operand2, character),
    ]);
  if (isArbitraryOperandOperation(expr))
    return OPERATORS[expr.operation].calculator(
      expr.operands.map((operand) => calculateCustomFormula(operand, character))
    );
  if (isSingleOperandOperation(expr))
    return OPERATORS[expr.operation].calculator([
      calculateCustomFormula(expr.operand1, character),
    ]);
  return 0;
}

export function calculateCustomFormulaWithDamage(
  formula: CustomFormulaWithDamage,
  character: Character
) {
  return Object.fromEntries(
    (Object.entries(formula) as Array<[DamageType, CustomFormula]>).map(
      ([damageType, customFormula]) => {
        return [damageType, calculateCustomFormula(customFormula, character)];
      }
    )
  );
}

export function parseCustomFormula(
  formulaString: string
): CustomFormula | CustomFormulaWithDamage {
  // TODO
  // split string on instances of damage types using generated union from enum
  // for each substring, split on +/- with or without whitespace
  // for each segment, find a way to split on multiplication
  // for the item being multiplied in each segment, parse either one of the statkeys, a die type, or a constant int
  return 30;
}

export function totalGP(coins: CoinAmounts) {
  return sum(
    (Object.entries(coins) as Array<[CoinType, number]>).map(
      ([coin, numCoins]) => CoinValues[coin] * numCoins
    )
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
        (klass.subclass ? ` (${klass.subclass})` : "")
    )
    .join(", ");
}

export function levelInClass(className: ClassName, character: Character) {
  return character.class.find((klass) => klass.name === className)?.level || 0;
}

export function traverse(path: string, obj: any) {
  let result: any = obj;
  path.split(".").forEach((pathSegment) => {
    if (!pathSegment) return;
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
  value: any
) {
  const partialFieldName = fieldName.split(".").slice(0, -1).join(".");
  const leafNode = traverse(partialFieldName, character);
  leafNode[fieldName.split(".").slice(-1)[0]] = value;
}

export function validateCharacterData(characterData: string) {
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(characterData);

  return [valid, validate.errors];
}
