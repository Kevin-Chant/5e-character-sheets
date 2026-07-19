import { sum } from "lodash";
import {
  Character,
  ClassName,
  CoinAmounts,
  CustomFormula,
  DieDefinition,
  HitDice,
  IClass,
  isNonStandardDie,
  isOfficialClass,
  isStandardDie,
} from "src/lib/types";
import {
  CoinType,
  CoinValues,
  DamageType,
  DieOperation,
  FIELD,
  HIT_DICE,
  OfficialClass,
  Operation,
  SPELLCASTING_ABILITIES,
  SkillName,
  SpellLevel,
  StandardDie,
  StatKey,
} from "./data/data-definitions";

export const STAT_NAMES: Record<StatKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const DAMAGE_TYPES = Object.keys(DamageType);

export const SKILL_SOURCE_STATS: Record<SkillName, StatKey> = {
  Acrobatics: StatKey.dex,
  "Animal Handling": StatKey.wis,
  Arcana: StatKey.int,
  Athletics: StatKey.str,
  Deception: StatKey.cha,
  History: StatKey.int,
  Insight: StatKey.wis,
  Intimidation: StatKey.cha,
  Investigation: StatKey.int,
  Medicine: StatKey.wis,
  Nature: StatKey.int,
  Perception: StatKey.wis,
  Performance: StatKey.cha,
  Persuasion: StatKey.cha,
  Religion: StatKey.int,
  "Sleight of Hand": StatKey.dex,
  Stealth: StatKey.dex,
  Survival: StatKey.wis,
  "Thieves Tools": StatKey.dex,
};

export function modifier(stat: number) {
  return Math.floor((stat - 10) / 2);
}

export function getPB(character: Character) {
  // != null (not truthiness) so an explicit override of 0 is honored.
  if (character.pbOverride != null) {
    return character.pbOverride;
  } else {
    const totalLevel = sum(character.class.map((classDef) => classDef.level));
    return Math.floor((totalLevel - 1) / 4) + 2;
  }
}

export function averageDie(die: DieDefinition, rounder = Math.round) {
  let numFaces;
  if (isStandardDie(die)) {
    numFaces = parseInt(die.replace("d", ""));
  } else {
    numFaces = die.numFaces;
  }
  return rounder((numFaces + 1) / 2);
}

export function rollDie(die: DieDefinition) {
  if (isStandardDie(die)) return 1;
  if (isNonStandardDie(die)) return 2;
  throw new Error(
    "Tried to roll something that wasn't a die!" + JSON.stringify(die),
  );
}

export function getDieOperation(
  operation: DieOperation,
): (die: DieDefinition) => number {
  switch (operation) {
    case "average":
      return averageDie;
    case "average-roundedup":
      return (die) => averageDie(die, Math.ceil);
    case "average-roundeddown":
      return (die) => averageDie(die, Math.floor);
    case "roll":
      return rollDie;
    case "max":
      return (die: DieDefinition) =>
        isStandardDie(die) ? parseInt(die.replace("d", "")) : die.numFaces;
    default:
      throw new Error(
        "Reached unreachable code in getDieOperation due to" + operation,
      );
  }
}

export function totalGP(coins: CoinAmounts) {
  return sum(
    (Object.entries(coins) as Array<[CoinType, number]>).map(
      ([coin, numCoins]) => CoinValues[coin] * numCoins,
    ),
  );
}

export function levelInClass(className: ClassName, character: Character) {
  return character.class.find((klass) => klass.name === className)?.level || 0;
}

function getHitDie(className: ClassName): StandardDie {
  return isOfficialClass(className)
    ? HIT_DICE[className]
    : // TODO: Allow for homebrew classes to define hit dice
      StandardDie.d8;
}

export function getHitDice(character: Character): HitDice {
  const hitDice: HitDice = {};
  character.class.forEach(
    (klass) =>
      (hitDice[getHitDie(klass.name)] =
        (hitDice[getHitDie(klass.name)] || 0) + klass.level),
  );
  return hitDice;
}

export function getHpFormula(character: Character): CustomFormula {
  const firstClass = character.class[0];
  // A classless (e.g. freshly blank) character has no hit die to derive HP
  // from; fall back to 0 so the sheet still renders and the user can fill it in.
  if (!firstClass) return 0;
  const rest = character.class.slice(1);
  const firstClassHp = {
    operation: Operation.addition,
    operands: (
      [
        [1, getHitDie(firstClass.name), DieOperation.max],
        StatKey.con,
      ] as CustomFormula[]
    ).concat(
      firstClass.level > 1
        ? [
            {
              operation: Operation.multiplication,
              operands: [
                {
                  operation: Operation.addition,
                  operands: [
                    [
                      1,
                      getHitDie(firstClass.name),
                      DieOperation["average-roundedup"],
                    ],
                    StatKey.con,
                  ],
                },
                {
                  operation: Operation.subtraction,
                  operand1: firstClass.name,
                  operand2: 1,
                },
              ],
            },
          ]
        : [],
    ),
  } as CustomFormula;
  if (rest.length === 0) return firstClassHp;
  return {
    operation: Operation.addition,
    operands: [firstClassHp].concat(
      rest.map((classDef) => {
        return {
          operation: Operation.multiplication,
          operands: [
            classDef.name,
            {
              operation: Operation.addition,
              operands: [
                [
                  1,
                  getHitDie(classDef.name),
                  DieOperation["average-roundedup"],
                ],
                StatKey.con,
              ],
            },
          ],
        };
      }),
    ),
  };
}

export function getSpellcastingAbility(className: ClassName) {
  return isOfficialClass(className)
    ? SPELLCASTING_ABILITIES[className] || StatKey.int
    : StatKey.int;
}

// The ability a class actually casts with on this character: the character's
// per-class `abilityOverride` if set, else the class's 5e default. Used to
// resolve `spellMod` formula leaves live.
export function spellcastingAbilityFor(
  character: Character,
  className: ClassName,
): StatKey {
  const entry = character.spellcastingClasses.find(
    (c) => c.class === className,
  );
  return entry?.abilityOverride ?? getSpellcastingAbility(className);
}

const NUMERIC_SPELL_SLOT_LEVEL: Record<SpellLevel, number> = {
  [SpellLevel.First]: 1,
  [SpellLevel.Second]: 2,
  [SpellLevel.Third]: 3,
  [SpellLevel.Fourth]: 4,
  [SpellLevel.Fifth]: 5,
  [SpellLevel.Sixth]: 6,
  [SpellLevel.Seventh]: 7,
  [SpellLevel.Eighth]: 8,
  [SpellLevel.Ninth]: 9,
};

export function getNumericSpellSlotLevel(level: SpellLevel) {
  return NUMERIC_SPELL_SLOT_LEVEL[level];
}

export function getPactSlotInfo(character: Character) {
  const warlockLevel =
    character.class.find((klass) => klass.name === OfficialClass.Warlock)
      ?.level || 0;
  const total =
    warlockLevel < 2
      ? warlockLevel
      : warlockLevel < 11
        ? 2
        : warlockLevel < 17
          ? 3
          : 4;
  const level = Math.min(5, Math.floor((warlockLevel + 1) / 2));
  return {
    level: level,
    total: total,
  };
}

// Multiclass spellcaster slot table (PHB p.165): outer index is the combined
// caster level 1-20, inner array gives slots for spell levels 1-9.
const SPELL_SLOTS_BY_CASTER_LEVEL: number[][] = [
  [], // index 0 — no caster levels, no slots
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function getSpellSlotsByLevelAndSpellcasterLevel(
  slotLevel: SpellLevel,
  spellcastingLevel: number,
) {
  const row =
    SPELL_SLOTS_BY_CASTER_LEVEL[Math.min(Math.max(spellcastingLevel, 0), 20)];
  return row[getNumericSpellSlotLevel(slotLevel) - 1] ?? 0;
}

/**
 * Single source of truth for a class entry's spellcasting. `isSpellcaster` marks
 * whether it should appear in the spellcasting class list; `spellcasterLevel` is
 * its share of the multiclass caster level used to size shared slots. The two
 * differ for Warlocks — they cast via pact magic and so are spellcasters but
 * contribute nothing to the shared slot pool. Eldritch Knights and Arcane
 * Tricksters only cast with their respective subclass.
 */
function casterContribution(klass: IClass): {
  isSpellcaster: boolean;
  spellcasterLevel: number;
} {
  if (!isOfficialClass(klass.name))
    return { isSpellcaster: false, spellcasterLevel: 0 };
  switch (klass.name) {
    case OfficialClass.Bard:
    case OfficialClass.Cleric:
    case OfficialClass.Druid:
    case OfficialClass.Sorcerer:
    case OfficialClass.Wizard:
      return { isSpellcaster: true, spellcasterLevel: klass.level };
    case OfficialClass.Paladin:
    case OfficialClass.Ranger:
      return {
        isSpellcaster: true,
        spellcasterLevel: Math.floor(klass.level / 2),
      };
    case OfficialClass.Artificer:
      return {
        isSpellcaster: true,
        spellcasterLevel: Math.ceil(klass.level / 2),
      };
    case OfficialClass.Warlock:
      return { isSpellcaster: true, spellcasterLevel: 0 };
    case OfficialClass.Fighter:
      return klass.subclass === "Eldritch Knight"
        ? { isSpellcaster: true, spellcasterLevel: Math.floor(klass.level / 3) }
        : { isSpellcaster: false, spellcasterLevel: 0 };
    case OfficialClass.Rogue:
      return klass.subclass === "Arcane Trickster"
        ? { isSpellcaster: true, spellcasterLevel: Math.floor(klass.level / 3) }
        : { isSpellcaster: false, spellcasterLevel: 0 };
    default:
      return { isSpellcaster: false, spellcasterLevel: 0 };
  }
}

export function calculateSpellcasterLevel(character: Character) {
  return character.class.reduce(
    (sum, klass) => sum + casterContribution(klass).spellcasterLevel,
    0,
  );
}

export function isSpellcastingClass(klass: IClass): boolean {
  return casterContribution(klass).isSpellcaster;
}

export function getDefaultSpellSlots(
  character: Character,
  slotLevel: SpellLevel,
): number {
  return getSpellSlotsByLevelAndSpellcasterLevel(
    slotLevel,
    calculateSpellcasterLevel(character),
  );
}

// Unspent standard slots at a level (total, respecting any override, minus
// expended). Used to offer only castable levels in the roll dialog.
export function availableSpellSlots(
  character: Character,
  slotLevel: SpellLevel,
): number {
  const total =
    character.spellSlots[slotLevel]?.totalOverride ??
    getDefaultSpellSlots(character, slotLevel);
  const expended = character.spellSlots[slotLevel]?.expended ?? 0;
  return Math.max(0, total - expended);
}

// Classes that prepare spells daily from their full list (vs. known casters with
// a fixed repertoire). Only these show the "prepared" toggle on a spell.
const PREPARED_CASTER_CLASSES = new Set<OfficialClass>([
  OfficialClass.Artificer,
  OfficialClass.Cleric,
  OfficialClass.Druid,
  OfficialClass.Paladin,
  OfficialClass.Wizard,
]);

export function isPreparedCaster(className: ClassName): boolean {
  return isOfficialClass(className) && PREPARED_CASTER_CLASSES.has(className);
}

// The character's spellcasting classes that are official 5e classes (so their
// SRD spell lists are known). Custom classes are omitted — callers treat an
// empty result as "don't restrict".
export function officialSpellcastingClasses(
  character: Character,
): OfficialClass[] {
  return character.spellcastingClasses
    .map((c) => c.class)
    .filter(isOfficialClass);
}

export const OPTIONAL_FIELD_INITIALIZERS: {
  [key in FIELD]?: (
    character: Character,
    subField?: string,
  ) => CustomFormula | undefined;
} = {
  pbOverride: getPB,
  maxHp: getHpFormula,
  initiativeFormula: () => StatKey.dex,
  expendedHitDice: () => 0,
  exp: () => 0,
  coins: () => 0,
  spellcastingClasses: (character, subField) => {
    if (!subField)
      throw new Error(
        "cannot get optional info for spellcastingClasses without a subField",
      );
    const [index, subSubField] = subField.split(".");
    if (subSubField === "abilityOverride") {
      return getSpellcastingAbility(
        character.spellcastingClasses[parseInt(index)].class,
      );
    }
    if (subSubField === "saveDcOverride") {
      return {
        operation: Operation.addition,
        operands: [
          8,
          "proficiencyBonus",
          character.spellcastingClasses[parseInt(index)].abilityOverride ||
            getSpellcastingAbility(
              character.spellcastingClasses[parseInt(index)].class,
            ),
        ],
      };
    } else if (subSubField === "attackBonusOverride") {
      return {
        operation: Operation.addition,
        operands: [
          "proficiencyBonus",
          character.spellcastingClasses[parseInt(index)].abilityOverride ||
            getSpellcastingAbility(
              character.spellcastingClasses[parseInt(index)].class,
            ),
        ],
      };
    }
    return undefined;
  },
  spellSlots: (character, subField) =>
    subField?.split(".")[1] === "totalOverride"
      ? getDefaultSpellSlots(character, subField?.split(".")[0] as SpellLevel)
      : undefined,
  pactSlots: (character, subField) =>
    subField === "totalOverride"
      ? getPactSlotInfo(character).total
      : subField === "levelOverride"
        ? getPactSlotInfo(character).level
        : undefined,
};

// Boundary over OPTIONAL_FIELD_INITIALIZERS: the seeded default (if any) for the
// value at `field`+`subField`. Callers pass the field/subField pair (typically
// from a cursor's `.root()`/`.subpath()`) and no longer hand-index the map or
// know its per-field subField shapes — those stay encapsulated in the entries
// above (which still parse subField internally).
export function getOptionalInitializer(
  field: FIELD | undefined,
  subField: string | undefined,
  character: Character,
): CustomFormula | undefined {
  if (!field) return undefined;
  return OPTIONAL_FIELD_INITIALIZERS[field]?.(character, subField);
}

// The static preset/option-list data used to live in this file; it moved to
// src/lib/data/ (this file is for rules logic). Re-exported here so existing
// imports keep working.
export {
  buildAttackFromPreset,
  DEFAULT_CUSTOM_ATTACK,
  DEFAULT_WEAPONS,
  WEAPON_PRESETS,
} from "./data/weapon-presets";
export type { WeaponAbility, WeaponPreset } from "./data/weapon-presets";
export {
  DEFAULT_BACKGROUNDS,
  DEFAULT_LANGUAGES,
  DEFAULT_RACES,
  DEFAULT_SPELL_DURATIONS,
  DEFAULT_SPELL_RANGES,
} from "./data/option-lists";
