import { UUID } from "crypto";
import {
  Alignment,
  ArmorCategory,
  ArmorDexContribution,
  ArmorType,
  CastingTime,
  CoinType,
  DamageType,
  FIELD,
  LeveledSpellLevel,
  MagicSchool,
  RestType,
  Size,
  SkillName,
  SpellLevelNum,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  CustomFormula,
  CustomFormulaWithDamage,
  HitDice,
} from "src/lib/types/formula";
import { AttackTag, FeatureMechanics } from "src/lib/types/mechanics";

// The persisted character model. Changing anything reachable from `Character`
// requires regenerating `src/schema.json` (`pnpm generate-schema`) and, for a
// breaking change, a migration.

// A weapon's normal/long range in feet (5e "80/320"). `long` omitted for
// single-range weapons (e.g. Net "5").
export interface WeaponRange {
  normal: number;
  long?: number;
}

// A saving throw the target makes against something the character does (a
// breath weapon, Stunning Strike, a maneuver) — the counterpart to a to-hit
// `bonus`. Shared by `Attack` and `LimitedUseAbility`.
export interface SaveEffect {
  // Formula, not a number, so it re-derives on level-up — `saveDcFormula` in
  // rules.ts builds the standard 8 + PB + ability. (Spellcasting has its own
  // override in `spellcastingClasses[].saveDcOverride`.)
  dc: CustomFormula;
  // Ability the target rolls; independent of whichever ability the DC derives
  // from (a monk's Ki DC is WIS, Stunning Strike calls for CON). Omit when it
  // varies by use.
  stat?: StatKey;
  // `half`/`none` on a successful save; omit when there's no damage to scale.
  onSuccess?: "half" | "none";
  note?: string; // prose for what the sheet can't model
}

export interface Attack {
  // Stable identity so ammunition entries can reference weapons by id.
  id: UUID;
  name: string;
  // Optional because a save-based attack (breath weapon, poison) sets `save`
  // instead. Both may be set; legal, shows both.
  bonus?: CustomFormula;
  formula: CustomFormulaWithDamage;
  save?: SaveEffect;
  range?: WeaponRange; // shown as a tooltip on the attack name
  // Weapon properties riders key off. Absent means "unknown", not "none" — an
  // undecidable rider condition falls back to an opt-in prompt.
  tags?: AttackTag[];
}

// A pool of ammunition. The entry owns which weapons it feeds (`weaponIds`,
// referencing `Attack.id`) rather than the weapon owning its ammo, so each
// table can pick its own taxonomy. `count` is the source of truth for how
// much is left. See the `trackAmmunition` setting.
export interface Ammunition {
  id: UUID;
  name: string;
  count: number;
  weaponIds: UUID[];
}

// Contributes to AC (via the `equippedArmor` formula leaf) only while `equipped`.
export interface ArmorMechanics {
  base: number; // base AC before DEX (e.g. 14 scale mail, 16 chain mail)
  category: ArmorCategory; // used for labels, proficiency, seeding `dex`
  dex: ArmorDexContribution; // stored explicitly, not inferred from category
  dexCap?: number; // used when dex === "capped"; defaults to 2
}

// Adds `bonus` to AC while equipped. Normally +2.
export interface ShieldMechanics {
  bonus: number;
}

// The item owns its attack the way armor owns its AC: `attack` is copied into
// `Character.attacks` while `equipped` and parked here (carrying live edits)
// while it isn't. Id stays stable across toggles so `Ammunition.weaponIds`
// links survive.
export interface WeaponItemMechanics {
  attack: Attack;
}

// Wraps the free-text `TextComponent` rather than replacing it, so legacy
// free-text equipment migrates losslessly. Structured fields around it run
// inventory rules: `attunement` drives the 3-slot limit, `weight`/`quantity`
// feed the opt-in encumbrance readout.
export interface EquipmentItem {
  id: UUID;
  text: TextComponent; // name (title) + optional description (detail)
  quantity: number; // defaults to 1; multiplies weight
  // Raw number in pounds (5e's carrying-capacity unit). `weightUnit` setting
  // only affects display; kg is converted at render time, never stored.
  weight?: number;
  // Presence of `true` marks the item as wearable/wieldable, surfacing an
  // equip toggle. Items with `armor`/`shield` mechanics are always
  // equippable regardless (see `isEquippable`).
  equippable?: boolean;
  // Meaningful only for equippable items; drives which armor/shield
  // contributes to AC.
  equipped: boolean;
  // Presence of this object marks the item as requiring attunement; `attuned`
  // tracks whether it currently is, counted against the cap.
  attunement?: { attuned: boolean };
  // Presence marks the item as body armor. Mutually exclusive with `shield`.
  armor?: ArmorMechanics;
  // Presence marks the item as a shield. Mutually exclusive with `armor`.
  shield?: ShieldMechanics;
  // Presence marks the item as a weapon; its attack appears in the Attacks
  // section only while equipped. Mutually exclusive with `armor`/`shield`.
  weapon?: WeaponItemMechanics;
  // A magic item's charges. Copied into `Character.limitedUseAbilities` while
  // the item is active (equipped, and attuned if required) and parked back
  // here otherwise. Same `id` across toggles.
  ability?: LimitedUseAbility;
}

export type CoinAmounts = { [key in CoinType]?: number };

export type Proficiencies<T extends string | number> = { [key in T]?: boolean };

export interface TextComponentWithDetails {
  title: string;
  titleFormulas: CustomFormula[];
  detail: string;
  detailFormulas: CustomFormula[];
}

// Exported only so `types/guards.ts` can name it in a predicate; the union
// `TextComponent` is what consumers use.
export interface TextComponentWithoutDetails {
  title: string;
  titleFormulas: CustomFormula[];
}

export type TextComponent =
  | TextComponentWithDetails
  | TextComponentWithoutDetails;

// Intrinsic modifiers (not transient combat conditions, which live
// elsewhere). Free-text lists so qualified entries ("Bludgeoning, Piercing,
// and Slashing from nonmagical attacks") are expressible.
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
  classId: UUID; // stable id of the character class this config belongs to
  abilityOverride?: StatKey;
  saveDcOverride?: CustomFormula;
  attackBonusOverride?: CustomFormula;
}

export interface MaterialComponent {
  name: string;
  // Presence of a price marks the material as consumed on cast.
  price?: CoinAmounts;
}

export interface SpellComponents {
  verbal?: boolean;
  somatic?: boolean;
  material?: MaterialComponent[];
}

// One damage type's contribution to a spell, as a formula ("1d8", "8d6",
// "1d8 + spellMod").
export interface SpellDamageComponent {
  damageType: DamageType;
  formula: CustomFormula;
}

// How a spell grows above its base level. See `.claude/docs/spell-scaling.md`.
// `steps` increments are added to the base:
//   slot driver:      floor((castLevel - Spell base level) / (perLevels ?? 1))
//   character driver: count of the fixed cantrip tiers [5, 11, 17] reached
export interface SpellScaling {
  driver: "slot" | "character";
  // Slot driver only — one increment per this many levels above base (1
  // normally; 2 for e.g. Spiritual Weapon).
  perLevels?: number;
  damage?: SpellDamageComponent[]; // increment per step, usually the base's die
  healing?: CustomFormula;
  instances?: number; // extra rolled instances per step (Magic Missile, Scorching Ray)
}

// Drives to-hit vs save-DC display.
export type SpellResolution =
  | { kind: "attack"; range: "melee" | "ranged" }
  | { kind: "save"; ability: StatKey; halfOnSuccess?: boolean }
  | { kind: "auto" };

// Optional structured mechanics. Absent for free-text spells (migration
// no-op); populated by the catalog importer and editable in the UI.
export interface SpellMechanics {
  level: number; // base spell level; 0 = cantrip
  resolution: SpellResolution;
  damage?: SpellDamageComponent[]; // base effect at `level`
  healing?: CustomFormula;
  instances?: number; // base rolled instances (Magic Missile = 3, Scorching Ray = 2)
  scaling?: SpellScaling;
  // Escape hatch for non-linear spells: exact damage per cast level, keyed by
  // slot/character level. Preferred over `scaling` when it has a matching entry.
  damageTable?: Record<number, SpellDamageComponent[]>;
}

export interface Spell {
  spellcastingClass: UUID; // class id this spell is cast with (spellMod/bonus/DC source)
  info: TextComponent;
  prepared?: boolean;
  // Granted already-prepared and not counting against the allowance (a
  // cleric's domain spells, a paladin's oath spells, a Land druid's circle
  // spells). Only set for prepared casters — a warlock's expanded list still
  // has to be learned.
  alwaysPrepared?: boolean;
  ritual?: boolean;
  concentration?: boolean;
  components?: SpellComponents;
  // `MagicSchool | string` so homebrew traditions still fit.
  school?: MagicSchool | string;
  // Typed against `CastingTime` for the action-economy values, plus free text
  // ("1 minute", "8 hours").
  castingTime?: CastingTime | string;
  range?: string;
  duration?: string;
  mechanics?: SpellMechanics;
}

// Key 0 holds cantrips, keys 1-9 the leveled spells.
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

// Standard rests are the `RestType` presets; free-text triggers ("Dawn",
// "Initiative") are allowed for homebrew.
export type RechargeCriteria = RestType | string;

// One option picked from a class's fixed-size list (Metamagic, a Battle
// Master maneuver, a warlock's Pact Boon) — distinct from `features` by
// coming from a closed, countable list ("3 / 5 known").
//
// Fighting styles and eldritch invocations stay in `features` instead: rider
// matching keys off feature titles (see `ridersFor`), which also scans chosen
// options by name.
export interface ChosenOption {
  category: string; // matches an OptionGroup.category; sheet groups by this
  name: string; // identity key for catalog lookups and rider matching
  // Paraphrase copied from the catalog at pick time; editable, free-text for homebrew.
  detail?: string;
  // Equipment this pick is applied to (an artificer infusion's target item).
  // Only groups whose picks attach to something set it.
  itemId?: UUID;
  // Currently in force, for a group that knows more than it can run at once
  // (`OptionGroup.active`). Absent means inactive; a group with no `active`
  // table ignores it.
  active?: boolean;
}

// A feature with a finite, refreshing pool of uses (Sorcery Points, a
// once-per-rest racial ability, Channel Divinity). `maxUses` is a formula so
// the pool can scale off level/stats.
export interface LimitedUseAbility {
  // Optional because abilities predate it and are mostly addressed by index;
  // an item-owned ability (`EquipmentItem.ability`) always carries one so the
  // equip/attune toggles can find the live row.
  id?: UUID;
  info: TextComponent;
  maxUses: CustomFormula;
  recharge: RechargeCriteria;
  // Dawns left until an "Every X days" pool refreshes, ticked down by the
  // dawn trigger (and rests spanning dawn). Absent means not started; seeded
  // on first use, cleared when recharge fires.
  daysUntilRecharge?: number;
  // Uses restored when `recharge` fires; absent means all (5e default). Magic
  // items that "regain 1d3 charges daily" store that roll here, rolled when
  // the trigger fires and clamped to what was spent.
  restore?: CustomFormula;
  expended: number;
  // When absent, `mechanics/catalog.ts` is consulted by title; when present,
  // this wins — how homebrew attaches actions/riders without a known name.
  mechanics?: FeatureMechanics;
  // DC targets roll against for this feature's save. Absent for pools that
  // never impose one (Second Wind, Action Surge).
  save?: SaveEffect;
}

// `walk` always present; others are extra movement modes. Seeded from race
// at creation, then owned and editable independently.
export interface Speeds {
  walk: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
}

// In feet. Seeded from race at creation, then editable. Absent = lacks that sense.
export interface Senses {
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
}

// Pure racial identity. Mechanical grants are seeded at creation into their
// natural homes (languages, traits, speeds, senses) and owned there after,
// not mirrored back onto the race.
export interface RaceSelection {
  name: string;
  subrace?: string;
  size: Size;
}

export interface Character {
  schemaVersion: number; // bumped on breaking changes needing a migration; see src/lib/migrations/
  uuid: UUID;
  name: string;
  class: IClass[];
  background: string;
  playerName: string;
  race: RaceSelection;
  alignment: Alignment;
  exp?: number;
  stats: CharacterStats;
  inspiration: boolean; // 5e gives it no quantity; a toggle, not a count
  pbOverride?: number;
  proficiencies: {
    savingThrows: Proficiencies<StatKey>;
    skills: Proficiencies<SkillName>;
    expertise: Proficiencies<SkillName>;
    isJackOfAllTradesOverride: boolean;
    // Per-skill bonus on top of ability + proficiency (Remarkable Athlete,
    // Stone of Good Luck, Observant). Formula so half-proficiency scales with
    // level. Absent = no bonus.
    skillBonuses: { [key in SkillName]?: CustomFormula };
  };
  otherProficiencies: OtherProficiencies;
  damageModifiers: DamageModifiers;
  acFormula: CustomFormula;
  initiativeFormula?: CustomFormula;
  // Override for computed Passive Perception (10 + WIS mod + proficiency +
  // bonus). Models a passive-only adjustment (Observant's +5) without
  // touching active checks. Seeded from the computed default when first
  // edited — see `getPassivePerceptionFormula`.
  passivePerception?: CustomFormula;
  // Flat bonus added to every saving throw. Home for Aura of Protection (CHA
  // mod, min 1, paladin 6+) and a Cloak of Protection. Seeded by the paladin
  // level grant.
  savingThrowBonus?: CustomFormula;
  speeds: Speeds;
  senses: Senses;
  maxHp?: CustomFormula;
  currHp: number;
  tempHp: number;
  totalHitDice?: HitDice;
  expendedHitDice: HitDice;
  exhaustion: number;
  deathSaves: { successes: number; failures: number };
  attacks: Attack[];
  ammunition: Ammunition[];
  coins: CoinAmounts;
  equipment: EquipmentItem[];
  // Attunement slot cap override. Unset = standard 3; set to model
  // Artificer's 4/5/6 progression. Seeded from 3 when first edited.
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
  chosenOptions?: ChosenOption[]; // optional so old saves validate
  // Party-session codes joined, most recent first. Codes are uuids (the uuid
  // is the authentication), so the character remembers them rather than
  // asking the player to find last week's invite again. Per-character, not
  // an app setting. Optional so old saves validate without a migration.
  playSessions?: PlaySessionRef[];
}

// `lastJoined` is epoch ms; orders the rejoin list.
export interface PlaySessionRef {
  code: UUID;
  lastJoined: number;
}

export type CharacterField = keyof Character;

// Static guard: every FIELD enum member must be a key of Character. If a
// FIELD is added without a matching Character property, this fails to compile.
type _AssertFieldsAreCharacterKeys = FIELD extends keyof Character
  ? true
  : never;
const _fieldsCovered: _AssertFieldsAreCharacterKeys = true;
void _fieldsCovered;

export interface IClass {
  id: UUID; // stable, independent of the renameable display name
  name: string;
  level: number;
  subclass?: string;
}

export type CharacterStats = Record<StatKey, number>;
