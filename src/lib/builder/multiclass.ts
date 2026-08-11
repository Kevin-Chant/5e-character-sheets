import {
  OfficialClass,
  REAL_SKILLS,
  SkillName,
} from "src/lib/data/data-definitions";
import { getCatalogClass } from "src/lib/builder/class-catalog";

// Multiclassing proficiencies (PHB p.163; Artificer from TCE). A second class
// grants a much smaller subset than its own level-1 list, not the full one —
// a barbarian brings shields and weapons but no armor training, a wizard
// brings nothing. Saving throws are absent: RAW grants none from multiclass.

export interface MulticlassProficiencies {
  // Armor grant strings, in the vocabulary `grantArmor` parses.
  armor: string[];
  weapons: string[];
  // Tool proficiencies granted outright (no choice).
  tools: string[];
  // "One skill from this class's skill list."
  chooseSkills: number;
  // "One musical instrument of your choice" (bard), from the class's own tool
  // list (the instrument list, for the bard).
  chooseTools: number;
  // Bard's skill is "one skill of your choice", not one from the class list.
  anySkill?: boolean;
}

const NONE: MulticlassProficiencies = {
  armor: [],
  weapons: [],
  tools: [],
  chooseSkills: 0,
  chooseTools: 0,
};

const grant = (
  partial: Partial<MulticlassProficiencies>,
): MulticlassProficiencies => ({ ...NONE, ...partial });

const LIGHT = "Light Armor";
const MEDIUM = "Medium Armor";
const SHIELDS = "Shields";
const SIMPLE = "Simple Weapons";
const MARTIAL = "Martial Weapons";

export const MULTICLASS_PROFICIENCIES: Record<
  OfficialClass,
  MulticlassProficiencies
> = {
  [OfficialClass.Artificer]: grant({
    armor: [LIGHT, MEDIUM, SHIELDS],
    tools: ["Thieves' Tools", "Tinker's Tools"],
  }),
  [OfficialClass.Barbarian]: grant({
    armor: [SHIELDS],
    weapons: [SIMPLE, MARTIAL],
  }),
  [OfficialClass.Bard]: grant({
    armor: [LIGHT],
    chooseSkills: 1,
    anySkill: true,
    chooseTools: 1,
  }),
  [OfficialClass.Cleric]: grant({ armor: [LIGHT, MEDIUM, SHIELDS] }),
  [OfficialClass.Druid]: grant({ armor: [LIGHT, MEDIUM, SHIELDS] }),
  [OfficialClass.Fighter]: grant({
    armor: [LIGHT, MEDIUM, SHIELDS],
    weapons: [SIMPLE, MARTIAL],
  }),
  [OfficialClass.Monk]: grant({ weapons: [SIMPLE, "Shortswords"] }),
  [OfficialClass.Paladin]: grant({
    armor: [LIGHT, MEDIUM, SHIELDS],
    weapons: [SIMPLE, MARTIAL],
  }),
  [OfficialClass.Ranger]: grant({
    armor: [LIGHT, MEDIUM, SHIELDS],
    weapons: [SIMPLE, MARTIAL],
    chooseSkills: 1,
  }),
  [OfficialClass.Rogue]: grant({
    armor: [LIGHT],
    tools: ["Thieves' Tools"],
    chooseSkills: 1,
  }),
  // Sorcerer and Wizard grant nothing at all when multiclassed into.
  [OfficialClass.Sorcerer]: NONE,
  [OfficialClass.Warlock]: grant({ armor: [LIGHT], weapons: [SIMPLE] }),
  [OfficialClass.Wizard]: NONE,
};

// What multiclassing into `className` grants. Homebrew classes aren't in the
// table; they grant nothing rather than inheriting a guess, which matches how
// the rest of the builder treats unknown classes.
export const multiclassProficienciesFor = (
  className: string,
): MulticlassProficiencies =>
  MULTICLASS_PROFICIENCIES[className as OfficialClass] ?? NONE;

// The skills a multiclass skill pick may choose from: the class's own skill
// list, except the bard, whose PHB entry reads "one skill of your choice".
export function multiclassSkillOptions(className: string): SkillName[] {
  const g = multiclassProficienciesFor(className);
  if (g.chooseSkills === 0) return [];
  if (g.anySkill) return REAL_SKILLS;
  return getCatalogClass(className.toLowerCase())?.skillChoices?.from ?? [];
}

// The tool list a multiclass tool pick draws from (the bard's instruments).
export function multiclassToolOptions(className: string): string[] {
  const g = multiclassProficienciesFor(className);
  if (g.chooseTools === 0) return [];
  return getCatalogClass(className.toLowerCase())?.toolChoices?.from ?? [];
}
