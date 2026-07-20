import {
  Alignment,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { CustomFormula } from "src/lib/types";

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
    // SRD spell indices granted/always-prepared at level 1 (e.g. cleric domain
    // spells). Only spells present in the bundled SRD catalog are auto-added;
    // any non-SRD domain spells are named in a feature detail instead.
    spellIndices?: string[];
  };
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
