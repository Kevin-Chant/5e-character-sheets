import {
  every,
  isArray,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from "lodash";
import {
  Alignment,
  CoinType,
  DamageType,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  SkillName,
  StandardDie,
  StatKey,
  FIELD,
  SpellLevel,
} from "./data/data-definitions";
import { UUID } from "crypto";

//////////////////////
// Begin Typeguards //
//////////////////////
export function isUuid(data: any): data is UUID {
  return typeof data === "string" && !!data.match(/^\w+-\w+-\w+-\w+-\w+$/);
}
export function isArr<T>(
  data: any,
  validator: (data: any) => data is T
): data is Array<T> {
  if (!Array.isArray(data)) return false;
  return every(data, validator);
}

export function isMap<K extends string | number | symbol, V>(
  data: any,
  kValidator: (data: any) => data is K,
  vValidator: (data: any) => data is V
): data is Record<K, V> {
  return (
    isObject(data) &&
    every(Object.keys(data), kValidator) &&
    every(Object.values(data), vValidator)
  );
}

export function isTextComponent(data: any): data is TextComponent {
  return isTextComponentWithDetail(data) || isTextComponentWithoutDetail(data);
}

export function isTextComponentWithoutDetail(
  data: any
): data is TextComponentWithoutDetails {
  return (
    typeof data === "object" &&
    typeof data.title === "string" &&
    isArray(data.titleFormulas) &&
    typeof data.detail === "undefined" &&
    typeof data.detail === "undefined"
  );
}

export function isTextComponentWithDetail(
  data: any
): data is TextComponentWithDetails {
  return (
    typeof data === "object" &&
    typeof data.title === "string" &&
    isArray(data.titleFormulas) &&
    typeof data.detail === "string" &&
    isArray(data.detailFormulas)
  );
}

export function isStatKey(data: any): data is StatKey {
  return Object.keys(StatKey).includes(data);
}

export function isStandardDie(data: any): data is StandardDie {
  return Object.keys(StandardDie).includes(data);
}

export function isNonStandardDie(data: any): data is NonStandardDie {
  return typeof data === "object" && isNumber(data.numFaces);
}

export function isDieDefinition(data: any): data is DieDefinition {
  return isStandardDie(data) || isNonStandardDie(data);
}

export function isDieOperation(data: any): data is DieOperation {
  return isEnumMember<DieOperation>(data, DieOperation);
}

export function isDieExpression(data: any): data is DieExpression {
  return (
    isArray(data) &&
    isNumber(data[0]) &&
    isDieDefinition(data[1]) &&
    isDieOperation(data[2])
  );
}

export function isPb(data: any): data is typeof PB {
  return data === "proficiencyBonus";
}

export function isOfficialClass(data: any): data is OfficialClass {
  return Object.keys(OfficialClass).includes(data);
}

export function isClassName(data: any): data is ClassName {
  return isOfficialClass(data) || isString(data);
}

export function isEnumMember<T>(data: any, enumKlass: object): data is T {
  return Object.keys(enumKlass).includes(data);
}

export function isDamageType(data: any): data is DamageType {
  return Object.keys(DamageType).includes(data);
}

export function isCustomFormulaWithDamage(
  data: any
): data is CustomFormulaWithDamage {
  return isMap<DamageType, CustomFormula>(data, isDamageType, isCustomFormula);
}

export function isAtomicVariable(data: any): data is AtomicVariable {
  return (
    isNumber(data) ||
    isStatKey(data) ||
    isDieExpression(data) ||
    isPb(data) ||
    isClassName(data)
  );
}

export function isSingleOperandOperation(
  data: any
): data is SingleOperandOperation {
  return (
    typeof data === "object" &&
    Object.keys(Operation).includes(data.operation) &&
    isCustomFormula(data.operand1) &&
    isUndefined(data.operand2)
  );
}

export function isDoubleOperandOperation(
  data: any
): data is DoubleOperandOperation {
  return (
    typeof data === "object" &&
    Object.keys(Operation).includes(data.operation) &&
    isCustomFormula(data.operand1) &&
    isCustomFormula(data.operand2)
  );
}

export function isArbitraryOperandOperation(
  data: any
): data is ArbitraryOperandOperation {
  return (
    typeof data === "object" &&
    Object.keys(Operation).includes(data.operation) &&
    isArray(data.operands) &&
    every(data.operands, (operand) => isCustomFormula(operand))
  );
}

export function isExpression(data: any): data is Expression {
  if (isDoubleOperandOperation(data))
    return isCustomFormula(data.operand1) && isCustomFormula(data.operand2);
  if (isSingleOperandOperation(data)) return isCustomFormula(data.operand1);
  if (isArbitraryOperandOperation(data))
    return every(data.operands, (operand) => isCustomFormula(operand));
  return false;
}

export function isCustomFormula(data: any): data is CustomFormula {
  return isAtomicVariable(data) || isExpression(data);
}

////////////////////
// End Typeguards //
////////////////////

export type AtomicVariable =
  | number
  | StatKey
  | DieExpression
  | ClassName
  | typeof PB;

interface SingleOperandOperation {
  operand1: CustomFormula;
}

interface DoubleOperandOperation {
  operand1: CustomFormula;
  operand2: CustomFormula;
}

interface ArbitraryOperandOperation {
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

export interface Attack {
  name: string;
  bonus: CustomFormula;
  formula: CustomFormulaWithDamage;
}

export type CoinAmounts = { [key in CoinType]?: number };

export type Proficiencies<T extends string | number> = { [key in T]?: boolean };

interface TextComponentWithDetails {
  title: string;
  titleFormulas: CustomFormula[];
  detail: string;
  detailFormulas: CustomFormula[];
}

interface TextComponentWithoutDetails {
  title: string;
  titleFormulas: CustomFormula[];
}

export type TextComponent =
  | TextComponentWithDetails
  | TextComponentWithoutDetails;

export interface SpellCastingClass {
  class: ClassName;
  abilityOverride?: StatKey;
  saveDcOverride?: CustomFormula;
  attackBonusOverride?: CustomFormula;
}

export interface Spell {
  spellcastingClass: ClassName;
  info: TextComponent;
}

export type Spells = {
  cantrips?: Spell[];
} & {
  [key in SpellLevel]?: Spell[];
};

export type SpellSlots = {
  [key in SpellLevel]: { totalOverride?: number; expended: number };
};

export interface PactSlots {
  totalOverride?: number;
  levelOverride?: number;
  expended: number;
}

type BaseCharacter = { [key in FIELD]?: any };

export interface Character extends BaseCharacter {
  uuid: UUID;
  name: string;
  class: IClass[];
  background: string;
  playerName: string;
  race: string;
  alignment: Alignment;
  exp?: number;
  stats: CharacterStats;
  inspiration: number;
  pbOverride?: number;
  proficiencies: {
    savingThrows: Proficiencies<StatKey>;
    skills: Proficiencies<SkillName>;
    expertise: Proficiencies<SkillName>;
    isJackOfAllTradesOverride: boolean;
  };
  otherProficiencies: TextComponent[];
  acFormula: CustomFormula;
  speed: number;
  maxHp?: CustomFormula;
  currHp: number;
  tempHp: number;
  totalHitDice?: HitDice;
  expendedHitDice: HitDice;
  exhaustion: number;
  deathSaves: { successes: number; failures: number };
  attacks: Attack[];
  coins: CoinAmounts;
  equipment: TextComponent[];
  personality: {
    traits: TextComponent[];
    ideals: TextComponent[];
    bonds: TextComponent[];
    flaws: TextComponent[];
  };
  features: TextComponent[];
  spellcastingClasses: SpellCastingClass[];
  spells: Spells;
  spellSlots: SpellSlots;
  pactSlots?: PactSlots;
}

export type CharacterField = keyof Character;

export interface IClass {
  name: string;
  level: number;
  subclass?: string;
}

export type CharacterStats = Record<StatKey, number>;

export interface Datastore {
  name: string;
  debounceWait: number;
  initializeDatastore: () => void;
  saveToDatastore: (character: Character) => Promise<void>;
  loadFromDatastore: (uuid: UUID) => Promise<Character | undefined>;
  listEntriesInDatastore: () => Character[];
  deleteFromDatastore: (uuid: UUID) => void;
  createCharacter?: () => Character;
}
