import {
  Alignment,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { CustomFormula, Senses, Speeds } from "src/lib/types";
import { emptyLevelChoices, LevelChoices } from "src/lib/builder/level-grants";

// Bundled catalog data shapes. `srd-races.json` / `srd-classes.json` are
// frozen SRD snapshots; non-SRD extras in `src/lib/data/nonsrd-*.ts` and
// `subclasses.ts` share these shapes.

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
  // Fixed skill proficiencies granted outright, distinct from
  // `CatalogRace.skillChoices` ("choose N").
  skills: SkillName[];
}

export interface CatalogSubrace {
  index: string;
  name: string;
  abilityBonuses: AbilityBonus[];
  languageChoices?: number;
  skillChoices?: { choose: number; from: SkillName[] };
  // Grants a feat at level 1 (Variant Human, Custom Lineage).
  grantsFeat?: boolean;
  // Overrides the race's base walking speed when set.
  speed?: number;
  proficiencies: ProficiencyGrants;
  traits: RaceTrait[];
}

export interface CatalogRace {
  index: string;
  name: string;
  size: string;
  speed: number;
  abilityBonuses: AbilityBonus[];
  // "Choose N of these +1s" (Half-Elf); listed stats are candidates.
  abilityBonusOptions?: { choose: number; from: StatKey[] };
  languages: string[];
  languageChoices?: number;
  skillChoices?: { choose: number; from: SkillName[] };
  // Races whose grant is "darkvision OR a skill" (Custom Lineage) put the
  // darkvision range here; skill side is `skillChoices`. Present means the
  // wizard must ask which; neither is granted by default.
  darkvisionOrSkill?: number;
  grantsFeat?: boolean;
  // Draconic ancestry pick (Dragonborn) sets damage resistance and breath
  // weapon shape/save/type. Chosen label stored in
  // `BuilderState.draconicAncestry`; table is `DRACONIC_ANCESTRIES`.
  draconicAncestry?: boolean;
  proficiencies: ProficiencyGrants;
  traits: RaceTrait[];
  subraces: CatalogSubrace[];
}

export interface CatalogClassSpellcasting {
  ability: StatKey;
  cantripsKnown: number;
  // null for prepared casters (Wizard/Cleric/Druid).
  spellsKnown: number | null;
  slotsLevel1: number;
}

export interface CatalogClass {
  index: string;
  name: string;
  hitDie: number;
  savingThrows: StatKey[];
  skillChoices?: { choose: number; from: SkillName[] };
  // "Choose N tool proficiencies from this list", distinct from
  // `proficiencies.tools` (granted outright).
  toolChoices?: { choose: number; from: string[] };
  proficiencies: ProficiencyGrants;
  startingEquipment: string[];
  startingEquipmentOptions: string[];
  spellcasting?: CatalogClassSpellcasting;
  subclassAtLevel1: boolean;
  features: RaceTrait[];
}

// Mechanical (non-prose, non-proficiency) effects a class/subclass level
// confers, applied to a character field. Every field must be idempotent (a
// set, max, or uniq'd list) since `applyClassLevel` can re-run a level.
export interface LevelEffects {
  savingThrows?: StatKey[];
  // Skill proficiencies gained outright at a level after the subclass choice
  // (`grants` can't reach those levels).
  skills?: SkillName[];
  // Free-text, matching `DamageModifiers`; `DamageType` values are the
  // convention but not enforced.
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  // In feet. `"walk"` copies the character's current walking speed. Only ever
  // raised, never lowered.
  speeds?: Partial<Record<keyof Speeds, number | "walk">>;
  // In feet. Only ever raised (a race's 60 ft. darkvision outlives a
  // feature's 30).
  senses?: Partial<Senses>;
  // Ability modifier added to the initiative formula, guarded against
  // double-application.
  initiativeAbility?: StatKey;
}

// A class's subclass. `grants` carries level-1 mechanics and is only present
// for the three classes that choose a subclass at level 1
// (cleric/sorcerer/warlock). Mechanical facts only; summaries/details are
// original paraphrases, not published prose.
export interface CatalogSubclass {
  index: string;
  // Matches `CatalogClass.index`.
  classIndex: string;
  name: string;
  summary: string;
  grants?: {
    features?: RaceTrait[];
    proficiencies?: Partial<ProficiencyGrants>;
    // Granted/always-prepared at the choice level, resolved against the
    // whole bundled catalog (SRD and non-SRD).
    spellIndices?: string[];
    // Granted as the class levels, keyed by class level (e.g. paladin oath
    // spells at 5/9/13/17). Applied idempotently every level-up. Indices not
    // in the catalog are silently skipped.
    spellIndicesByLevel?: Record<number, string[]>;
    // `expertise` doubles the proficiency bonus for the chosen skills. Picks
    // live in `LevelChoices.subclassSkillChoices`.
    skillChoices?: { choose: number; from: SkillName[]; expertise?: boolean };
    // Fixed skills granted with expertise, no choice involved. Distinct from
    // `proficiencies.skills` (proficiency alone).
    expertiseSkills?: SkillName[];
  };
  // Feature prose per class level — the subclass counterpart to
  // `CLASS_FEATURES`, since `grants` only fires once at the choice level.
  // Applied whenever that level is reached with this subclass selected, and
  // de-duplicated by title (safe to also list choice-level features here).
  levelFeatures?: Record<number, RaceTrait[]>;
  // `levelFeatures` counterpart for `LevelEffects` rather than prose.
  levelEffects?: Record<number, LevelEffects>;
}

// Mechanical grants a feat applies on top of its `effect` prose. Purely
// situational rules (e.g. Great Weapon Master's -5/+10) stay as `effect` text.
export interface FeatGrants {
  // --- automatic (no choice) ---
  savingThrowFromAbility?: boolean; // proficiency in the ability this feat raises
  armor?: string[];
  weapons?: string[];
  tools?: string[];
  speedBonus?: number;
  initiativeBonus?: number;
  fixedCantrips?: string[]; // SRD cantrip indices
  fixedSpells?: string[]; // SRD leveled-spell indices
  // Formula (like LimitedUseAbility) so a pool can scale off PB, an ability
  // mod, or level.
  limitedUse?: {
    name: string;
    detail?: string;
    maxUses: CustomFormula;
    recharge: "short" | "long";
  };
  // --- player choices (pickers in the level-up feat step) ---
  chooseSkills?: number;
  chooseExpertise?: number;
  chooseWeapons?: number;
  // One entry per level (0 = cantrips): choose `count` at `level`.
  chooseSpells?: { level: number; count: number }[];
}

// A selectable feat. Only Grappler is in the open SRD, so the rest is
// hand-authored: mechanical facts + an original paraphrase in `effect`, never
// published prose. Half-feats carry `abilityIncrease`; pure feats omit it.
export interface Feat {
  index: string;
  name: string;
  summary: string;
  prerequisite?: string;
  abilityIncrease?: { by: number; from: StatKey[] };
  effect: string;
  grants?: FeatGrants;
}

// Builder state — the single source of truth the wizard steps edit and that
// `buildCharacter` consumes.

export type StartMode = "guided" | "blank" | "sample";

export type ScoreMethod = "pointbuy" | "standard" | "roll" | "manual";

export interface PersonalityDraft {
  traits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
}

// `stat` may be "" while unassigned (e.g. a Half-Elf's floating +1s).
export interface RaceBonus {
  bonus: number;
  stat: StatKey | "";
}

// Standard-array / rolled value pool assigned onto the six abilities; null =
// not yet assigned. Each pool value used at most once.
export type StatAssignment = Record<StatKey, number | null>;

export const CUSTOM_SUBRACE = "__custom";
// Explicit "this race has no subrace" selection.
export const NO_SUBRACE = "__none";

export interface BuilderState extends LevelChoices {
  mode: StartMode;

  // `raceIndex` undefined means "not chosen" or an explicit custom race;
  // `raceIsCustom` distinguishes the two.
  raceIndex?: string;
  raceIsCustom: boolean;
  customRaceName: string;
  // May be CUSTOM_SUBRACE for a homebrew/other subrace.
  subraceIndex?: string;
  customSubraceName: string;
  // Seeded from race defaults but freely reassignable.
  raceBonuses: RaceBonus[];
  raceSkillChoices: SkillName[];
  // For a `darkvisionOrSkill` race: true when the player took darkvision over
  // the skill.
  raceTookDarkvision: boolean;
  // `DRACONIC_ANCESTRIES` key for a Dragonborn.
  draconicAncestry?: string;
  // High Elf's "High Elf Cantrip" trait — granted as an at-will ability since
  // racial spells have no class.
  highElfCantrip?: string;
  raceLanguageChoices: string[];

  // `classIndex` undefined means "not chosen" or an explicit custom class;
  // `classIsCustom` disambiguates.
  classIndex?: string;
  classIsCustom: boolean;
  customClassName: string;
  customHitDie: StandardDie;
  classSkillChoices: SkillName[];

  // Level-1 feat for races that grant one. Field names match `LevelUpState`
  // so both wizards feed the same `applyFeat`.
  featIndex?: string;
  featAbilityChoice?: StatKey;
  featSkillChoices: SkillName[];
  featExpertiseChoices: SkillName[];
  featWeaponChoices: string[];
  featSpellChoices: Record<number, string[]>;

  // Ability scores, base (pre-racial).
  scoreMethod: ScoreMethod;
  // Source of truth for point-buy and manual entry.
  baseStats: Record<StatKey, number>;
  rolledPool: number[];
  assignment: StatAssignment;

  // `backgroundName` undefined means "not chosen" or the custom path;
  // `backgroundIsCustom` disambiguates.
  backgroundName?: string;
  backgroundIsCustom: boolean;
  customBackgroundSkills: SkillName[];
  customBackgroundTools: string;
  customBackgroundFeatureTitle: string;
  customBackgroundFeatureDetail: string;
  backgroundLanguageChoices: string[];
  // From the background's own "choose N", separate from
  // `customBackgroundSkills` (the whole grant for a homebrew one).
  backgroundSkillChoices: SkillName[];

  // SRD indices. Only used when the class casts at level 1.
  cantripIndices: string[];
  levelOneSpellIndices: string[];

  // PHB alternative to the class package: roll for gold and buy your own kit.
  // "gold" replaces the class loadout only; background equipment comes
  // either way.
  startingWealth: "equipment" | "gold";
  // Held in state rather than rolled during build, which re-runs every
  // keystroke.
  startingGold?: number;
  acceptClassEquipment: boolean;
  // Keyed by index in `startingEquipmentOptions` → chosen choice index.
  // Absent = first choice. Reset when the class changes.
  classEquipmentChoices: Record<number, number>;
  // For weapon-category options ("any martial weapon"), the concrete weapon
  // name per slot, keyed by option index. Reset when the class changes.
  classWeaponChoices: Record<number, string[]>;
  acceptBackgroundEquipment: boolean;
  extraEquipment: string[];

  // Details.
  name: string;
  playerName: string;
  alignment: Alignment;
  personality: PersonalityDraft;
}

// Point buy starts every score at 8 (5e floor), full 27-point budget unspent.
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
    backgroundSkillChoices: [],
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
