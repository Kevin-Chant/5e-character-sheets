import {
  ArmorMechanics,
  Attack,
  CustomFormula,
  ShieldMechanics,
} from "src/lib/types";
import { Operation } from "src/lib/data/data-definitions";
import {
  WEAPON_PRESETS,
  WeaponPreset,
  buildAttackFromPreset,
} from "src/lib/data/weapon-presets";
import { weightForItem } from "src/lib/data/equipment-weights";
import { ARMOR_PRESETS } from "./equipment";

// One built-in item the equipment editor's type-ahead can prefill. A weapon
// entry carries its preset so the editor can also seed a ready-to-roll Attack
// (via `buildCatalogAttack`) alongside the inventory line.
export interface EquipmentCatalogEntry {
  name: string;
  group: string;
  armor?: ArmorMechanics;
  shield?: ShieldMechanics;
  weapon?: WeaponPreset;
  weight?: number; // per-unit, in pounds (the model's storage unit)
}

// The built-in inventory surfaced by the equipment editor's name type-ahead:
// the SRD armor set, a shield, and every SRD weapon. Weights come from the
// same SRD table the builder uses.
export const EQUIPMENT_CATALOG: EquipmentCatalogEntry[] = [
  ...ARMOR_PRESETS.map(
    (p): EquipmentCatalogEntry => ({
      name: p.label,
      group: "Armor",
      armor: p.mechanics,
      weight: weightForItem(p.label),
    }),
  ),
  { name: "Shield", group: "Armor", shield: { bonus: 2 }, weight: 6 },
  ...WEAPON_PRESETS.flatMap((group) =>
    group.options.map(
      (weapon): EquipmentCatalogEntry => ({
        name: weapon.name,
        group: group.label,
        weapon,
        weight: weightForItem(weapon.name),
      }),
    ),
  ),
];

// "Chain Mail +1", or just "Chain Mail" for a mundane pick.
export const catalogItemName = (
  entry: EquipmentCatalogEntry,
  bonus: number,
): string => (bonus > 0 ? `${entry.name} +${bonus}` : entry.name);

// A +N magic weapon adds N to both the attack roll and every damage type. The
// bonus wraps the preset's formulas in one more addition rather than reaching
// into their operand lists, so it works whatever shape the preset built.
export function buildCatalogAttack(
  weapon: WeaponPreset,
  bonus: number,
): Attack {
  const attack = buildAttackFromPreset(weapon);
  if (bonus <= 0) return attack;
  const plus = (formula: CustomFormula): CustomFormula => ({
    operation: Operation.addition,
    operands: [formula, bonus],
  });
  return {
    ...attack,
    name: `${attack.name} +${bonus}`,
    ...(attack.bonus !== undefined ? { bonus: plus(attack.bonus) } : {}),
    formula: Object.fromEntries(
      Object.entries(attack.formula).map(([type, damage]) => [
        type,
        plus(damage),
      ]),
    ),
  };
}

// +N armor raises the base AC; a +N shield raises its AC bonus.
export const armorWithBonus = (
  armor: ArmorMechanics,
  bonus: number,
): ArmorMechanics => ({ ...armor, base: armor.base + bonus });

export const shieldWithBonus = (
  shield: ShieldMechanics,
  bonus: number,
): ShieldMechanics => ({ ...shield, bonus: shield.bonus + bonus });
