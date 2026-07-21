export enum OfficialClass {
  Artificer = "Artificer",
  Barbarian = "Barbarian",
  Bard = "Bard",
  Cleric = "Cleric",
  Druid = "Druid",
  Fighter = "Fighter",
  Monk = "Monk",
  Paladin = "Paladin",
  Ranger = "Ranger",
  Rogue = "Rogue",
  Sorcerer = "Sorcerer",
  Warlock = "Warlock",
  Wizard = "Wizard",
}

export const OfficialSubclasses: Record<OfficialClass, string[]> = {
  Artificer: ["Alchemist", "Armorer", "Artillerist", "Battle Smith"],
  Barbarian: [
    "Ancestral Guardian",
    "Battlerager",
    "Beast",
    "Berserker",
    "Giant",
    "Storm Herald",
    "Totem Warrior",
    "Wild Magic",
    "Zealot",
  ],
  Bard: [
    "Creation",
    "Eloquence",
    "Glamour",
    "Lore",
    "Spirits",
    "Swords",
    "Valor",
    "Whispers",
  ],
  Cleric: [
    "Arcana",
    "Death",
    "Forge",
    "Grave",
    "Knowledge",
    "Life",
    "Light",
    "Nature",
    "Order",
    "Peace",
    "Tempest",
    "Trickery",
    "Twilight",
    "War",
  ],
  Druid: ["Dreams", "Land", "Moon", "Shepherd", "Spores", "Stars", "Wildfire"],
  Fighter: [
    "Arcane Archer",
    "Banneret",
    "Battle Master",
    "Cavalier",
    "Champion",
    "Echo Knight",
    "Eldritch Knight",
    "Psi Warrior",
    "Rune Knight",
    "Samurai",
  ],
  Monk: [
    "Astral Self",
    "Ascendant Dragon",
    "Drunken Master",
    "Four Elements",
    "Kensei",
    "Long Death",
    "Mercy",
    "Open Hand",
    "Shadow",
    "Sun Soul",
  ],
  Paladin: [
    "Ancients",
    "Conquest",
    "Crown",
    "Devotion",
    "Glory",
    "Redemption",
    "Vengeance",
    "Watchers",
    "Oathbreaker",
  ],
  Ranger: [
    "Beast Master",
    "Fey Wanderer",
    "Gloom Stalker",
    "Horizon Walker",
    "Hunter",
    "Monster Slayer",
    "Swarmkeeper",
    "Drakewarden",
  ],
  Rogue: [
    "Arcane Trickster",
    "Assassin",
    "Inquisitive",
    "Mastermind",
    "Phantom",
    "Scout",
    "Soulknife",
    "Swashbuckler",
    "Thief",
  ],
  Sorcerer: [
    "Aberrant Mind",
    "Clockwork Soul",
    "Draconic Bloodline",
    "Divine Soul",
    "Lunar Sorcery",
    "Shadow Magic",
    "Storm Sorcery",
    "Wild Magic",
  ],
  Warlock: [
    "Archfey",
    "Celestial",
    "Fathomless",
    "Fiend",
    "Genie",
    "Great Old One",
    "Hexblade",
    "Undead",
    "Undying",
  ],
  Wizard: [
    "Abjuration",
    "Bladesinging",
    "Chronurgy",
    "Conjuration",
    "Divination",
    "Enchantment",
    "Evocation",
    "Graviturgy",
    "Illusion",
    "Necromancy",
    "Order of Scribes",
    "Transmutation",
    "War Magic",
  ],
};

export enum DamageType {
  Acid = "Acid",
  Bludgeoning = "Bludgeoning",
  Cold = "Cold",
  Fire = "Fire",
  Force = "Force",
  Lightning = "Lightning",
  Necrotic = "Necrotic",
  Piercing = "Piercing",
  Poison = "Poison",
  Psychic = "Psychic",
  Radiant = "Radiant",
  Slashing = "Slashing",
  Thunder = "Thunder",
}

export enum StatKey {
  str = "str",
  dex = "dex",
  con = "con",
  int = "int",
  wis = "wis",
  cha = "cha",
}

export const PB = "proficiencyBonus";

export enum SkillName {
  "Acrobatics" = "Acrobatics",
  "Animal Handling" = "Animal Handling",
  "Arcana" = "Arcana",
  "Athletics" = "Athletics",
  "Deception" = "Deception",
  "History" = "History",
  "Insight" = "Insight",
  "Intimidation" = "Intimidation",
  "Investigation" = "Investigation",
  "Medicine" = "Medicine",
  "Nature" = "Nature",
  "Perception" = "Perception",
  "Performance" = "Performance",
  "Persuasion" = "Persuasion",
  "Religion" = "Religion",
  "Sleight of Hand" = "Sleight of Hand",
  "Stealth" = "Stealth",
  "Survival" = "Survival",
  "Thieves Tools" = "Thieves Tools",
}

export enum StandardDie {
  d4 = "d4",
  d6 = "d6",
  d8 = "d8",
  d10 = "d10",
  d12 = "d12",
  d20 = "d20",
}

export enum CoinType {
  CP = "CP",
  SP = "SP",
  EP = "EP",
  GP = "GP",
  PP = "PP",
}

export const CoinValues: Record<CoinType, number> = {
  CP: 0.01,
  SP: 0.1,
  EP: 0.5,
  GP: 1,
  PP: 10,
};

// Creature size categories. PCs are almost always Small or Medium, but the full
// set is modelled so Large/other homebrew and mount/wildshape notes have a home.
export enum Size {
  Tiny = "Tiny",
  Small = "Small",
  Medium = "Medium",
  Large = "Large",
  Huge = "Huge",
  Gargantuan = "Gargantuan",
}

export enum Alignment {
  "Lawful Good" = "Lawful Good",
  "Neutral Good" = "Neutral Good",
  "Chaotic Good" = "Chaotic Good",
  "Lawful Neutral" = "Lawful Neutral",
  "True Neutral" = "True Neutral",
  "Chaotic Neutral" = "Chaotic Neutral",
  "Lawful Evil" = "Lawful Evil",
  "Neutral Evil" = "Neutral Evil",
  "Chaotic Evil" = "Chaotic Evil",
}

// Type definitions for the runtime-defined types of fields (not Typescript's compile-time types)
// This is necessary for the edit modal to automatically select the appropriate input type for the
// field being changed
export type FieldTypeNode =
  | "boolean"
  | "string"
  | "number"
  | "formula"
  | "formulaWithDamage"
  | "singleClass"
  | "multiClass"
  | "textLine"
  | "otherProficiencies"
  | "armorProficiencies"
  | "attack"
  | "selectWeapon"
  | "hitDice"
  | "spellcastingClass"
  | "spell"
  | "selectSpell"
  | "limitedUseAbility"
  | "editSkills"
  | "race"
  | "speeds"
  | "senses"
  | "ammunition"
  | typeof Alignment
  | typeof StatKey;
export type FieldTypeInfo = Record<string, FieldTypeNode>;

export const EDITABLE_FIELD_OPTIONAL_DATA: Record<
  string,
  { title: string; hint?: string }
> = {
  pbOverride: {
    title: "Proficiency Bonus Override",
    hint: "For setting the proficiency bonus manually instead of using the standard table",
  },
  "stats.str": {
    title: "Strength",
    hint: "Your character's strength score, e.g. 16, not +3",
  },
  "stats.dex": {
    title: "Dexterity",
    hint: "Your character's dexterity score, e.g. 16, not +3",
  },
  "stats.con": {
    title: "Constitution",
    hint: "Your character's constitution score, e.g. 16, not +3",
  },
  "stats.int": {
    title: "Intelligence",
    hint: "Your character's intelligence score, e.g. 16, not +3",
  },
  "stats.wis": {
    title: "Wisdom",
    hint: "Your character's wisdom score, e.g. 16, not +3",
  },
  "stats.cha": {
    title: "Charisma",
    hint: "Your character's charisma score, e.g. 16, not +3",
  },
};

export const STANDARD_EDITABLE_FIELD_TYPES: FieldTypeInfo = {
  name: "string",
  class: "multiClass",
  background: "string",
  playerName: "string",
  race: "race",
  alignment: Alignment,
  exp: "number",
  stats: "number",
  inspiration: "number",
  pbOverride: "number",
  proficiencies: "boolean",
  otherProficiencies: "otherProficiencies",
  damageModifiers: "string",
  acFormula: "formula",
  initiativeFormula: "formula",
  passivePerception: "formula",
  speeds: "speeds",
  senses: "senses",
  maxHp: "formula",
  currHp: "number",
  tempHp: "number",
  totalHitDice: "hitDice",
  expendedHitDice: "number",
  exhaustion: "number",
  deathSaves: "number",
  coins: "number",
  equipment: "textLine",
  personality: "textLine",
  features: "textLine",
  attacks: "attack",
  ammunition: "ammunition",
  spellcastingClasses: "spellcastingClass",
  spells: "spell",
  spellSlots: "number",
  pactSlots: "number",
  limitedUseAbilities: "limitedUseAbility",
};

export enum Operation {
  ceil = "ceil",
  floor = "floor",
  subtraction = "subtraction",
  division = "division",
  addition = "addition",
  multiplication = "multiplication",
  minimum = "minimum",
  maximum = "maximum",
}

export enum DieOperation {
  "average" = "average",
  "average-roundedup" = "average-roundedup",
  "average-roundeddown" = "average-roundeddown",
  "roll" = "roll",
  "max" = "max",
}

// Standard recharge triggers for limited-use abilities. Stored as a plain
// string so unusual triggers (e.g. "Dawn", "Initiative") are accepted too —
// these are just the suggested presets. See `RechargeCriteria` in types.ts.
export enum RestType {
  shortRest = "Short Rest",
  longRest = "Long Rest",
}

export enum FIELD {
  name = "name",
  class = "class",
  background = "background",
  playerName = "playerName",
  race = "race",
  alignment = "alignment",
  exp = "exp",
  stats = "stats",
  inspiration = "inspiration",
  pbOverride = "pbOverride",
  proficiencies = "proficiencies",
  otherProficiencies = "otherProficiencies",
  damageModifiers = "damageModifiers",
  acFormula = "acFormula",
  initiativeFormula = "initiativeFormula",
  passivePerception = "passivePerception",
  speeds = "speeds",
  senses = "senses",
  maxHp = "maxHp",
  currHp = "currHp",
  tempHp = "tempHp",
  totalHitDice = "totalHitDice",
  expendedHitDice = "expendedHitDice",
  exhaustion = "exhaustion",
  deathSaves = "deathSaves",
  attacks = "attacks",
  ammunition = "ammunition",
  coins = "coins",
  equipment = "equipment",
  personality = "personality",
  features = "features",
  spellcastingClasses = "spellcastingClasses",
  spells = "spells",
  spellSlots = "spellSlots",
  pactSlots = "pactSlots",
  limitedUseAbilities = "limitedUseAbilities",
}

export const HIT_DICE: Record<OfficialClass, StandardDie> = {
  Artificer: StandardDie.d8,
  Barbarian: StandardDie.d12,
  Bard: StandardDie.d8,
  Cleric: StandardDie.d8,
  Druid: StandardDie.d8,
  Fighter: StandardDie.d10,
  Monk: StandardDie.d8,
  Paladin: StandardDie.d10,
  Ranger: StandardDie.d10,
  Rogue: StandardDie.d8,
  Sorcerer: StandardDie.d6,
  Warlock: StandardDie.d8,
  Wizard: StandardDie.d6,
};

export const SPELLCASTING_ABILITIES: { [key in OfficialClass]?: StatKey } = {
  Artificer: StatKey.int,
  Bard: StatKey.cha,
  Cleric: StatKey.wis,
  Druid: StatKey.wis,
  Fighter: StatKey.int,
  Paladin: StatKey.cha,
  Ranger: StatKey.wis,
  Rogue: StatKey.int,
  Sorcerer: StatKey.cha,
  Warlock: StatKey.cha,
  Wizard: StatKey.int,
};

// Well-known casting times get first-class treatment so that, in future, we can
// surface all of a character's actions/bonus actions/reactions at a glance. Any
// other casting time is stored as a free-form string.
export enum CastingTime {
  Action = "1 action",
  BonusAction = "1 bonus action",
  Reaction = "1 reaction",
}

// Spell levels are plain numbers: 0 = cantrip, 1–9 = leveled spell/slot levels.
// This matches `SpellMechanics.level` and `damageTable` keys, so there's a single
// representation across the model (the former "First"…"Ninth" word enum is gone).
export type SpellLevelNum = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LeveledSpellLevel = Exclude<SpellLevelNum, 0>;
export const LEVELED_SPELL_LEVELS: LeveledSpellLevel[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

// Human label for a spell level: cantrips read "Cantrip", leveled slots "1st"…
// (levels only ever run 1–9, so no teen-suffix special case is needed).
export function spellLevelLabel(level: number): string {
  if (level === 0) return "Cantrip";
  const suffix = ["th", "st", "nd", "rd"][level] ?? "th";
  return `${level}${suffix}`;
}

export enum ArmorType {
  Light = "Light Armor",
  Medium = "Medium Armor",
  Heavy = "Heavy Armor",
  Shields = "Shields",
}
