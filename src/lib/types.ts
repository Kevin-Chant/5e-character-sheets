import {
  every,
  isArray,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from "lodash";
import type {
  SharePresenceEntry,
  SharePresenceSelf,
} from "src/lib/share-presence";
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
  ArmorType,
  RestType,
} from "./data/data-definitions";
import { UUID } from "crypto";
import { Action } from "./hooks/reducers/actions";

//////////////////////
// Begin Typeguards //
//////////////////////
export function isUuid(data: any): data is UUID {
  return typeof data === "string" && !!data.match(/^\w+-\w+-\w+-\w+-\w+$/);
}
export function isArr<T>(
  data: any,
  validator: (data: any) => data is T,
): data is Array<T> {
  if (!Array.isArray(data)) return false;
  return every(data, validator);
}

export function isMap<K extends string | number | symbol, V>(
  data: any,
  kValidator: (data: any) => data is K,
  vValidator: (data: any) => data is V,
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
  data: any,
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
  data: any,
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
  data: any,
): data is CustomFormulaWithDamage {
  return isMap<DamageType, CustomFormula>(data, isDamageType, isCustomFormula);
}

// A `spellMod` leaf must be a tagged object, not a bare string: `isClassName`
// accepts *any* string, so a string sentinel would be misread as a class name.
export function isSpellMod(data: any): data is SpellMod {
  return (
    isObject(data) && !isArray(data) && isClassName((data as any).spellMod)
  );
}

export function isAtomicVariable(data: any): data is AtomicVariable {
  return (
    isNumber(data) ||
    isStatKey(data) ||
    isDieExpression(data) ||
    isPb(data) ||
    isSpellMod(data) ||
    isClassName(data)
  );
}

export function isSingleOperandOperation(
  data: any,
): data is SingleOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isCustomFormula((data as any).operand1) &&
    isUndefined((data as any).operand2)
  );
}

export function isDoubleOperandOperation(
  data: any,
): data is DoubleOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isCustomFormula((data as any).operand1) &&
    isCustomFormula((data as any).operand2)
  );
}

export function isArbitraryOperandOperation(
  data: any,
): data is ArbitraryOperandOperation {
  return (
    isObject(data) &&
    Object.keys(Operation).includes((data as any).operation) &&
    isArray((data as any).operands) &&
    every((data as any).operands, (operand) => isCustomFormula(operand))
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

export function isRechargeCriteria(data: any): data is RechargeCriteria {
  return isString(data);
}

export function isLimitedUseAbility(data: any): data is LimitedUseAbility {
  return (
    isObject(data) &&
    isTextComponent((data as any).info) &&
    isCustomFormula((data as any).maxUses) &&
    isRechargeCriteria((data as any).recharge) &&
    isNumber((data as any).expended)
  );
}

////////////////////
// End Typeguards //
////////////////////

// The spellcasting-ability modifier of a specific spellcasting class. Resolved
// live against the character (honoring any `abilityOverride`), so a spell like
// Cure Wounds — `1d8 + spellMod` — tracks the class's current ability. Carries
// the class because a multiclassed character has more than one.
export interface SpellMod {
  spellMod: ClassName;
}

export type AtomicVariable =
  | number
  | StatKey
  | DieExpression
  | ClassName
  | SpellMod
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

export interface OtherProficiencies {
  languages: string[];
  armor: Record<ArmorType, boolean>;
  weapons: string[];
  toolsAndOther: TextComponent[];
}

export interface SpellCastingClass {
  class: ClassName;
  abilityOverride?: StatKey;
  saveDcOverride?: CustomFormula;
  attackBonusOverride?: CustomFormula;
}

export interface MaterialComponent {
  name: string;
  // Cost of the component. Components with a listed cost are the ones consumed
  // on cast, so the presence of a price is what marks a material as consumed.
  price?: CoinAmounts;
}

export interface SpellComponents {
  verbal?: boolean;
  somatic?: boolean;
  material?: MaterialComponent[];
}

// One damage type's contribution to a spell, as a formula (reuses the engine, so
// "1d8", "8d6", or "1d8 + spellMod" all work).
export interface SpellDamageComponent {
  damageType: DamageType;
  formula: CustomFormula;
}

// How a spell grows when cast above its base level. See
// `.claude/docs/spell-scaling.md`. `steps` increments are added to the base:
//   slot driver:      floor((castLevel - Spell base level) / (perLevels ?? 1))
//   character driver: count of the fixed cantrip tiers [5, 11, 17] reached
export interface SpellScaling {
  driver: "slot" | "character";
  // Slot driver only — add one increment per this many levels above base
  // (1 normally; 2 for e.g. Spiritual Weapon). Ignored for the character driver.
  perLevels?: number;
  // The increment applied per step. Usually the same die as the base.
  damage?: SpellDamageComponent[];
  healing?: CustomFormula;
  // Extra rolled instances per step (Magic Missile darts, Scorching Ray rays).
  instances?: number;
}

// How a spell resolves against a target — drives to-hit vs save-DC display.
export type SpellResolution =
  | { kind: "attack"; range: "melee" | "ranged" }
  | { kind: "save"; ability: StatKey; halfOnSuccess?: boolean }
  | { kind: "auto" };

// The optional, structured mechanical model of a spell. Absent for the
// free-text spells that dominate real use (so migration is a no-op); populated
// by the SRD importer and editable in the UI.
export interface SpellMechanics {
  // Base spell level; 0 = cantrip.
  level: number;
  resolution: SpellResolution;
  // Base effect at `level`.
  damage?: SpellDamageComponent[];
  healing?: CustomFormula;
  // Base count of rolled instances (Magic Missile = 3, Scorching Ray = 2).
  instances?: number;
  scaling?: SpellScaling;
  // Escape hatch for non-linear spells the rule can't express: exact damage per
  // cast level, keyed by slot/character level. Preferred over `scaling` when it
  // has an entry at or below the cast level.
  damageTable?: Record<number, SpellDamageComponent[]>;
}

export interface Spell {
  spellcastingClass: ClassName;
  info: TextComponent;
  prepared?: boolean;
  ritual?: boolean;
  concentration?: boolean;
  components?: SpellComponents;
  castingTime?: string;
  range?: string;
  duration?: string;
  mechanics?: SpellMechanics;
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

// When a limited-use ability's pool refreshes. The standard rests are the
// `RestType` presets, but any free-text trigger ("Dawn", "Initiative", …) is
// allowed so homebrew and unusual features aren't boxed in. Mirrors the
// `ClassName = OfficialClass | string` convention.
export type RechargeCriteria = RestType | string;

// A feature with a finite, refreshing pool of uses: Sorcery Points, a racial
// once-per-rest ability, a Channel Divinity, etc. `maxUses` is a formula so the
// pool can scale off level/stats; `expended` is the current spend (tracked like
// spell slots) and resets to 0 when the `recharge` trigger fires.
export interface LimitedUseAbility {
  info: TextComponent;
  maxUses: CustomFormula;
  recharge: RechargeCriteria;
  expended: number;
}

type BaseCharacter = { [key in FIELD]?: any };

export interface Character extends BaseCharacter {
  // Monotonic schema version, bumped whenever a breaking change to this type
  // needs a migration. See src/lib/migrations/.
  schemaVersion: number;
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
  otherProficiencies: OtherProficiencies;
  acFormula: CustomFormula;
  initiativeFormula?: CustomFormula;
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
  limitedUseAbilities: LimitedUseAbility[];
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
  savedSheetsCopy: string;
  debounceWait: number;
  initializeDatastore: () => Promise<void>;
  saveToDatastore: (character: Character) => Promise<void>;
  loadFromDatastore: (uuid: UUID) => Promise<Character | undefined>;
  listEntriesInDatastore: () => Character[];
  deleteFromDatastore: (uuid: UUID) => void;
  createCharacter?: () => Promise<Character>;
  // Optional sharing support (currently Google Drive only): promote a private
  // character to a first-class document, share it with a person by email, and
  // report whether it has been promoted yet.
  isShared?: (uuid: UUID) => boolean;
  // Which side of a shared document we're on: "owner" for a shareable doc we
  // created, "recipient" for one shared *with* us (imported via the Picker),
  // undefined when it isn't a shared doc. Drives who auto-hosts vs. auto-joins
  // a live session.
  getShareRole?: (uuid: UUID) => "owner" | "recipient" | undefined;
  promoteCharacter?: (uuid: UUID) => Promise<void>;
  shareCharacter?: (uuid: UUID, email: string) => Promise<void>;
  // Editor-presence heartbeat for shared documents with no live session: record
  // that we're editing and return the *other* editors currently on the file.
  // Clear our heartbeat when we stop editing. (Google Drive only.)
  heartbeatSharePresence?: (
    uuid: UUID,
    self: SharePresenceSelf,
  ) => Promise<SharePresenceEntry[]>;
  clearSharePresence?: (uuid: UUID, clientId: string) => Promise<void>;
  // Pick a character document shared with the user and add it to this store,
  // returning it for the caller to open (undefined if nothing was picked).
  importSharedCharacter?: () => Promise<Character | undefined>;
}

export type Dispatch = (
  action: Action,
  dirtyAction?: boolean,
  suppressBroadcast?: boolean,
) => void;

// What a DISPATCH message carries: the action, whether it dirties the sheet,
// and the id of the client that sent it (so we can ignore our own echoes —
// the WAMP broker does not honor exclude_me).
export type DispatchPayload = {
  action: Action;
  dirtyAction?: boolean;
  senderId?: string;
};

export type SingleOptionsList<T = string> = Array<T>;

export type GroupedOptionsList<T = string> = Array<{
  label: string;
  options: T[];
}>;

export type OptionsList<T = string> =
  | SingleOptionsList<T>
  | GroupedOptionsList<T>;
