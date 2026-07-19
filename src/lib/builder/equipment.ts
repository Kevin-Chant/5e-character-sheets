import { Attack, CustomFormula } from "src/lib/types";
import { ArmorType, Operation, StatKey } from "src/lib/data/data-definitions";
import {
  WEAPON_PRESETS,
  WeaponPreset,
  buildAttackFromPreset,
} from "src/lib/data/weapon-presets";

// Class starting-equipment options arrive from the SRD as prose lines like
// "(a) a greataxe or (b) any martial melee weapon". Some lines carry no "(x)"
// markers at all ("holy symbol", "druidic focus") — those are plain grants.
// These helpers parse a line into either a fixed grant or a set of labelled
// choices, classify each concrete/category grant, and assemble the resulting
// equipment list, attacks, and AC formula.

export interface EquipmentChoice {
  key: string;
  text: string;
}

export type ParsedEquipmentOption =
  | { kind: "fixed"; text: string }
  | { kind: "choice"; choices: EquipmentChoice[] };

// Strip trailing separators ("a longsword, or " → "a longsword") left behind
// when the option text is split on the next "(x)" marker.
const clean = (s: string): string =>
  s
    .trim()
    .replace(/[\s,]*(?:\bor\b)?[\s,]*$/i, "")
    .trim();

export function parseEquipmentOption(raw: string): ParsedEquipmentOption {
  // Split on "(a)" / "(b)" markers, capturing the letter. `(if proficient)` and
  // other multi-char parentheticals are left untouched (only single letters
  // match), so they stay part of the choice text.
  const parts = raw.split(/\(([a-z])\)/);
  if (parts.length < 3) return { kind: "fixed", text: raw.trim() };
  const choices: EquipmentChoice[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = clean(parts[i + 1] ?? "");
    if (text) choices.push({ key: parts[i], text });
  }
  // A single resolvable choice is really a fixed grant.
  return choices.length >= 2
    ? { kind: "choice", choices }
    : { kind: "fixed", text: raw.trim() };
}

// ---------------------------------------------------------------- Weapon data

export type WeaponCategory =
  | "simple"
  | "simple-melee"
  | "simple-ranged"
  | "martial"
  | "martial-melee"
  | "martial-ranged";

const GROUP_LABELS: Record<WeaponCategory, string[]> = {
  simple: ["Simple Melee Weapons", "Simple Ranged Weapons"],
  "simple-melee": ["Simple Melee Weapons"],
  "simple-ranged": ["Simple Ranged Weapons"],
  martial: ["Martial Melee Weapons", "Martial Ranged Weapons"],
  "martial-melee": ["Martial Melee Weapons"],
  "martial-ranged": ["Martial Ranged Weapons"],
};

// Concrete weapon presets belonging to a broad category ("any martial melee
// weapon" → the Martial Melee group).
export function weaponsInCategory(category: WeaponCategory): WeaponPreset[] {
  const labels = GROUP_LABELS[category];
  return WEAPON_PRESETS.filter((g) => labels.includes(g.label)).flatMap(
    (g) => g.options,
  );
}

const WEAPON_BY_NAME = new Map<string, WeaponPreset>(
  WEAPON_PRESETS.flatMap((g) =>
    g.options.map((w) => [w.name.toLowerCase(), w] as const),
  ),
);

// Match a (possibly pluralised) weapon name to a preset: "greataxe",
// "handaxes" → Handaxe, "light crossbow" → Light Crossbow.
function weaponByName(name: string): WeaponPreset | undefined {
  const n = name.toLowerCase().trim();
  return (
    WEAPON_BY_NAME.get(n) ??
    (n.endsWith("es") ? WEAPON_BY_NAME.get(n.slice(0, -2)) : undefined) ??
    (n.endsWith("s") ? WEAPON_BY_NAME.get(n.slice(0, -1)) : undefined)
  );
}

// ----------------------------------------------------------------- Armor data

interface ArmorPreset {
  label: string;
  type: ArmorType;
  formula: CustomFormula;
}

const DEX = StatKey.dex;
// Medium armor: base + min(DEX mod, 2).
const medium = (base: number): CustomFormula => ({
  operation: Operation.addition,
  operands: [base, { operation: Operation.minimum, operands: [DEX, 2] }],
});
const light = (base: number): CustomFormula => ({
  operation: Operation.addition,
  operands: [base, DEX],
});

const ARMOR: Record<string, ArmorPreset> = {
  "leather armor": { label: "Leather Armor", type: ArmorType.Light, formula: light(11) }, // prettier-ignore
  "studded leather armor": { label: "Studded Leather Armor", type: ArmorType.Light, formula: light(12) }, // prettier-ignore
  "hide armor": {
    label: "Hide Armor",
    type: ArmorType.Medium,
    formula: medium(12),
  },
  "chain shirt": { label: "Chain Shirt", type: ArmorType.Medium, formula: medium(13) }, // prettier-ignore
  "scale mail": {
    label: "Scale Mail",
    type: ArmorType.Medium,
    formula: medium(14),
  },
  "ring mail": { label: "Ring Mail", type: ArmorType.Heavy, formula: 14 },
  "chain mail": { label: "Chain Mail", type: ArmorType.Heavy, formula: 16 },
};

// ------------------------------------------------------------------- Grants

export type EquipmentGrant =
  | { kind: "item"; text: string }
  | { kind: "weapon"; name: string; count: number }
  | { kind: "weaponChoice"; category: WeaponCategory; count: number }
  | { kind: "armor"; key: string }
  | { kind: "shield" };

const NUM_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  // "any" as in "any martial weapon" — a single category pick.
  any: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const CATEGORY_BY_PHRASE: Record<string, WeaponCategory> = {
  "simple weapon": "simple",
  "simple melee weapon": "simple-melee",
  "simple ranged weapon": "simple-ranged",
  "martial weapon": "martial",
  "martial melee weapon": "martial-melee",
  "martial ranged weapon": "martial-ranged",
};

// Classify one comma/"and"-separated segment into a structured grant. Anything
// unrecognised (packs, foci, ammo) falls through to a plain item so no gear is
// ever lost.
function classifySegment(seg: string): EquipmentGrant {
  const raw = seg.trim();
  let count = 1;
  let core = raw;

  // "Dagger (2)" — trailing count suffix (fixed-gear style).
  const suffix = core.match(/^(.*?)\s*\((\d+)\)\s*$/);
  if (suffix) {
    core = suffix[1];
    count = Number(suffix[2]);
  } else {
    // "two handaxes" / "five javelins" / "a greataxe" — leading article/number.
    const prefix = core.match(/^([a-z]+|\d+)\s+(.*)$/i);
    if (prefix) {
      const n = /^\d+$/.test(prefix[1])
        ? Number(prefix[1])
        : NUM_WORDS[prefix[1].toLowerCase()];
      if (n !== undefined) {
        count = n;
        core = prefix[2];
      }
    }
  }

  const key = core
    .replace(/\(if proficient\)/i, "")
    .trim()
    .toLowerCase();

  if (key.includes("shield")) return { kind: "shield" };
  if (ARMOR[key]) return { kind: "armor", key };

  const category = CATEGORY_BY_PHRASE[key.replace(/s$/, "")];
  if (category) return { kind: "weaponChoice", category, count };

  const weapon = weaponByName(key);
  if (weapon) return { kind: "weapon", name: weapon.name, count };

  return { kind: "item", text: raw };
}

// Split a choice text into grants. Compound lines ("leather armor, longbow, and
// 20 arrows") split on commas/"and"; simple category phrases ("any martial
// melee weapon") stay whole.
export function grantsForChoiceText(text: string): EquipmentGrant[] {
  return text
    .split(/\s*,\s*and\s+|\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(classifySegment);
}

// The concrete weapon slots a chosen option exposes for the player to fill —
// one entry per weapon to pick (a "two martial weapons" grant → two slots).
export function weaponSlotsForText(text: string): WeaponCategory[] {
  return grantsForChoiceText(text).flatMap((g) =>
    g.kind === "weaponChoice"
      ? Array<WeaponCategory>(g.count).fill(g.category)
      : [],
  );
}

// ------------------------------------------------------------- Loadout build

export interface ClassLoadout {
  equipment: string[];
  attacks: Attack[];
  // Set only when the loadout includes armor and/or a shield; otherwise the
  // caller keeps the default 10 + DEX formula.
  acFormula?: CustomFormula;
}

function acFormula(
  armor: ArmorPreset | undefined,
  shield: boolean,
): CustomFormula {
  const base: CustomFormula = armor ? armor.formula : light(10);
  if (!shield) return base;
  // Fold the shield's +2 into the base addition when possible.
  if (
    typeof base === "object" &&
    "operation" in base &&
    base.operation === Operation.addition
  )
    return { operation: Operation.addition, operands: [...base.operands, 2] };
  return { operation: Operation.addition, operands: [base, 2] };
}

// Resolve a class's fixed items + selected option choices + the player's weapon
// picks into concrete equipment lines, attacks, and (if armor/shield chosen) an
// AC formula. `choiceSel` maps option index → chosen choice index; `weaponSel`
// maps option index → the concrete weapon names filling that option's slots.
export function resolveClassLoadout(
  fixed: string[],
  options: string[],
  choiceSel: Record<number, number>,
  weaponSel: Record<number, string[]>,
): ClassLoadout {
  const equipment: string[] = [];
  const attacks: Attack[] = [];
  let armor: ArmorPreset | undefined;
  let shield = false;

  const addWeapon = (name: string, count = 1) => {
    const preset = weaponByName(name);
    const label = preset?.name ?? name;
    equipment.push(count > 1 ? `${label} (${count})` : label);
    if (preset) attacks.push(buildAttackFromPreset(preset));
  };

  // `optionIndex` is undefined for the class's flat/fixed items (no picks).
  const consume = (text: string, optionIndex?: number) => {
    const picks =
      optionIndex === undefined ? [] : (weaponSel[optionIndex] ?? []);
    let cursor = 0;
    for (const g of grantsForChoiceText(text)) {
      if (g.kind === "item") equipment.push(g.text);
      else if (g.kind === "weapon") addWeapon(g.name, g.count);
      else if (g.kind === "shield") {
        shield = true;
        equipment.push("Shield");
      } else if (g.kind === "armor") {
        armor = ARMOR[g.key];
        equipment.push(armor.label);
      } else {
        for (let k = 0; k < g.count; k++)
          addWeapon(picks[cursor++] ?? weaponsInCategory(g.category)[0]?.name);
      }
    }
  };

  for (const item of fixed) consume(item);
  options.forEach((raw, i) => {
    const parsed = parseEquipmentOption(raw);
    if (parsed.kind === "fixed") consume(parsed.text, i);
    else {
      const choice = parsed.choices[choiceSel[i] ?? 0] ?? parsed.choices[0];
      consume(choice.text, i);
    }
  });

  return {
    equipment,
    attacks,
    acFormula: armor || shield ? acFormula(armor, shield) : undefined,
  };
}
