import { sum } from "lodash";
import { UUID } from "crypto";
import {
  Character,
  ClassName,
  CoinAmounts,
  ArmorMechanics,
  CustomFormula,
  DieDefinition,
  EquipmentItem,
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
  PB,
  SPELLCASTING_ABILITIES,
  SkillName,
  LeveledSpellLevel,
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

// Class-identity resolution by stable id (the form spells / spellcasting entries
// / `spellMod` / `classLevel` leaves reference).
export function classById(character: Character, id: UUID): IClass | undefined {
  return character.class.find((klass) => klass.id === id);
}
export function classNameForId(
  character: Character,
  id: UUID,
): ClassName | undefined {
  return classById(character, id)?.name;
}
export function levelOfClassId(character: Character, id: UUID): number {
  return classById(character, id)?.level ?? 0;
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

// Unspent hit dice of one size (total, respecting any override, minus
// expended). Gates the spend-a-hit-die flow in the roll dialog.
export function remainingHitDice(
  character: Character,
  die: StandardDie,
): number {
  const total = (character.totalHitDice || getHitDice(character))[die] || 0;
  return Math.max(0, total - (character.expendedHitDice[die] || 0));
}

// Jack of All Trades applies half proficiency to non-proficient ability checks:
// Bard level 2+, or the manual override.
export function hasJackOfAllTrades(character: Character): boolean {
  const bardLevel =
    character.class.find((klass) => klass.name === "Bard")?.level || 0;
  return bardLevel > 1 || character.proficiencies.isJackOfAllTradesOverride;
}

// The default Passive Perception formula: 10 + WIS modifier + the proficiency
// contribution for Perception (expertise / proficiency / Jack of All Trades) +
// any per-skill Perception bonus. Seeds the editable `passivePerception`
// override so a player can tweak it (e.g. Observant's passive-only +5) starting
// from the computed value.
export function getPassivePerceptionFormula(
  character: Character,
): CustomFormula {
  const proficient = !!character.proficiencies.skills.Perception;
  const expert = !!character.proficiencies.expertise.Perception;
  const bonus = character.proficiencies.skillBonuses.Perception;
  const operands: CustomFormula[] = [10, StatKey.wis];
  // Proficiency contribution as a PB-referencing formula (not a frozen number),
  // so a saved override keeps scaling with level: PB when proficient, 2×PB with
  // expertise, and floor(PB/2) for Jack of All Trades.
  if (expert) {
    operands.push({ operation: Operation.multiplication, operands: [2, PB] });
  } else if (proficient) {
    operands.push(PB);
  } else if (hasJackOfAllTrades(character)) {
    operands.push({
      operation: Operation.floor,
      operand1: { operation: Operation.division, operand1: PB, operand2: 2 },
    });
  }
  if (bonus !== undefined) operands.push(bonus);
  return { operation: Operation.addition, operands };
}

// ---------------------------------------------------------------------------
// Inventory: attunement + encumbrance
// ---------------------------------------------------------------------------

// The standard number of attunement slots. Overridable per-character via the
// `attunementSlots` formula (e.g. Artificer's 4/5/6); this seeds that override.
export const DEFAULT_ATTUNEMENT_SLOTS = 3;

// How many items the character is currently attuned to (counts against the cap).
export function countAttunedItems(equipment: EquipmentItem[]): number {
  return equipment.filter((item) => item.attunement?.attuned).length;
}

// Whether an item can be worn/wielded, and so should show an equip toggle. Armor
// and shields are inherently equippable (they only affect AC while equipped);
// anything else opts in via the `equippable` flag.
export function isEquippable(item: EquipmentItem): boolean {
  return !!item.equippable || !!item.armor || !!item.shield;
}

// Total carried weight in POUNDS: Σ per-unit weight × quantity. Items without a
// weight contribute nothing. Kept in lb because 5e carrying capacity is in lb;
// display converts to kg when the `weightUnit` setting asks for it.
export function totalEquipmentWeightLb(equipment: EquipmentItem[]): number {
  return sum(
    equipment.map((item) => (item.weight ?? 0) * (item.quantity ?? 1)),
  );
}

// 5e carrying capacity is STR × 15 lb; the optional variant encumbrance
// thresholds are STR × 5 (encumbered) and STR × 10 (heavily encumbered).
export function carryingCapacityLb(strScore: number): number {
  return strScore * 15;
}
export function encumberedThresholdLb(strScore: number): number {
  return strScore * 5;
}
export function heavilyEncumberedThresholdLb(strScore: number): number {
  return strScore * 10;
}

// Pounds → kilograms. Weights are always stored in lb; this is display-only.
export const LB_PER_KG = 2.2046226218;
export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

// Round a lb weight to the chosen unit for display in an editable input (2 dp),
// so a kg-unit user reads/edits kilograms even though pounds are what's stored.
export function weightInUnit(lb: number, unit: "lb" | "kg"): number {
  const value = unit === "kg" ? lbToKg(lb) : lb;
  return Math.round(value * 100) / 100;
}
// Inverse of `weightInUnit`: the value typed in the chosen unit → stored pounds.
export function weightToLb(value: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? kgToLb(value) : value;
}

// Render a lb-denominated weight in the chosen unit, trimming trailing zeros.
export function formatWeight(lb: number, unit: "lb" | "kg"): string {
  const value = unit === "kg" ? lbToKg(lb) : lb;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded} ${unit}`;
}

// DEX contribution to AC for one armor, per its explicit `dex` mode: full DEX,
// DEX capped at `dexCap` (2 by default — standard medium armor), or none (heavy).
function armorDexBonus(armor: ArmorMechanics, dexMod: number): number {
  switch (armor.dex) {
    case "none":
      return 0;
    case "capped":
      return Math.min(dexMod, armor.dexCap ?? 2);
    default:
      return dexMod;
  }
}

// AC from the character's *equipped* armor and shields — the value behind the
// `equippedArmor` formula leaf. Body armor sets the base (best AC wins if more
// than one is somehow equipped); with none equipped it falls back to the
// unarmored 10 + DEX. Every equipped shield's bonus is added on top. Custom
// cases (unarmored defense, magic bonuses, cover) stay expressible because the
// caller's `acFormula` merely *references* this leaf.
export function equippedArmorAC(character: Character): number {
  const equipped = character.equipment.filter((i) => i.equipped);
  const dexMod = modifier(character.stats[StatKey.dex]);
  const armorValues = equipped
    .filter((i) => i.armor)
    .map((i) => i.armor!.base + armorDexBonus(i.armor!, dexMod));
  const shieldBonus = sum(
    equipped.filter((i) => i.shield).map((i) => i.shield!.bonus),
  );
  const base = armorValues.length ? Math.max(...armorValues) : 10 + dexMod;
  return base + shieldBonus;
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
                  operand1: { classLevel: firstClass.id },
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
            { classLevel: classDef.id },
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
  classId: UUID,
): StatKey {
  const entry = character.spellcastingClasses.find(
    (c) => c.classId === classId,
  );
  return (
    entry?.abilityOverride ??
    getSpellcastingAbility(classNameForId(character, classId) ?? "")
  );
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
  slotLevel: LeveledSpellLevel,
  spellcastingLevel: number,
) {
  const row =
    SPELL_SLOTS_BY_CASTER_LEVEL[Math.min(Math.max(spellcastingLevel, 0), 20)];
  return row[slotLevel - 1] ?? 0;
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
  slotLevel: LeveledSpellLevel,
): number {
  return getSpellSlotsByLevelAndSpellcasterLevel(
    slotLevel,
    calculateSpellcasterLevel(character),
  );
}

// The highest spell level a class entry can learn/prepare **as if
// single-classed** at its own level — the RAW gate for spells known/prepared
// (PHB multiclassing: each class determines its spells individually, even
// though *slots* pool). Half-casters use ceil(level/2) as their effective
// caster level (a single-classed paladin 9 has 3rd-level slots), warlocks
// their pact-slot level, subclass third-casters ceil(level/3) from their
// subclass level.
export function maxSpellLevelForClass(klass: IClass): number {
  const highestSlot = (casterLevel: number): number => {
    for (let sl = 9; sl >= 1; sl--)
      if (
        getSpellSlotsByLevelAndSpellcasterLevel(
          sl as LeveledSpellLevel,
          casterLevel,
        ) > 0
      )
        return sl;
    return 0;
  };
  if (!isOfficialClass(klass.name)) return 0;
  switch (klass.name) {
    case OfficialClass.Bard:
    case OfficialClass.Cleric:
    case OfficialClass.Druid:
    case OfficialClass.Sorcerer:
    case OfficialClass.Wizard:
      return highestSlot(klass.level);
    case OfficialClass.Paladin:
    case OfficialClass.Ranger:
      return klass.level < 2 ? 0 : highestSlot(Math.ceil(klass.level / 2));
    case OfficialClass.Artificer:
      return highestSlot(Math.ceil(klass.level / 2));
    case OfficialClass.Warlock:
      return Math.min(5, Math.ceil(klass.level / 2));
    case OfficialClass.Fighter:
      return klass.subclass === "Eldritch Knight"
        ? klass.level < 3
          ? 0
          : highestSlot(Math.ceil(klass.level / 3))
        : 0;
    case OfficialClass.Rogue:
      return klass.subclass === "Arcane Trickster"
        ? klass.level < 3
          ? 0
          : highestSlot(Math.ceil(klass.level / 3))
        : 0;
    default:
      return 0;
  }
}

// Unspent standard slots at a level (total, respecting any override, minus
// expended). Used to offer only castable levels in the roll dialog.
export function availableSpellSlots(
  character: Character,
  slotLevel: LeveledSpellLevel,
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
    .map((c) => classNameForId(character, c.classId))
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
  passivePerception: getPassivePerceptionFormula,
  attunementSlots: () => DEFAULT_ATTUNEMENT_SLOTS,
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
        classNameForId(
          character,
          character.spellcastingClasses[parseInt(index)].classId,
        ) ?? "",
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
              classNameForId(
                character,
                character.spellcastingClasses[parseInt(index)].classId,
              ) ?? "",
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
              classNameForId(
                character,
                character.spellcastingClasses[parseInt(index)].classId,
              ) ?? "",
            ),
        ],
      };
    }
    return undefined;
  },
  spellSlots: (character, subField) =>
    subField?.split(".")[1] === "totalOverride"
      ? getDefaultSpellSlots(
          character,
          Number(subField?.split(".")[0]) as LeveledSpellLevel,
        )
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
  DEFAULT_DAMAGE_TYPES,
  DEFAULT_LANGUAGES,
  DEFAULT_RACES,
  DEFAULT_SPELL_DURATIONS,
  DEFAULT_SPELL_RANGES,
} from "./data/option-lists";
