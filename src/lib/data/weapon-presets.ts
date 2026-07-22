import { randomUUID } from "src/lib/browser";
import {
  Attack,
  CustomFormula,
  GroupedOptionsList,
  WeaponRange,
} from "src/lib/types";
import {
  DamageType,
  DieOperation,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "./data-definitions";

// Which ability a weapon's attack/damage uses. "finesse" means the better of
// STR or DEX and pre-populates as max(STR, DEX).
export type WeaponAbility = StatKey.str | StatKey.dex | "finesse";

export interface WeaponPreset {
  name: string;
  ability: WeaponAbility;
  // Omitted for weapons that deal no damage (e.g. Net).
  damage?: {
    count: number;
    die?: StandardDie;
    type: DamageType;
    // Larger die when wielded two-handed (5e "versatile"). When set, the picker
    // offers a separate two-handed attack alongside the one-handed default.
    versatileDie?: StandardDie;
  };
  // Normal / long range in feet, for ranged and thrown weapons. Omitted for
  // pure-melee weapons.
  range?: WeaponRange;
}

const D = (
  count: number,
  die: StandardDie | undefined,
  type: DamageType,
  versatileDie?: StandardDie,
) => ({ count, die, type, versatileDie });

const R = (normal: number, long?: number): WeaponRange => ({ normal, long });

export const WEAPON_PRESETS: GroupedOptionsList<WeaponPreset> = [
  {
    label: "Simple Melee Weapons",
    options: [
      {
        name: "Club",
        ability: StatKey.str,
        damage: D(1, StandardDie.d4, DamageType.Bludgeoning),
      },
      {
        name: "Dagger",
        ability: "finesse",
        damage: D(1, StandardDie.d4, DamageType.Piercing),
        range: R(20, 60),
      },
      {
        name: "Greatclub",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Bludgeoning),
      },
      {
        name: "Handaxe",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Slashing),
        range: R(20, 60),
      },
      {
        name: "Javelin",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Piercing),
        range: R(30, 120),
      },
      {
        name: "Light Hammer",
        ability: StatKey.str,
        damage: D(1, StandardDie.d4, DamageType.Bludgeoning),
        range: R(20, 60),
      },
      {
        name: "Mace",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Bludgeoning),
      },
      {
        name: "Quarterstaff",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Bludgeoning, StandardDie.d8),
      },
      {
        name: "Sickle",
        ability: StatKey.str,
        damage: D(1, StandardDie.d4, DamageType.Slashing),
      },
      {
        name: "Spear",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Piercing, StandardDie.d8),
        range: R(20, 60),
      },
    ],
  },
  {
    label: "Simple Ranged Weapons",
    options: [
      {
        name: "Light Crossbow",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d8, DamageType.Piercing),
        range: R(80, 320),
      },
      {
        name: "Dart",
        ability: "finesse",
        damage: D(1, StandardDie.d4, DamageType.Piercing),
        range: R(20, 60),
      },
      {
        name: "Shortbow",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d6, DamageType.Piercing),
        range: R(80, 320),
      },
      {
        name: "Sling",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d4, DamageType.Bludgeoning),
        range: R(30, 120),
      },
    ],
  },
  {
    label: "Martial Melee Weapons",
    options: [
      {
        name: "Battleaxe",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Slashing, StandardDie.d10),
      },
      {
        name: "Flail",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Bludgeoning),
      },
      {
        name: "Glaive",
        ability: StatKey.str,
        damage: D(1, StandardDie.d10, DamageType.Slashing),
      },
      {
        name: "Greataxe",
        ability: StatKey.str,
        damage: D(1, StandardDie.d12, DamageType.Slashing),
      },
      {
        name: "Greatsword",
        ability: StatKey.str,
        damage: D(2, StandardDie.d6, DamageType.Slashing),
      },
      {
        name: "Halberd",
        ability: StatKey.str,
        damage: D(1, StandardDie.d10, DamageType.Slashing),
      },
      {
        name: "Lance",
        ability: StatKey.str,
        damage: D(1, StandardDie.d12, DamageType.Piercing),
      },
      {
        name: "Longsword",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Slashing, StandardDie.d10),
      },
      {
        name: "Maul",
        ability: StatKey.str,
        damage: D(2, StandardDie.d6, DamageType.Bludgeoning),
      },
      {
        name: "Morningstar",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Piercing),
      },
      {
        name: "Pike",
        ability: StatKey.str,
        damage: D(1, StandardDie.d10, DamageType.Piercing),
      },
      {
        name: "Rapier",
        ability: "finesse",
        damage: D(1, StandardDie.d8, DamageType.Piercing),
      },
      {
        name: "Scimitar",
        ability: "finesse",
        damage: D(1, StandardDie.d6, DamageType.Slashing),
      },
      {
        name: "Shortsword",
        ability: "finesse",
        damage: D(1, StandardDie.d6, DamageType.Piercing),
      },
      {
        name: "Trident",
        ability: StatKey.str,
        damage: D(1, StandardDie.d6, DamageType.Piercing, StandardDie.d8),
        range: R(20, 60),
      },
      {
        name: "War Pick",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Piercing),
      },
      {
        name: "Warhammer",
        ability: StatKey.str,
        damage: D(1, StandardDie.d8, DamageType.Bludgeoning, StandardDie.d10),
      },
      {
        name: "Whip",
        ability: "finesse",
        damage: D(1, StandardDie.d4, DamageType.Slashing),
      },
    ],
  },
  {
    label: "Martial Ranged Weapons",
    options: [
      {
        name: "Blowgun",
        ability: StatKey.dex,
        damage: D(1, undefined, DamageType.Piercing),
        range: R(25, 100),
      },
      {
        name: "Hand Crossbow",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d6, DamageType.Piercing),
        range: R(30, 120),
      },
      {
        name: "Heavy Crossbow",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d10, DamageType.Piercing),
        range: R(100, 400),
      },
      {
        name: "Longbow",
        ability: StatKey.dex,
        damage: D(1, StandardDie.d8, DamageType.Piercing),
        range: R(150, 600),
      },
      { name: "Net", ability: StatKey.dex, range: R(5, 15) },
    ],
  },
];

// Weapon-proficiency typeahead: the broad categories plus every preset's name.
export const DEFAULT_WEAPONS: GroupedOptionsList<string> = [
  { label: "Weapon Types", options: ["Simple Weapons", "Martial Weapons"] },
  ...WEAPON_PRESETS.map((group) => ({
    label: group.label,
    options: group.options.map((weapon) => weapon.name),
  })),
];

const abilityOperand = (ability: WeaponAbility): CustomFormula =>
  ability === "finesse"
    ? { operation: Operation.maximum, operands: [StatKey.str, StatKey.dex] }
    : ability;

// Build a ready-to-edit Attack from a preset: to-hit = ability + PB, damage =
// the weapon's die (if any) + ability, keyed by its damage type. Pass
// `twoHanded` for a versatile weapon to use its larger die and a "(2H)" name.
export function buildAttackFromPreset(
  weapon: WeaponPreset,
  twoHanded = false,
): Attack {
  const ability = abilityOperand(weapon.ability);
  const twoHandedDie = twoHanded ? weapon.damage?.versatileDie : undefined;
  const attack: Attack = {
    id: randomUUID(),
    name: twoHandedDie ? `${weapon.name} (2H)` : weapon.name,
    bonus: { operation: Operation.addition, operands: [ability, PB] },
    formula: {},
    ...(weapon.range ? { range: weapon.range } : {}),
  };
  if (weapon.damage) {
    const die = twoHandedDie ?? weapon.damage.die;
    const dieOperand: CustomFormula =
      die !== undefined
        ? [weapon.damage.count, die, DieOperation.roll]
        : weapon.damage.count;
    attack.formula = {
      [weapon.damage.type]: {
        operation: Operation.addition,
        operands: [dieOperand, ability],
      },
    };
  }
  return attack;
}

export const DEFAULT_CUSTOM_ATTACK: WeaponPreset = {
  name: "Shortsword",
  ability: StatKey.dex,
  damage: { count: 1, die: StandardDie.d6, type: DamageType.Piercing },
};
