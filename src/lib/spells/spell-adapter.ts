import {
  DamageType,
  DieOperation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { DieExpression, Spell, SpellComponents } from "src/lib/types";
import { UUID } from "crypto";
import { CatalogSpell } from "./spell-catalog";

// Every SRD damage die is standard (d4-d12); anything else yields undefined.
const STANDARD_DIE_BY_FACES: Record<number, StandardDie> = {
  4: StandardDie.d4,
  6: StandardDie.d6,
  8: StandardDie.d8,
  10: StandardDie.d10,
  12: StandardDie.d12,
  20: StandardDie.d20,
};

// Parse an "NdM" roll (e.g. "8d6") into a `DieExpression`.
export function parseDamageRoll(roll: string): DieExpression | undefined {
  const match = /^(\d+)d(\d+)$/.exec(roll.trim());
  if (!match) return undefined;
  const count = Number(match[1]);
  const die = STANDARD_DIE_BY_FACES[Number(match[2])];
  if (!die || count < 1) return undefined;
  return [count, die, DieOperation.roll];
}

// The generated `mechanics` marks a spell's caster ability modifier with a
// placeholder class (see generate-spells.mjs), stamped with the real
// spellcasting class here once the spell is added.
const CASTER_PLACEHOLDER = "@caster";

function stampCaster<T>(value: T, classId: UUID): T {
  if (Array.isArray(value))
    return value.map((v) => stampCaster(v, classId)) as T;
  if (value && typeof value === "object") {
    if ((value as { spellMod?: string }).spellMod === CASTER_PLACEHOLDER)
      return { spellMod: classId } as T;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, stampCaster(v, classId)]),
    ) as T;
  }
  return value;
}

// SRD damage-type strings line up 1:1 with our enum values ("Fire", "Cold", …).
const asDamageType = (name?: string): DamageType | undefined =>
  name && (Object.values(DamageType) as string[]).includes(name)
    ? (name as DamageType)
    : undefined;

function buildComponents(entry: CatalogSpell): SpellComponents | undefined {
  const components: SpellComponents = {};
  if (entry.verbal) components.verbal = true;
  if (entry.somatic) components.somatic = true;
  if (entry.material) components.material = [{ name: entry.material }];
  return Object.keys(components).length ? components : undefined;
}

// Composes the spell's detail: description, stat line, optional live
// base-damage slot, and "at higher levels" prose. `{{}}` in the damage line is
// filled positionally from `detailFormulas` (see `TextWithFormulasDisplay`).
function buildDetail(entry: CatalogSpell): {
  detail: string;
  detailFormulas: DieExpression[];
} {
  const detailFormulas: DieExpression[] = [];
  const parts: string[] = [entry.desc];

  const stats: string[] = [];
  if (entry.areaOfEffect) stats.push(`Area: ${entry.areaOfEffect}`);
  if (entry.save) stats.push(`Save: ${entry.save}`);
  if (stats.length) parts.push(stats.join(" · "));

  const damageType = asDamageType(entry.damageType);
  const roll = entry.baseDamage ? parseDamageRoll(entry.baseDamage) : undefined;
  if (roll && damageType) {
    detailFormulas.push(roll);
    parts.push(`**Base damage:** {{}} ${damageType.toLowerCase()}`);
  }

  if (entry.higherLevel)
    parts.push(`**At Higher Levels.** ${entry.higherLevel}`);

  return { detail: parts.join("\n\n"), detailFormulas };
}

// Build a ready-to-edit `Spell` from a catalog entry, attributed to the given
// spellcasting class. Mirrors `buildAttackFromPreset` in `rules.ts`.
export function buildSpellFromCatalog(
  entry: CatalogSpell,
  spellcastingClass: UUID,
): Spell {
  const { detail, detailFormulas } = buildDetail(entry);
  const spell: Spell = {
    spellcastingClass,
    info: { title: entry.name, titleFormulas: [], detail, detailFormulas },
    castingTime: entry.castingTime,
    ...(entry.school ? { school: entry.school } : {}),
    range: entry.range,
    duration: entry.duration,
  };
  if (entry.ritual) spell.ritual = true;
  if (entry.concentration) spell.concentration = true;
  const components = buildComponents(entry);
  if (components) spell.components = components;
  if (entry.mechanics)
    spell.mechanics = stampCaster(entry.mechanics, spellcastingClass);
  return spell;
}
