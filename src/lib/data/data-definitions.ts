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

// Shared by Dragonborn and sorcerer Draconic Bloodline. Keyed by the label
// the wizard stores (color + type).
export interface DraconicAncestryInfo {
  damage: DamageType;
  breath: "line" | "cone";
  save: StatKey.dex | StatKey.con;
}

export const DRACONIC_ANCESTRIES: Record<string, DraconicAncestryInfo> = {
  "Black (acid)": {
    damage: DamageType.Acid,
    breath: "line",
    save: StatKey.dex,
  },
  "Blue (lightning)": {
    damage: DamageType.Lightning,
    breath: "line",
    save: StatKey.dex,
  },
  "Brass (fire)": {
    damage: DamageType.Fire,
    breath: "line",
    save: StatKey.dex,
  },
  "Bronze (lightning)": {
    damage: DamageType.Lightning,
    breath: "line",
    save: StatKey.dex,
  },
  "Copper (acid)": {
    damage: DamageType.Acid,
    breath: "line",
    save: StatKey.dex,
  },
  "Gold (fire)": { damage: DamageType.Fire, breath: "cone", save: StatKey.dex },
  "Green (poison)": {
    damage: DamageType.Poison,
    breath: "cone",
    save: StatKey.con,
  },
  "Red (fire)": { damage: DamageType.Fire, breath: "cone", save: StatKey.dex },
  "Silver (cold)": {
    damage: DamageType.Cold,
    breath: "cone",
    save: StatKey.con,
  },
  "White (cold)": {
    damage: DamageType.Cold,
    breath: "cone",
    save: StatKey.con,
  },
};

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

// No class or creature in 5e has a d20 hit die, so hit-dice pools are keyed
// on this rather than on the full die list.
export type HitDie = Exclude<StandardDie, StandardDie.d20>;

export const HIT_DIE_SIZES: HitDie[] = [
  StandardDie.d4,
  StandardDie.d6,
  StandardDie.d8,
  StandardDie.d10,
  StandardDie.d12,
];

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
  // 5e's own term for a creature that doesn't hold one. Last so the nine
  // stay in their grid order.
  "Unaligned" = "Unaligned",
}

// Runtime type of a field, so the edit modal can pick the right input.
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
  | "equipment"
  | "chosenOptions"
  | typeof Alignment
  | typeof StatKey;
export type FieldTypeInfo = Record<string, FieldTypeNode>;

export const EDITABLE_FIELD_OPTIONAL_DATA: Record<
  string,
  { title: string; hint?: string }
> = {
  // Without an entry, a field's modal title is `humanize()`d from its key
  // (e.g. "Curr Hp"). Add an entry here when that doesn't read as a player
  // would expect; prefer the paper sheet's own wording.
  name: { title: "Character Name" },
  exp: { title: "Experience Points" },
  maxHp: { title: "Hit Point Maximum" },
  currHp: { title: "Current Hit Points" },
  tempHp: { title: "Temporary Hit Points" },
  expendedHitDice: { title: "Hit Dice Expended" },
  pbOverride: {
    title: "Proficiency Bonus Override",
    hint: "For setting the proficiency bonus manually instead of using the standard table",
  },
  attunementSlots: {
    title: "Attunement Slots",
    hint: "How many items you can be attuned to at once. Defaults to 3; raise it for Artificer's Magic Item Adept/Savant/Master (4/5/6).",
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
  equipment: "equipment",
  attunementSlots: "formula",
  personality: "textLine",
  features: "textLine",
  attacks: "attack",
  ammunition: "ammunition",
  spellcastingClasses: "spellcastingClass",
  spells: "spell",
  spellSlots: "number",
  pactSlots: "number",
  limitedUseAbilities: "limitedUseAbility",
  chosenOptions: "chosenOptions",
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

// Suggested presets; `RechargeCriteria` (types.ts) stores a plain string so
// unusual triggers (e.g. "Dawn", "Initiative") are still accepted.
export enum RestType {
  shortRest = "Short Rest",
  longRest = "Long Rest",
}

// `SkillName` also carries "Thieves Tools" as a pseudo-skill; use this list
// (not the raw enum) anywhere offering "pick a skill".
export const REAL_SKILLS = Object.values(SkillName).filter(
  (s) => s !== SkillName["Thieves Tools"],
) as SkillName[];

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
  attunementSlots = "attunementSlots",
  personality = "personality",
  features = "features",
  spellcastingClasses = "spellcastingClasses",
  spells = "spells",
  spellSlots = "spellSlots",
  pactSlots = "pactSlots",
  limitedUseAbilities = "limitedUseAbilities",
  chosenOptions = "chosenOptions",
  playSessions = "playSessions",
}

export const HIT_DICE: Record<OfficialClass, HitDie> = {
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

// Any other casting time is stored as a free-form string.
export enum CastingTime {
  Action = "1 action",
  BonusAction = "1 bonus action",
  Reaction = "1 reaction",
}

// `Spell.school` stores this as `MagicSchool | string` so homebrew traditions
// aren't boxed out.
export enum MagicSchool {
  Abjuration = "Abjuration",
  Conjuration = "Conjuration",
  Divination = "Divination",
  Enchantment = "Enchantment",
  Evocation = "Evocation",
  Illusion = "Illusion",
  Necromancy = "Necromancy",
  Transmutation = "Transmutation",
}

export const MAGIC_SCHOOLS = Object.values(MagicSchool);

// 0 = cantrip, 1-9 = leveled spell/slot levels; matches `SpellMechanics.level`
// and `damageTable` keys.
export type SpellLevelNum = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LeveledSpellLevel = Exclude<SpellLevelNum, 0>;
export const LEVELED_SPELL_LEVELS: LeveledSpellLevel[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

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

// The three wearable armor tiers (unlike `ArmorType`, which also covers Shields).
export type ArmorCategory = "light" | "medium" | "heavy";

// How armor lets DEX modify AC. Decoupled from `ArmorCategory` so an armor
// that breaks its tier's default is expressible; "capped" pairs with
// `ArmorMechanics.dexCap` (2 for standard medium armor).
export type ArmorDexContribution = "full" | "capped" | "none";
