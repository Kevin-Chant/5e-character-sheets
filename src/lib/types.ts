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
  SpellLevelNum,
  LeveledSpellLevel,
  ArmorType,
  ArmorCategory,
  ArmorDexContribution,
  RestType,
  Size,
} from "./data/data-definitions";
import { UUID } from "crypto";
import { Action } from "./hooks/reducers/actions";

//////////////////////
// Begin Typeguards //
//////////////////////
export function isUuid(data: any): data is UUID {
  return (
    typeof data === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)
  );
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
  // Arrays are lodash "objects" whose keys (indices) would pass numeric key
  // validators, so reject them explicitly.
  return (
    isObject(data) &&
    !isArray(data) &&
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
    typeof data.detailFormulas === "undefined"
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

// Both class-referencing formula leaves are tagged objects carrying a class
// *id* (a UUID), never a bare string — so a class rename can't orphan them and
// they're unambiguous among atomic variables (a bare string used to be misread
// as a class name, which made *any* string a valid atomic).
export function isSpellMod(data: any): data is SpellMod {
  return isObject(data) && !isArray(data) && isUuid((data as any).spellMod);
}

export function isClassLevel(data: any): data is ClassLevel {
  return isObject(data) && !isArray(data) && isUuid((data as any).classLevel);
}

export function isEquippedArmor(data: any): data is EquippedArmor {
  return (
    isObject(data) && !isArray(data) && (data as any).equippedArmor === true
  );
}

export function isAtomicVariable(data: any): data is AtomicVariable {
  return (
    isNumber(data) ||
    isStatKey(data) ||
    isDieExpression(data) ||
    isPb(data) ||
    isSpellMod(data) ||
    isClassLevel(data) ||
    isEquippedArmor(data)
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

// A weapon's normal / long range in feet (5e "80/320"). `long` is omitted for
// weapons with a single range (e.g. Net "5").
export interface WeaponRange {
  normal: number;
  long?: number;
}

export interface Attack {
  // Stable identity so ammunition entries can reference the weapons they feed
  // by id (a rename never orphans the link) — mirrors `IClass.id`.
  id: UUID;
  name: string;
  bonus: CustomFormula;
  formula: CustomFormulaWithDamage;
  // Optional weapon range; when present, shown as a tooltip on the attack name.
  range?: WeaponRange;
}

// A pool of ammunition (arrows, bolts, …). The entry owns which weapons it
// feeds (`weaponIds`, referencing `Attack.id`) rather than the weapon owning its
// ammo, so each table picks its own taxonomy — one shared "Arrows" pool, or
// distinct bolt types per crossbow. A weapon's remaining-ammo quick-reference
// sums the counts of every entry linked to it. `count` is the single source of
// truth for how much is left. See the `trackAmmunition` setting.
export interface Ammunition {
  id: UUID;
  name: string;
  count: number;
  weaponIds: UUID[];
}

// Armor mechanics attached to an equipment item. Only contributes to AC (via
// the `equippedArmor` formula leaf) while the item is `equipped`.
export interface ArmorMechanics {
  // Base AC before DEX (e.g. 14 for scale mail, 16 for chain mail).
  base: number;
  // Tier — used for labels, proficiency, and seeding `dex` in the editor.
  category: ArmorCategory;
  // How DEX applies, stored explicitly (not inferred from `category`).
  dex: ArmorDexContribution;
  // The DEX cap when `dex === "capped"`; defaults to 2 (standard medium armor).
  dexCap?: number;
}

// Shield mechanics. Adds `bonus` to AC (via the `equippedArmor` leaf) while
// equipped. Normally +2.
export interface ShieldMechanics {
  bonus: number;
}

// One entry in the equipment list. Wraps the free-text `TextComponent` (name +
// optional description, both with embedded formulas) rather than replacing it,
// so legacy free-text equipment migrates losslessly and the existing rich-text
// display/editor are reused. The structured fields around it are what let the
// sheet run inventory rules: `attunement` drives the 3-slot attunement limit,
// and `weight`/`quantity` feed the (opt-in) encumbrance readout.
export interface EquipmentItem {
  // Stable identity so edits/reorders never orphan a row — mirrors `Attack.id`.
  id: UUID;
  // Name (`title`) + optional description (`detail`), with positional formulas.
  text: TextComponent;
  // How many of this item are carried. Defaults to 1; multiplies `weight`.
  quantity: number;
  // Weight of a single unit, as a raw number in POUNDS (the unit 5e carrying
  // capacity is defined in). The `weightUnit` setting only affects display —
  // kg is converted at render time, never stored. Omit when unknown/negligible.
  weight?: number;
  // PRESENCE of `equippable: true` marks the item as something you wear or wield
  // (armor, a weapon, a worn wondrous item) — only then does the sheet surface an
  // equip toggle. Potions, ammo bundles, a bag of holding, etc. are carried but
  // not "equipped", so they leave it unset. Items with `armor`/`shield` mechanics
  // are always equippable (see `isEquippable`), regardless of this flag.
  equippable?: boolean;
  // Whether the item is currently worn/wielded. Meaningful only for equippable
  // items; drives which armor/shield contributes to AC (via the `equippedArmor`
  // leaf).
  equipped: boolean;
  // PRESENCE of this object marks the item as *requiring* attunement (mirrors
  // how a `MaterialComponent.price` marks a component consumed). `attuned` is
  // whether the character is currently attuned to it, counted against the cap.
  attunement?: { attuned: boolean };
  // Armor mechanics; presence marks the item as body armor. Contributes to AC
  // (via the `equippedArmor` leaf) only while `equipped`. Mutually exclusive
  // with `shield` — a single item is armor or a shield, not both.
  armor?: ArmorMechanics;
  // Shield mechanics; presence marks the item as a shield. Adds to AC while
  // `equipped`. Mutually exclusive with `armor`.
  shield?: ShieldMechanics;
}

export type CoinAmounts = { [key in CoinType]?: number };

export type Proficiencies<T extends string | number> = { [key in T]?: boolean };

export interface TextComponentWithDetails {
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

// A creature's intrinsic damage modifiers — printed on every stat block, so a
// true property of the character (transient combat state like active conditions
// and concentration belongs in a separate game-running layer, not here). Each is
// a free-text list (damage types are offered as a typeahead), so qualified
// entries like "Bludgeoning, Piercing, and Slashing from nonmagical attacks" are
// expressible.
export interface DamageModifiers {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
}

export interface OtherProficiencies {
  languages: string[];
  armor: Record<ArmorType, boolean>;
  weapons: string[];
  toolsAndOther: TextComponent[];
}

export interface SpellCastingClass {
  // The character class this spellcasting config belongs to, by stable id.
  classId: UUID;
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
  // The character class this spell is cast with, by stable id (drives which
  // class's spellMod / attack bonus / save DC applies).
  spellcastingClass: UUID;
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

// Spells bucketed by numeric level: key 0 holds cantrips, keys 1–9 the leveled
// spells. (Replaces the former `cantrips` key + "First"…"Ninth" word-enum keys.)
export type Spells = {
  [key in SpellLevelNum]?: Spell[];
};

export type SpellSlots = {
  [key in LeveledSpellLevel]: { totalOverride?: number; expended: number };
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

// ---------------------------------------------------------------------------
// Ability mechanics: serializable descriptions of what abilities *do* at the
// table. Same design rule as `CustomFormula`: a closed set of interpretable
// kinds, an open set of data compositions — no functions, so mechanics survive
// Drive persistence, live-sync, and undo. The interpreters and the bundled
// catalog live in `src/lib/mechanics/`; these types live here because the
// character model (`LimitedUseAbility.mechanics`) embeds them.

// What using an action costs at the table. `special` covers anything outside
// the standard economy (part of a rest, a trigger on being hit, …) — pair it
// with `costNote` so the UI can say what.
export type ActionCost =
  | "action"
  | "bonusAction"
  | "reaction"
  | "free"
  | "special";

// How much an effect moves. `fixed` is a formula over the character (it may
// contain dice — resolved with a real roll at execution time, never during
// render); `plusLevelOf` adds `levelMultiplier` (default 1) × the character's
// level in a named class, since authored formulas can't reference the sheet's
// per-class UUIDs (Second Wind's fighter level, Wholeness of Body's 3× monk
// level). `chosenAmount`/`chosenLevel` are the user's picks at execution time;
// `byChosenLevel` is a lookup table keyed by the chosen slot level (Font of
// Magic's creation costs).
export type AmountExpr =
  | { fixed: CustomFormula; plusLevelOf?: ClassName; levelMultiplier?: number }
  | { chosenAmount: true }
  // Roll the chosen number of these dice (Healing Light's "spend N, heal
  // N d6"). Pairs naturally with a `spendUses` of `chosenAmount`.
  | { chosenAmountDice: StandardDie }
  | { chosenLevel: true }
  | { byChosenLevel: Record<number, number> };

// One described state change (or table prompt) — the closed set an
// `AbilityAction` composes from. Interpreted by `mechanics/resolve.ts` into
// ordinary whole-value reducer updates, so every effect syncs and undoes like
// a manual edit. Costs and gains are both just effects — direction is in the
// kind.
export type Effect =
  // Heal current HP, clamped to the max.
  | { effect: "heal"; amount: AmountExpr }
  // Grant temporary HP. Temp HP don't stack: applies only if higher.
  | { effect: "gainTempHp"; amount: AmountExpr }
  // Spend uses from the owning limited-use ability's pool.
  | { effect: "spendUses"; amount: AmountExpr }
  // Regain uses in the owning pool, clamped at its maximum.
  | { effect: "restoreUses"; amount: AmountExpr }
  // Expend a spell slot (the chosen level unless pinned).
  | { effect: "expendSlot"; level?: LeveledSpellLevel }
  // Restore an expended spell slot. The sheet tracks expended-vs-total, so
  // "creating" a slot beyond the normal maximum has nowhere to live —
  // restoration is the model.
  | { effect: "restoreSlot"; level?: LeveledSpellLevel }
  // Mark one hit die of this size expended.
  | { effect: "spendHitDie"; die: StandardDie }
  // Roll dice for display only (Stone's Endurance's reduction) — no write.
  | { effect: "roll"; label: string; amount: AmountExpr }
  // A table prompt for the parts the sheet can't adjudicate (reactions,
  // effects on other creatures). Deliberately not automation.
  | { effect: "remind"; note: string };

// A clickable use of an ability: its action-economy cost, what the user picks
// first, and the effects that fire. All effects must be payable/meaningful for
// the action to be enabled.
export interface AbilityAction {
  id: string;
  name: string;
  cost: ActionCost;
  // Shown beside the cost badge — timing/frequency prose ("during a short
  // rest", "when you take damage").
  costNote?: string;
  choose?: {
    // Offer a slot-level picker: levels with an expended slot to restore, or
    // with an available slot to expend.
    slotLevel?: "toRestore" | "toExpend";
    // Cap the offered levels (slot creation and Arcane Recovery stop at 5th).
    slotLevelMax?: number;
    // Offer a free-typed amount, capped at the pool's remaining uses.
    amount?: "uses";
  };
  effects: Effect[];
}

// What kind of roll is happening, as a tag the roll dialog supplies. `check`
// covers every non-attack d20 (ability checks, saves, initiative).
export type RollKind = "check" | "attack" | "damage" | "healing" | "hitDie";

// A modifier a feature applies to matching rolls — the roll-side closed set.
export type RollRider =
  // The roll's total can't come out below this (Durable).
  | { rider: "minimumTotal"; value: CustomFormula }
  // Individual dice below this count as this (Reliable Talent's 10).
  | { rider: "minimumDie"; value: number }
  // Reroll dice at or below the threshold once, keeping the new roll
  // (Great Weapon Fighting's 1s and 2s, Halfling Luck's natural 1s).
  | { rider: "rerollBelow"; threshold: number }
  // Flat addition to the total.
  | { rider: "bonus"; value: CustomFormula }
  // d20s at or above this crit (Improved Critical's 19).
  | { rider: "critRange"; value: number }
  // Advisory only — surfaced as a note, since advantage is situational.
  | { rider: "advantage"; note: string };

export interface FeatureRider {
  appliesTo: RollKind[];
  rider: RollRider;
}

// What a feature/ability can carry: riders keyed off it being on the sheet,
// and actions attached to its limited-use pool.
export interface FeatureMechanics {
  riders?: FeatureRider[];
  actions?: AbilityAction[];
}

// A feature with a finite, refreshing pool of uses: Sorcery Points, a racial
// once-per-rest ability, a Channel Divinity, etc. `maxUses` is a formula so the
// pool can scale off level/stats; `expended` is the current spend (tracked like
// spell slots) and resets to 0 when the `recharge` trigger fires.
export interface LimitedUseAbility {
  info: TextComponent;
  maxUses: CustomFormula;
  recharge: RechargeCriteria;
  expended: number;
  // Structured mechanics for this ability. When absent, the bundled catalog
  // (`mechanics/catalog.ts`) is consulted by title; when present, this wins —
  // which is how homebrew attaches actions/riders without a well-known name.
  mechanics?: FeatureMechanics;
}

// The character's movement speeds, in feet. `walk` is always present; the others
// are extra movement modes (fly, swim, climb, burrow). Seeded from the chosen
// race at creation, then owned and editable on the character — a race grant is
// just one of several ways to gain a speed (items, spells, class features).
export interface Speeds {
  walk: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
}

// The character's senses, in feet. Seeded from the chosen race at creation
// (races most often grant darkvision), then owned and editable on the character —
// items, spells, and class features grant senses too. Absent = the character
// lacks that sense.
export interface Senses {
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
}

// Pure racial identity. The mechanical grants a race confers are seeded into
// their natural homes at creation and owned there afterward — languages into
// `otherProficiencies.languages`, traits into `features`, speeds into `speeds`,
// darkvision into `senses` — rather than mirrored back onto the race.
export interface RaceSelection {
  name: string;
  subrace?: string;
  size: Size;
}

export interface Character {
  // Monotonic schema version, bumped whenever a breaking change to this type
  // needs a migration. See src/lib/migrations/.
  schemaVersion: number;
  uuid: UUID;
  name: string;
  class: IClass[];
  background: string;
  playerName: string;
  race: RaceSelection;
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
    // Optional per-skill bonus formulas added on top of the ability + proficiency
    // modifier — a home for Remarkable Athlete, Stone of Good Luck, Observant,
    // etc. (a formula so half-proficiency scales with level). Absent = no bonus.
    skillBonuses: { [key in SkillName]?: CustomFormula };
  };
  otherProficiencies: OtherProficiencies;
  // Damage resistances / immunities / vulnerabilities — see `DamageModifiers`.
  damageModifiers: DamageModifiers;
  acFormula: CustomFormula;
  initiativeFormula?: CustomFormula;
  // Optional Passive Perception override formula. When unset, the value is
  // computed (10 + WIS mod + Perception proficiency + bonus); set it to model a
  // passive-only adjustment like Observant's +5 without touching active checks.
  // Seeded from the computed default when first edited — see
  // `getPassivePerceptionFormula`.
  passivePerception?: CustomFormula;
  // Movement speeds (walk + optional fly/swim/climb/burrow). Seeded from the race
  // at creation, then editable — see `Speeds`.
  speeds: Speeds;
  // Senses (darkvision, etc.), seeded from the race then editable — see `Senses`.
  senses: Senses;
  maxHp?: CustomFormula;
  currHp: number;
  tempHp: number;
  totalHitDice?: HitDice;
  expendedHitDice: HitDice;
  exhaustion: number;
  deathSaves: { successes: number; failures: number };
  attacks: Attack[];
  // Ammunition pools, shown as a sub-section of Equipment. Each entry tracks a
  // remaining count and which weapons it feeds — see `Ammunition`.
  ammunition: Ammunition[];
  coins: CoinAmounts;
  // Structured inventory — see `EquipmentItem`. Each entry keeps its free-text
  // name/description and adds quantity/weight/equipped/attunement so the sheet
  // can derive attunement-slot usage and (opt-in) encumbrance.
  equipment: EquipmentItem[];
  // Optional override for the number of attunement slots. When unset the cap is
  // the standard 3; set it to model Artificer's 4/5/6 progression. Seeded from 3
  // when first edited — see `getAttunementSlots` / the OPTIONAL_FIELD_INITIALIZERS.
  attunementSlots?: CustomFormula;
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

// Static guard: every FIELD enum member must be a key of Character. This holds
// the two in sync now that Character no longer has an `[key in FIELD]: any`
// index signature papering over drift. If a FIELD is added without a matching
// Character property (or one is renamed), this line fails to compile.
type _AssertFieldsAreCharacterKeys = FIELD extends keyof Character
  ? true
  : never;
const _fieldsCovered: _AssertFieldsAreCharacterKeys = true;
void _fieldsCovered;

export interface IClass {
  // Stable identity, independent of the (renameable) display name. Spells,
  // spellcasting entries, and `spellMod`/`classLevel` formula leaves reference a
  // class by this id so a rename never orphans them.
  id: UUID;
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
