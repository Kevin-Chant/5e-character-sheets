import Ajv from "ajv";
import { isNumber, sum } from "lodash";
import {
  Addition,
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
  SpellSlots,
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
import { isNumericLiteral } from "typescript";

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
    "Tried to roll something that wasn't a die!" + JSON.stringify(die)
  );
}

export function getDieOperation(
  operation: DieOperation
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
        "Reached unreachable code in getDieOperation due to" + operation
      );
  }
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
      : `${atomicVariable} mod`;
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

export function formatCustomFormula(
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
  character: Character,
  evaluateReferences: boolean = true
) {
  return (Object.entries(formula) as Array<[DamageType, CustomFormula]>)
    .map(([damageType, customFormula]) => {
      return `${formatCustomFormula(
        customFormula,
        character,
        evaluateReferences
      )} ${damageType}`;
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
  value: any
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
        (hitDice[getHitDie(klass.name)] || 0) + klass.level)
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
        : []
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
      })
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
  spellcastingLevel: number
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
  slotLevel: SpellLevel
): number {
  return getSpellSlotsByLevelAndSpellcasterLevel(
    slotLevel,
    calculateSpellcasterLevel(character)
  );
}

export const OPTIONAL_FIELD_INITIALIZERS: {
  [key in FIELD]?: (
    character: Character,
    subField?: string
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
        "cannot get optional info for spellcastingClasses without a subField"
      );
    const [index, subSubField] = subField.split(".");
    if (subSubField === "abilityOverride") {
      return getSpellcastingAbility(
        character.spellcastingClasses[parseInt(index)].class
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
              character.spellcastingClasses[parseInt(index)].class
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
              character.spellcastingClasses[parseInt(index)].class
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
