import {
  Alignment,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";

// ---------------------------------------------------------------------------
// Bundled SRD data shapes (mirror the JSON written by the generate-* scripts).
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
}

export interface SrdSubrace {
  index: string;
  name: string;
  abilityBonuses: AbilityBonus[];
  languageChoices?: number;
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
  proficiencies: ProficiencyGrants;
  startingEquipment: string[];
  startingEquipmentOptions: string[];
  spellcasting?: SrdClassSpellcasting;
  subclassAtLevel1: boolean;
  features: RaceTrait[];
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

export interface BuilderState {
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
  // Free-text extra languages chosen for race `languageChoices`.
  raceLanguageChoices: string[];

  // Class — `classIndex` undefined means "not chosen yet" or an explicit custom
  // class; `classIsCustom` disambiguates (see `raceIsCustom`).
  classIndex?: string;
  classIsCustom: boolean;
  customClassName: string;
  customHitDie: StandardDie;
  subclass?: string;
  classSkillChoices: SkillName[];

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

  // Equipment.
  acceptClassEquipment: boolean;
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
    raceLanguageChoices: [],
    classIsCustom: false,
    customClassName: "",
    customHitDie: StandardDie.d8,
    classSkillChoices: [],
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
    acceptClassEquipment: true,
    acceptBackgroundEquipment: true,
    extraEquipment: [],
    name: "",
    playerName: "",
    alignment: Alignment["True Neutral"],
    personality: { traits: [], ideals: [], bonds: [], flaws: [] },
  };
}
