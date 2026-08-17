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
  HitDie,
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

// The 5e ceiling on an ability score: 20, "unless a feature says otherwise".
export const DEFAULT_STAT_CAP = 20;

// Exhaustion runs 1–6; level 6 is death, so it's the top of the track.
export const MAX_EXHAUSTION = 6;

// Features that raise a score's ceiling above 20, keyed by the bare feature
// title the builder grants. E.g. Primal Champion raises STR/CON to 24.
const RAISED_CAPS: { feature: string; stats: StatKey[]; cap: number }[] = [
  { feature: "Primal Champion", stats: [StatKey.str, StatKey.con], cap: 24 },
];

export function statCapFor(character: Character, stat: StatKey): number {
  const titles = new Set(character.features.map((f) => f.title.trim()));
  let cap = DEFAULT_STAT_CAP;
  for (const raised of RAISED_CAPS)
    if (raised.stats.includes(stat) && titles.has(raised.feature))
      cap = Math.max(cap, raised.cap);
  return cap;
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

// How many faces a die has, whether it's a standard "d8" or a custom shape.
export function dieFaces(die: DieDefinition): number {
  return isStandardDie(die) ? parseInt(die.replace("d", "")) : die.numFaces;
}

export function averageDie(die: DieDefinition, rounder = Math.round) {
  return rounder((dieFaces(die) + 1) / 2);
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

// Class-identity resolution by stable id, as spells/spellcasting entries/
// `spellMod`/`classLevel` leaves reference it.
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

function getHitDie(className: ClassName): HitDie {
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
export function remainingHitDice(character: Character, die: HitDie): number {
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

// Default Passive Perception formula: 10 + WIS mod + proficiency contribution
// (expertise/proficiency/Jack of All Trades) + any per-skill bonus. Seeds the
// editable `passivePerception` override.
export function getPassivePerceptionFormula(
  character: Character,
): CustomFormula {
  const proficient = !!character.proficiencies.skills.Perception;
  const expert = !!character.proficiencies.expertise.Perception;
  const bonus = character.proficiencies.skillBonuses.Perception;
  const operands: CustomFormula[] = [10, StatKey.wis];
  // A PB-referencing formula, not a frozen number, so a saved override keeps
  // scaling with level.
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

// Standard number of attunement slots. Overridable per-character via the
// `attunementSlots` formula (e.g. Artificer's 4/5/6); this seeds that override.
export const DEFAULT_ATTUNEMENT_SLOTS = 3;

// How many items the character is currently attuned to (counts against the cap).
export function countAttunedItems(equipment: EquipmentItem[]): number {
  return equipment.filter((item) => item.attunement?.attuned).length;
}

// Whether an item can be worn/wielded and so shows an equip toggle. Armor,
// shields and weapons are inherently equippable; anything else opts in via
// the `equippable` flag.
export function isEquippable(item: EquipmentItem): boolean {
  return !!item.equippable || !!item.armor || !!item.shield || !!item.weapon;
}

// Whether an item's granted ability (`EquipmentItem.ability`) is in play right
// now: attuned when attunement is required, equipped when equippable — an
// item with neither gate grants its ability just by being carried. Callers
// pass a patched item to ask "would it be active if …".
export function itemAbilityActive(item: EquipmentItem): boolean {
  if (!item.ability) return false;
  if (item.attunement && !item.attunement.attuned) return false;
  if (isEquippable(item) && !item.equipped) return false;
  return true;
}

// Total carried weight in lb: Σ per-unit weight × quantity. 5e carrying
// capacity is defined in lb; display converts to kg when requested.
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

// Round a lb weight to the chosen unit for an editable input (2 dp), so a
// kg-unit user reads/edits kilograms even though pounds are stored.
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

// AC from the character's equipped armor and shields — the `equippedArmor`
// formula leaf. Body armor sets the base (best AC wins if several equipped);
// none equipped falls back to unarmored 10 + DEX. Shield bonuses add on top.
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
  // A classless character has no hit die to derive HP from.
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

// Rolled hit points. `getHpFormula` derives max HP from the class list using
// average dice, rebuilt from scratch on every level-up — so a rolled result
// only survives as a flat term on top. `hpAdjustmentOf` reads back that term
// (shape is always `getHpFormula(...) + <number>`); `withHpAdjustment` re-applies it.

export function hpAdjustmentOf(formula: CustomFormula | undefined): number {
  if (
    typeof formula === "object" &&
    formula !== null &&
    "operation" in formula &&
    formula.operation === Operation.addition &&
    Array.isArray(formula.operands) &&
    formula.operands.length === 2 &&
    typeof formula.operands[1] === "number"
  )
    return formula.operands[1];
  return 0;
}

export function withHpAdjustment(
  base: CustomFormula,
  adjustment: number,
): CustomFormula {
  if (adjustment === 0) return base;
  return { operation: Operation.addition, operands: [base, adjustment] };
}

// Standard 5e save DC: 8 + proficiency bonus + governing ability modifier.
// Kept as a formula, not a computed number, so it re-derives on a level-up.
//
// `stat` may be a list when the rule lets the player choose (a Battle
// Master's maneuver DC is "STR or DEX"); the best of them is used.
export function saveDcFormula(stat: StatKey | StatKey[]): CustomFormula {
  const ability: CustomFormula = Array.isArray(stat)
    ? { operation: Operation.maximum, operands: stat }
    : stat;
  return {
    operation: Operation.addition,
    operands: [8, "proficiencyBonus", ability],
  };
}

export function getSpellcastingAbility(className: ClassName) {
  return isOfficialClass(className)
    ? SPELLCASTING_ABILITIES[className] || StatKey.int
    : StatKey.int;
}

// The ability a class actually casts with: per-class `abilityOverride` if
// set, else the class's 5e default. Resolves `spellMod` formula leaves live.
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
 * Single source of truth for a class entry's spellcasting. `isSpellcaster`
 * marks whether it appears in the spellcasting class list; `spellcasterLevel`
 * is its share of the multiclass caster level for sizing shared slots.
 * Warlocks are spellcasters via pact magic but contribute nothing to the
 * shared slot pool. Eldritch Knights and Arcane Tricksters only cast via
 * their subclass.
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

// A single spellcasting class draws slots from its own class table, where
// half/third-casters round their effective caster level UP (a single-classed
// paladin 5 has caster level 3, ceil(5/2)) — mirrors `maxSpellLevelForClass`'s
// rounding so "can prepare" and "has a slot to cast it" agree.
function singleClassCasterLevel(klass: IClass): number {
  if (!isOfficialClass(klass.name)) return 0;
  switch (klass.name) {
    case OfficialClass.Bard:
    case OfficialClass.Cleric:
    case OfficialClass.Druid:
    case OfficialClass.Sorcerer:
    case OfficialClass.Wizard:
      return klass.level;
    case OfficialClass.Paladin:
    case OfficialClass.Ranger:
      return klass.level < 2 ? 0 : Math.ceil(klass.level / 2);
    case OfficialClass.Artificer:
      return Math.ceil(klass.level / 2);
    case OfficialClass.Fighter:
      return klass.subclass === "Eldritch Knight" && klass.level >= 3
        ? Math.ceil(klass.level / 3)
        : 0;
    case OfficialClass.Rogue:
      return klass.subclass === "Arcane Trickster" && klass.level >= 3
        ? Math.ceil(klass.level / 3)
        : 0;
    case OfficialClass.Warlock:
      return 0; // pact slots are separate; contributes nothing to this table
    default:
      return 0;
  }
}

// Combined caster level for sizing the shared (non-pact) slot pool. PHB
// p.164: a single spellcasting class uses its own table (round up); only
// multiclassing sums the rounded-down contributions on the Multiclass table.
export function calculateSpellcasterLevel(character: Character) {
  const casters = character.class.filter(
    (klass) => casterContribution(klass).isSpellcaster,
  );
  if (casters.length === 1) return singleClassCasterLevel(casters[0]);
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

// Highest spell level a class entry can learn/prepare as if single-classed at
// its own level — the RAW gate for spells known/prepared (PHB multiclassing:
// each class determines its spells individually even though slots pool).
// Half-casters use ceil(level/2), warlocks their pact-slot level, subclass
// third-casters ceil(level/3) from subclass level.
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

// Total slots at a level: the override if set, else the derived table value.
export function totalSpellSlots(
  character: Character,
  slotLevel: LeveledSpellLevel,
): number {
  return (
    character.spellSlots[slotLevel]?.totalOverride ??
    getDefaultSpellSlots(character, slotLevel)
  );
}

// Slots spent at a level, clamped to the total. The stored `expended` can
// legitimately exceed it — spend slots, then lower the override or lose the
// granting class level. Clamping on read keeps the value honest without a
// migration, and it recovers if the total goes back up.
export function expendedSpellSlots(
  character: Character,
  slotLevel: LeveledSpellLevel,
): number {
  const expended = character.spellSlots[slotLevel]?.expended ?? 0;
  return Math.min(Math.max(0, expended), totalSpellSlots(character, slotLevel));
}

// The pact-slot mirror of `expendedSpellSlots`, clamped for the same reason:
// lowering the override (or losing warlock levels) after spending leaves a
// stored count above the total.
export function expendedPactSlots(character: Character): number {
  const total =
    character.pactSlots?.totalOverride ?? getPactSlotInfo(character).total;
  return Math.min(Math.max(0, character.pactSlots?.expended ?? 0), total);
}

export function availableSpellSlots(
  character: Character,
  slotLevel: LeveledSpellLevel,
): number {
  return (
    totalSpellSlots(character, slotLevel) -
    expendedSpellSlots(character, slotLevel)
  );
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

// How much of its class level a prepared caster counts toward the allowance.
// Full casters use the whole level; half-casters use half — rounded down for
// paladin, up for artificer (PHB vs. Tasha's, not a typo).
const PREPARED_LEVEL_DIVISOR: Partial<
  Record<OfficialClass, (level: number) => number>
> = {
  [OfficialClass.Cleric]: (l) => l,
  [OfficialClass.Druid]: (l) => l,
  [OfficialClass.Wizard]: (l) => l,
  [OfficialClass.Paladin]: (l) => Math.floor(l / 2),
  [OfficialClass.Artificer]: (l) => Math.ceil(l / 2),
};

/**
 * How many spells this class can have prepared: spellcasting modifier plus
 * some fraction of level, minimum 1. Null for a class with a fixed repertoire.
 * Does not model always-prepared domain/oath/circle spells — the sheet has no
 * "always prepared" flag, so the count reflects boxes actually ticked.
 */
export function preparedSpellCount(
  character: Character,
  klass: IClass,
): number | null {
  if (!isPreparedCaster(klass.name)) return null;
  const oc = isOfficialClass(klass.name) ? klass.name : undefined;
  const fromLevel = oc && PREPARED_LEVEL_DIVISOR[oc];
  if (!fromLevel) return null;
  const ability = spellcastingAbilityFor(character, klass.id);
  return Math.max(
    1,
    modifier(character.stats[ability]) + fromLevel(klass.level),
  );
}

// Spells currently ticked as prepared for a class, across every leveled bucket
// (cantrips are always available and never counted).
export function preparedSpellsFor(character: Character, classId: UUID): number {
  return Object.entries(character.spells)
    .filter(([bucket]) => Number(bucket) > 0)
    .reduce(
      (n, [, list]) =>
        n +
        (list ?? []).filter(
          (s) => s.prepared && s.spellcastingClass === classId,
        ).length,
      0,
    );
}

// The character's spellcasting classes that are official 5e classes (known
// catalog spell lists). Custom classes are omitted; callers treat an empty
// result as "don't restrict".
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
      return saveDcFormula(
        character.spellcastingClasses[parseInt(index)].abilityOverride ||
          getSpellcastingAbility(
            classNameForId(
              character,
              character.spellcastingClasses[parseInt(index)].classId,
            ) ?? "",
          ),
      );
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

// Boundary over OPTIONAL_FIELD_INITIALIZERS: the seeded default (if any) for
// the value at `field`+`subField`, keeping per-field subField shapes
// encapsulated in the entries above.
export function getOptionalInitializer(
  field: FIELD | undefined,
  subField: string | undefined,
  character: Character,
): CustomFormula | undefined {
  if (!field) return undefined;
  return OPTIONAL_FIELD_INITIALIZERS[field]?.(character, subField);
}

// The verdict on a death save, and the pips it leaves behind. Nat 1 costs two
// failures; nat 20 skips the track and revives at 1 HP.
export type DeathSaveVerdict =
  | "success"
  | "failure"
  // Three successes: stable, no longer dying, pips wiped.
  | "stable"
  // Three failures.
  | "dead"
  // A natural 20 — conscious again with one hit point.
  | "revived";

export interface DeathSaveResult {
  verdict: DeathSaveVerdict;
  successes: number;
  failures: number;
  // Set when the character is back on their feet, which is a hit-point change
  // rather than a pip one.
  revivedAtHp?: number;
}

export function resolveDeathSave(
  face: number,
  saves: { successes: number; failures: number },
): DeathSaveResult {
  if (face >= 20) {
    return { verdict: "revived", successes: 0, failures: 0, revivedAtHp: 1 };
  }
  if (face <= 1) {
    const failures = Math.min(3, saves.failures + 2);
    return {
      verdict: failures >= 3 ? "dead" : "failure",
      successes: saves.successes,
      failures,
    };
  }
  if (face >= 10) {
    const successes = Math.min(3, saves.successes + 1);
    if (successes >= 3) return { verdict: "stable", successes: 0, failures: 0 };
    return { verdict: "success", successes, failures: saves.failures };
  }
  const failures = Math.min(3, saves.failures + 1);
  return {
    verdict: failures >= 3 ? "dead" : "failure",
    successes: saves.successes,
    failures,
  };
}

// How the table hears it: "failure — two of three".
export function describeDeathSave(result: DeathSaveResult): string {
  switch (result.verdict) {
    case "revived":
      return "natural 20 — conscious at 1 HP";
    case "stable":
      return "third success — stable";
    case "dead":
      return "third failure — dead";
    case "success":
      return `success (${result.successes} of 3)`;
    default:
      return `failure (${result.failures} of 3)`;
  }
}

// Preset/option-list data lives in src/lib/data/; re-exported here for
// existing imports.
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
