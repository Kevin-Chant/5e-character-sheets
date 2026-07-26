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

// The persisted character model. Everything the sheet stores about one
// character, and the sub-shapes it composes from. Changing anything reachable
// from `Character` means regenerating `src/schema.json` (`pnpm generate-schema`)
// and, for a breaking change, writing a migration.

// A weapon's normal / long range in feet (5e "80/320"). `long` is omitted for
// weapons with a single range (e.g. Net "5").
export interface WeaponRange {
  normal: number;
  long?: number;
}

// A saving throw the *target* makes against something the character does — a
// breath weapon, a Stunning Strike, a Battle Master maneuver. The counterpart to
// a to-hit `bonus`: instead of the character rolling to hit, the target rolls to
// avoid. Shared by `Attack` (save-based attacks) and `LimitedUseAbility` (a
// feature's DC), since "DC N, ABILITY save, effect on a success" is the same
// shape either way.
export interface SaveEffect {
  // The DC as a formula, not a number, so it re-derives on a level-up instead of
  // going stale — `saveDcFormula` in `rules.ts` builds the standard
  // 8 + PB + ability. (Spellcasting has its own seeded override in
  // `spellcastingClasses[].saveDcOverride`; this is that shape for everything
  // else.)
  dc: CustomFormula;
  // Which ability the *target* rolls. Deliberately independent of whichever
  // ability the DC derives from — a monk's Ki DC comes off WIS while Stunning
  // Strike calls for a CON save. Omit when it varies by use: one Ki pool backs
  // several features with different saves.
  stat?: StatKey;
  // What a successful save does to the damage: `half` (fireball, a breath
  // weapon) or `none` (a success avoids it entirely). Omit when there's no
  // damage to scale — the effect then lives in `note`.
  onSuccess?: "half" | "none";
  // Advisory prose for what the sheet can't model ("stunned until the end of
  // your next turn").
  note?: string;
}

export interface Attack {
  // Stable identity so ammunition entries can reference the weapons they feed
  // by id (a rename never orphans the link) — mirrors `IClass.id`.
  id: UUID;
  name: string;
  // The to-hit bonus. Optional because a save-based attack (a breath weapon, a
  // poison) has no attack roll at all — it sets `save` instead. An attack should
  // carry one or the other; both is legal and simply shows both.
  bonus?: CustomFormula;
  formula: CustomFormulaWithDamage;
  // Set instead of `bonus` when the target saves rather than the character
  // rolling to hit.
  save?: SaveEffect;
  // Optional weapon range; when present, shown as a tooltip on the attack name.
  range?: WeaponRange;
  // The weapon properties riders key off (see `AttackTag`). Seeded by
  // `buildAttackFromPreset` and editable; **absent means "unknown"**, not
  // "none" — a rider whose condition can't be decided falls back to an opt-in
  // prompt, which is how every hand-authored attack behaved before tags existed.
  tags?: AttackTag[];
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

// Exported only so `types/guards.ts` can name it in a predicate; the union
// `TextComponent` is what consumers use.
export interface TextComponentWithoutDetails {
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
  // The school of magic. `MagicSchool | string` rather than the bare enum so
  // homebrew traditions still fit (mirrors `ClassName`). The SRD importer has
  // always known this — it just used to be buried in the description prose.
  school?: MagicSchool | string;
  // How long the spell takes to cast. Typed against `CastingTime` for the three
  // action-economy values so they can be matched exactly (and, later, drive a
  // "what can I do this turn" view), while still accepting "1 minute",
  // "8 hours", or anything else as free text.
  castingTime?: CastingTime | string;
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

// One option picked from a list a class offers a fixed number of choices from:
// a Metamagic option, a Battle Master maneuver, a warlock's Pact Boon. These
// differ from `features` in that they come from a *closed* list with a known
// "how many you know" count, which is what lets the sheet show "3 / 5 known"
// and offer the remaining options as a picker.
//
// Fighting styles and eldritch invocations deliberately stay in `features`
// instead: rider matching keys off feature titles (see `ridersFor`), so moving
// them would silently unhook Great Weapon Fighting and friends. `ridersFor` does
// also scan chosen options by name, so an option that later gains mechanics
// works without moving it.
export interface ChosenOption {
  // Which list it came from, matching an `OptionGroup.category` — the sheet
  // groups by this and uses it to find the group's rules.
  category: string;
  // The option's name, e.g. "Twinned Spell". The identity key: catalog lookups
  // and rider matching both go through it.
  name: string;
  // An original paraphrase of what it does, copied from the catalog at pick
  // time so the sheet reads standalone. Editable, and free-text for homebrew.
  detail?: string;
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
  // The DC targets roll against when this feature calls for a saving throw —
  // a monk's Ki save DC, a Battle Master's maneuver DC. Absent for the many
  // pools that never impose one (Second Wind, Action Surge).
  save?: SaveEffect;
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
  // You either have inspiration or you don't — 5e gives it no quantity, and
  // modelling it as a count meant the sheet showed "0" for a thing that has no
  // number and made the most-toggled field on the sheet cost a modal.
  inspiration: boolean;
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
  // A flat bonus added to *every* saving throw, as a formula (so it can track an
  // ability modifier). The home for Paladin's Aura of Protection (CHA mod, min
  // 1, from 6th level) and items like a Cloak of Protection. Optional — absent
  // means no across-the-board save bonus. Seeded by the paladin level grant.
  savingThrowBonus?: CustomFormula;
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
  // Named options picked from a fixed list a class offers — Metamagic, Battle
  // Master maneuvers, a warlock's Pact Boon. Optional so old saves validate.
  chosenOptions?: ChosenOption[];
  // Party-session codes this character has joined, most recent first. Session
  // codes are uuids (the uuid *is* the authentication, as with shared
  // characters), which makes them unmemorable — and a table rejoins the same
  // session every week. So the character remembers them rather than asking the
  // player to find last week's message again.
  //
  // On the character rather than in app settings because it is per-character:
  // your wizard plays in the Tuesday game, your paladin doesn't. Optional, so
  // old saves validate without a migration.
  playSessions?: PlaySessionRef[];
}

// A session this character has been in. `lastJoined` is epoch ms, and is what
// orders the rejoin list — a code alone can't be told apart from another one.
export interface PlaySessionRef {
  code: UUID;
  lastJoined: number;
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
