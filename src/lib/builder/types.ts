import {
  Alignment,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { CustomFormula, Speeds } from "src/lib/types";
import { emptyLevelChoices, LevelChoices } from "src/lib/builder/level-grants";

// ---------------------------------------------------------------------------
// Bundled catalog data shapes. `srd-races.json` / `srd-classes.json` are frozen
// snapshots of the open-license 2014 SRD (edit them directly — the old
// generate-races/classes scripts have been retired). The hand-authored official
// extras live in `src/lib/data/nonsrd-*.ts` and `subclasses.ts` and share these
// shapes. (Spells are still refreshed via `pnpm generate-spells`.)
// ---------------------------------------------------------------------------

export interface AbilityBonus {
  stat: StatKey;
  bonus: number;
}

export interface RaceTrait {
  title: string;
  detail: string;
}

export interface ProficiencyGrants {
  armor: string[];
  weapons: string[];
  tools: string[];
  // Fixed skill proficiencies granted outright (e.g. Elf Keen Senses →
  // Perception). Distinct from `SrdRace.skillChoices`, which is a "choose N".
  skills: SkillName[];
}

export interface SrdSubrace {
  index: string;
  name: string;
  abilityBonuses: AbilityBonus[];
  languageChoices?: number;
  // Skill proficiency choices the subrace grants (Variant Human's one skill).
  skillChoices?: { choose: number; from: SkillName[] };
  // The subrace grants a feat at level 1 (Variant Human, Custom Lineage) — the
  // one path by which a brand-new character starts with one.
  grantsFeat?: boolean;
  // Overrides the race's base walking speed when set (e.g. Wood Elf → 35).
  speed?: number;
  proficiencies: ProficiencyGrants;
  traits: RaceTrait[];
}

export interface SrdRace {
  index: string;
  name: string;
  size: string;
  speed: number;
  abilityBonuses: AbilityBonus[];
  // "Choose N of these +1s" (Half-Elf). The listed stats are candidates.
  abilityBonusOptions?: { choose: number; from: StatKey[] };
  languages: string[];
  languageChoices?: number;
  // Race-granted skill proficiency choices (Half-Elf Skill Versatility).
  skillChoices?: { choose: number; from: SkillName[] };
  // Races whose grant is "darkvision OR a skill" (Custom Lineage) put the
  // darkvision range here; the skill side is the `skillChoices` above. Present
  // means the wizard must ask which, and neither is granted by default.
  darkvisionOrSkill?: number;
  // The race grants a feat at level 1 (Custom Lineage). See the same flag on
  // `SrdSubrace` for the Variant Human path.
  grantsFeat?: boolean;
  // The race picks a draconic ancestry (Dragonborn): a dragon type that sets its
  // damage resistance and breath weapon's shape/save/type. The chosen label is
  // stored in `BuilderState.draconicAncestry`; the table is `DRACONIC_ANCESTRIES`.
  draconicAncestry?: boolean;
  proficiencies: ProficiencyGrants;
  traits: RaceTrait[];
  subraces: SrdSubrace[];
}

export interface SrdClassSpellcasting {
  ability: StatKey;
  cantripsKnown: number;
  // null for prepared casters (Wizard/Cleric/Druid), who don't track a count.
  spellsKnown: number | null;
  slotsLevel1: number;
}

export interface SrdClass {
  index: string;
  name: string;
  hitDie: number;
  savingThrows: StatKey[];
  skillChoices?: { choose: number; from: SkillName[] };
  // "Choose N tool proficiencies from this list" — the bard's three musical
  // instruments, the monk's one artisan's tool or instrument. Distinct from
  // `proficiencies.tools`, which is granted outright (a rogue's Thieves' Tools).
  toolChoices?: { choose: number; from: string[] };
  proficiencies: ProficiencyGrants;
  startingEquipment: string[];
  startingEquipmentOptions: string[];
  spellcasting?: SrdClassSpellcasting;
  subclassAtLevel1: boolean;
  features: RaceTrait[];
}

// The mechanical (non-prose, non-proficiency) effects a class or subclass level
// confers. Everything here is *idempotent by construction* — a set, a max, or a
// uniq'd list — because `applyClassLevel` re-runs a level freely and a grant
// that accumulated would double on the second pass.
//
// This is the home for the handful of grants that aren't features, spells, or
// proficiencies: the ones that write to a specific character field. Prose still
// describes them; this is what makes the number on the sheet move.
export interface LevelEffects {
  // Saving-throw proficiencies gained outright (a monk's Diamond Soul).
  savingThrows?: StatKey[];
  // Damage resistances / immunities gained (Storm Sorcery's Heart of the
  // Storm). Strings, matching `DamageModifiers` — `DamageType` values are the
  // convention, but the field is free-text on the sheet.
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  // Movement speeds, in feet. `"walk"` copies the character's current walking
  // speed, which is how most flight grants are worded ("a flying speed equal to
  // your current speed"). A speed is only ever raised, never lowered.
  speeds?: Partial<Record<keyof Speeds, number | "walk">>;
  // An ability modifier added to the initiative formula (a Gloom Stalker's
  // Dread Ambusher, a Swashbuckler's Rakish Audacity). Folded in the same way
  // Alert's flat +5 is, and guarded against double-application.
  initiativeAbility?: StatKey;
}

// A class's subclass ("Divine Domain", "Sorcerous Origin", "Otherworldly
// Patron", …). Every official subclass is listed by name so the builder can
// offer the full catalog. `grants` carries the *level-1* mechanics and is only
// present for the three classes that choose a subclass at level 1
// (cleric/sorcerer/warlock) — the only point the level-1 builder can apply
// them. As elsewhere, only mechanical facts are stored; the summaries and
// feature details are original short paraphrases, not published prose.
export interface SrdSubclass {
  index: string;
  // Owning class index ("cleric", "sorcerer", …), matching `SrdClass.index`.
  classIndex: string;
  name: string;
  // One-line original summary shown in the builder.
  summary: string;
  grants?: {
    features?: RaceTrait[];
    // Partial so a subclass only names the proficiency categories it touches.
    proficiencies?: Partial<ProficiencyGrants>;
    // Spell indices granted/always-prepared at the choice level (e.g. cleric
    // domain spells). Resolved against the whole bundled catalog — SRD *and*
    // non-SRD — so a subclass's non-SRD spells now grant too.
    spellIndices?: string[];
    // Spell indices granted as the class *levels*, keyed by class level — a
    // paladin's oath spells at 5/9/13/17, a warlock patron's expanded list, a
    // cleric domain's higher-level domain spells. Applied idempotently every
    // level-up (like the sub-choice grants), so re-running a level never doubles
    // a spell. Absent indices (still not in the catalog) are silently skipped.
    spellIndicesByLevel?: Record<number, string[]>;
    // "Choose N skill proficiencies" the subclass grants at its choice level
    // (Lore Bard's three, Knowledge cleric's two). `expertise` doubles the
    // proficiency bonus for the chosen skills (Knowledge Domain). The picks live
    // in `LevelChoices.subclassSkillChoices`.
    skillChoices?: { choose: number; from: SkillName[]; expertise?: boolean };
  };
  // Feature prose the subclass grants **at each level**, keyed by class level —
  // the subclass counterpart to `CLASS_FEATURES`. `grants` fires only once, at
  // the level the subclass is chosen, which left everything a subclass confers
  // later (a Berserker's 6th/10th/14th features) with no home at all.
  //
  // A level's entry is applied whenever that class level is reached with this
  // subclass selected, and de-duplicated by title — so listing the choice-level
  // features here as well as in `grants.features` is harmless, and new entries
  // don't have to be split across the two shapes.
  levelFeatures?: Record<number, RaceTrait[]>;
  // The `levelFeatures` counterpart for effects that write to a character field
  // rather than adding prose — see `LevelEffects`. Keyed by class level, so a
  // grant that arrives long after the subclass is chosen (Dragon Wings at 14th)
  // has a home; `grants` only ever fires at the choice level.
  levelEffects?: Record<number, LevelEffects>;
}

// The mechanical grants a feat applies on top of its `effect` prose. Only the
// parts of a feat that the sheet model can actually represent live here;
// purely situational rules (e.g. Great Weapon Master's -5/+10) stay as `effect`
// text. Fields split into automatic grants and player choices.
export interface FeatGrants {
  // --- automatic (no choice) ---
  // Grant saving-throw proficiency in the ability this feat raises (Resilient).
  savingThrowFromAbility?: boolean;
  armor?: string[]; // armor-proficiency grant strings ("Heavy Armor", …)
  weapons?: string[]; // fixed weapon proficiencies
  tools?: string[]; // fixed tool proficiencies
  speedBonus?: number; // added to walking speed (Mobile)
  initiativeBonus?: number; // added to the initiative formula (Alert)
  fixedCantrips?: string[]; // SRD cantrip indices always granted
  fixedSpells?: string[]; // SRD leveled-spell indices always granted
  // A refreshing resource pool surfaced as a limited-use ability. `maxUses` is a
  // formula (like the character model's LimitedUseAbility) so a pool can scale
  // off proficiency bonus, an ability modifier, or level — not just a constant.
  limitedUse?: {
    name: string;
    detail?: string;
    maxUses: CustomFormula;
    recharge: "short" | "long";
  };
  // --- player choices (pickers in the level-up feat step) ---
  chooseSkills?: number; // choose N skill proficiencies
  chooseExpertise?: number; // choose N skills to gain expertise in
  chooseWeapons?: number; // choose N weapon proficiencies
  // Spell choices, one entry per level (0 = cantrips): choose `count` at `level`.
  chooseSpells?: { level: number; count: number }[];
}

// A selectable feat. Only Grappler is in the open SRD, so the catalog is
// hand-authored: mechanical facts + an original paraphrase in `effect` (shown
// as a feature), never published prose. Half-feats carry `abilityIncrease`
// (raise one of `from` by `by`); pure feats omit it. `grants` carries the
// mechanically-enforced parts (the rest stays situational in `effect`).
export interface Feat {
  index: string;
  name: string;
  summary: string;
  prerequisite?: string;
  abilityIncrease?: { by: number; from: StatKey[] };
  effect: string;
  grants?: FeatGrants;
}

// ---------------------------------------------------------------------------
// Builder state — the single source of truth the wizard steps edit and that
// `buildCharacter` consumes.
// ---------------------------------------------------------------------------

export type StartMode = "guided" | "blank" | "sample";

export type ScoreMethod = "pointbuy" | "standard" | "roll" | "manual";

export interface PersonalityDraft {
  traits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
}

// A single racial ability-score bonus. `stat` may be "" while unassigned (e.g.
// a Half-Elf's floating +1s, or when the player is reassigning under the
// modern floating-bonus rules).
export interface RaceBonus {
  bonus: number;
  stat: StatKey | "";
}

// Assignment of a standard-array / rolled value pool onto the six abilities;
// null = not yet assigned. Each pool value is used at most once.
export type StatAssignment = Record<StatKey, number | null>;

export const CUSTOM_SUBRACE = "__custom";
// Explicit "this race has no subrace" selection, pre-selected for races that
// offer no official subrace so the subrace step still resolves to a choice.
export const NO_SUBRACE = "__none";

export interface BuilderState extends LevelChoices {
  mode: StartMode;

  // Race — `raceIndex` undefined means either "not chosen yet" or an explicit
  // custom race; `raceIsCustom` distinguishes the two so the custom card isn't
  // pre-highlighted before the player picks anything.
  raceIndex?: string;
  raceIsCustom: boolean;
  customRaceName: string;
  // `subraceIndex` may be CUSTOM_SUBRACE for a homebrew/other subrace.
  subraceIndex?: string;
  customSubraceName: string;
  // Racial ability bonuses — seeded from the race's defaults but freely
  // reassignable (modern floating-bonus rules).
  raceBonuses: RaceBonus[];
  // Chosen skills for a race `skillChoices` grant (Half-Elf).
  raceSkillChoices: SkillName[];
  // For a `darkvisionOrSkill` race, true when the player took the darkvision
  // side of the choice instead of the skill.
  raceTookDarkvision: boolean;
  // The chosen draconic ancestry label (a `DRACONIC_ANCESTRIES` key) for a
  // Dragonborn — sets its damage resistance and breath weapon specifics.
  draconicAncestry?: string;
  // The wizard cantrip a High Elf knows (its "High Elf Cantrip" trait) — a bare
  // spell name, granted as an at-will ability since racial spells have no class.
  highElfCantrip?: string;
  // Free-text extra languages chosen for race `languageChoices`.
  raceLanguageChoices: string[];

  // Class — `classIndex` undefined means "not chosen yet" or an explicit custom
  // class; `classIsCustom` disambiguates (see `raceIsCustom`).
  classIndex?: string;
  classIsCustom: boolean;
  customClassName: string;
  customHitDie: StandardDie;
  classSkillChoices: SkillName[];

  // Level-1 feat, for races that grant one (Variant Human, Custom Lineage).
  // Field names match `LevelUpState` so both wizards feed the same `applyFeat`.
  featIndex?: string;
  featAbilityChoice?: StatKey;
  featSkillChoices: SkillName[];
  featExpertiseChoices: SkillName[];
  featWeaponChoices: string[];
  featSpellChoices: Record<number, string[]>;

  // Ability scores (base, before racial bonuses).
  scoreMethod: ScoreMethod;
  // Source of truth for point-buy and manual entry.
  baseStats: Record<StatKey, number>;
  // Rolled score pool (roll method) and the standard-array/roll assignment.
  rolledPool: number[];
  assignment: StatAssignment;

  // Background — `backgroundName` undefined means "not chosen yet" or the custom
  // path; `backgroundIsCustom` disambiguates (see `raceIsCustom`).
  backgroundName?: string;
  backgroundIsCustom: boolean;
  customBackgroundSkills: SkillName[];
  customBackgroundTools: string;
  customBackgroundFeatureTitle: string;
  customBackgroundFeatureDetail: string;
  backgroundLanguageChoices: string[];

  // Spells (SRD indices). Only used when the class casts at level 1.
  cantripIndices: string[];
  levelOneSpellIndices: string[];

  // Equipment. The PHB alternative to the class package is rolling for gold and
  // buying your own kit; "gold" replaces the *class* loadout only, since your
  // background's equipment comes with you either way.
  startingWealth: "equipment" | "gold";
  // The rolled (or hand-entered) gold, when `startingWealth` is "gold". Held in
  // state rather than rolled during the build, which re-runs on every keystroke.
  startingGold?: number;
  acceptClassEquipment: boolean;
  // Per class starting-equipment option (keyed by its index in
  // `startingEquipmentOptions`) → the chosen choice index. Absent = the first
  // choice. Reset when the class changes.
  classEquipmentChoices: Record<number, number>;
  // For option choices that grant a weapon *category* ("any martial weapon"),
  // the concrete weapon name filling each slot, keyed by option index. Absent
  // slots default to the category's first weapon. Reset when the class changes.
  classWeaponChoices: Record<number, string[]>;
  acceptBackgroundEquipment: boolean;
  extraEquipment: string[];

  // Details.
  name: string;
  playerName: string;
  alignment: Alignment;
  personality: PersonalityDraft;
}

// Point buy starts every score at 8 (the standard 5e floor) with the full
// 27-point budget unspent — the default score method, so this is what the
// ability step shows on first open.
const POINT_BUY_FLOOR: Record<StatKey, number> = {
  str: 8,
  dex: 8,
  con: 8,
  int: 8,
  wis: 8,
  cha: 8,
};

export function defaultBuilderState(): BuilderState {
  return {
    mode: "guided",
    raceIsCustom: false,
    customRaceName: "",
    customSubraceName: "",
    raceBonuses: [],
    raceSkillChoices: [],
    raceTookDarkvision: false,
    raceLanguageChoices: [],
    classIsCustom: false,
    customClassName: "",
    customHitDie: StandardDie.d8,
    classSkillChoices: [],
    ...emptyLevelChoices(),
    featSkillChoices: [],
    featExpertiseChoices: [],
    featWeaponChoices: [],
    featSpellChoices: {},
    scoreMethod: "pointbuy",
    baseStats: { ...POINT_BUY_FLOOR },
    rolledPool: [],
    assignment: {
      str: null,
      dex: null,
      con: null,
      int: null,
      wis: null,
      cha: null,
    },
    backgroundIsCustom: false,
    customBackgroundSkills: [],
    customBackgroundTools: "",
    customBackgroundFeatureTitle: "",
    customBackgroundFeatureDetail: "",
    backgroundLanguageChoices: [],
    cantripIndices: [],
    levelOneSpellIndices: [],
    startingWealth: "equipment",
    acceptClassEquipment: true,
    classEquipmentChoices: {},
    classWeaponChoices: {},
    acceptBackgroundEquipment: true,
    extraEquipment: [],
    name: "",
    playerName: "",
    alignment: Alignment["True Neutral"],
    personality: { traits: [], ideals: [], bonds: [], flaws: [] },
  };
}
