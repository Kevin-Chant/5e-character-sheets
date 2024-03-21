import { Character } from "src/lib/types";

export type ACTION = "load_character" | `update_${FIELD}`;

export enum FIELD {
  name = "name",
  class = "class",
  background = "background",
  playerName = "playerName",
  race = "race",
  alignment = "alignment",
  exp = "exp",
  "stats.str" = "stats.str",
  "stats.dex" = "stats.dex",
  "stats.con" = "stats.con",
  "stats.int" = "stats.int",
  "stats.wis" = "stats.wis",
  "stats.cha" = "stats.cha",
  inspiration = "inspiration",
  pbOverride = "pbOverride",
  "proficiencies.savingThrows.str" = "proficiencies.savingThrows.str",
  "proficiencies.savingThrows.dex" = "proficiencies.savingThrows.dex",
  "proficiencies.savingThrows.con" = "proficiencies.savingThrows.con",
  "proficiencies.savingThrows.int" = "proficiencies.savingThrows.int",
  "proficiencies.savingThrows.wis" = "proficiencies.savingThrows.wis",
  "proficiencies.savingThrows.cha" = "proficiencies.savingThrows.cha",
  "proficiencies.skills.Acrobatics" = "proficiencies.skills.Acrobatics",
  "proficiencies.skills.Animal Handling" = "proficiencies.skills.Animal Handling",
  "proficiencies.skills.Arcana" = "proficiencies.skills.Arcana",
  "proficiencies.skills.Athletics" = "proficiencies.skills.Athletics",
  "proficiencies.skills.Deception" = "proficiencies.skills.Deception",
  "proficiencies.skills.History" = "proficiencies.skills.History",
  "proficiencies.skills.Insight" = "proficiencies.skills.Insight",
  "proficiencies.skills.Intimidation" = "proficiencies.skills.Intimidation",
  "proficiencies.skills.Investigation" = "proficiencies.skills.Investigation",
  "proficiencies.skills.Medicine" = "proficiencies.skills.Medicine",
  "proficiencies.skills.Nature" = "proficiencies.skills.Nature",
  "proficiencies.skills.Perception" = "proficiencies.skills.Perception",
  "proficiencies.skills.Performance" = "proficiencies.skills.Performance",
  "proficiencies.skills.Persuasion" = "proficiencies.skills.Persuasion",
  "proficiencies.skills.Religion" = "proficiencies.skills.Religion",
  "proficiencies.skills.Sleight of Hand" = "proficiencies.skills.Sleight of Hand",
  "proficiencies.skills.Stealth" = "proficiencies.skills.Stealth",
  "proficiencies.skills.Survival" = "proficiencies.skills.Survival",
  "proficiencies.skills.Thieves Tools" = "proficiencies.skills.Thieves Tools",
  otherProficiencies = "otherProficiencies",
  acFormula = "acFormula",
  speed = "speed",
  maxHp = "maxHp",
  currHp = "currHp",
  tempHp = "tempHp",
  hitDice = "hitDice",
  exhaustion = "exhaustion",
  deathSaves = "deathSaves",
  attacks = "attacks",
  coins = "coins",
  equipment = "equipment",
  "personality.traits" = "personality.traits",
  "personality.ideals" = "personality.ideals",
  "personality.bonds" = "personality.bonds",
  "personality.flaws" = "personality.flaws",
  features = "features",
}

export type Action = {
  type: ACTION;
  payload: any;
};

export function loadFullCharacter(character: Character): Action {
  return {
    type: "load_character",
    payload: character,
  };
}

export function updateData(targetedField: FIELD, data: any): Action {
  return {
    type: `update_${targetedField}`,
    payload: data,
  };
}
