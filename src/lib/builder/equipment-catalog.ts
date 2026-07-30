import {
  ArmorMechanics,
  GroupedOptionsList,
  ShieldMechanics,
} from "src/lib/types";
import { ARMOR_PRESETS } from "./equipment";

// One built-in item the equipment editor's type-ahead can prefill. An entry just
// names an item and, optionally, the mechanics/weight to seed when it's picked.
export interface EquipmentCatalogEntry {
  name: string;
  group: string;
  armor?: ArmorMechanics;
  shield?: ShieldMechanics;
  weight?: number; // per-unit, in pounds (the model's storage unit)
}

// The built-in inventory surfaced by the "search built-in items" type-ahead.
// Today this is the SRD armor set plus a shield; it's meant to grow — add gear,
// tools, and other common items here and they appear in the search for free.
export const EQUIPMENT_CATALOG: EquipmentCatalogEntry[] = [
  ...ARMOR_PRESETS.map(
    (p): EquipmentCatalogEntry => ({
      name: p.label,
      group: "Armor",
      armor: p.mechanics,
    }),
  ),
  { name: "Shield", group: "Armor", shield: { bonus: 2 }, weight: 6 },
];

// The catalog names grouped by `group`, for the editor's type-ahead. As the
// catalog grows into gear and tools, each new group appears as its own labelled
// section for free.
export const CATALOG_OPTIONS: GroupedOptionsList = (() => {
  const groups = new Map<string, string[]>();
  for (const entry of EQUIPMENT_CATALOG) {
    const names = groups.get(entry.group) ?? [];
    names.push(entry.name);
    groups.set(entry.group, names);
  }
  return [...groups].map(([label, options]) => ({ label, options }));
})();
