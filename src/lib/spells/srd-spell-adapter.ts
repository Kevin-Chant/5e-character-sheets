import {
  DamageType,
  DieOperation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { DieExpression, Spell, SpellComponents } from "src/lib/types";
import { UUID } from "crypto";
import { SrdSpell } from "./srd-spells";

// Map a die's face count to the `StandardDie` enum. Every SRD damage die is
// standard (d4–d12); anything else yields undefined and we skip the live formula
// rather than invent a non-standard die.
const STANDARD_DIE_BY_FACES: Record<number, StandardDie> = {
  4: StandardDie.d4,
  6: StandardDie.d6,
  8: StandardDie.d8,
  10: StandardDie.d10,
  12: StandardDie.d12,
  20: StandardDie.d20,
};

// Parse an "NdM" roll (e.g. "8d6") into a `DieExpression` the formula engine can
// evaluate. `DieOperation.roll` matches how weapon damage is stored, so a spell's
// base damage renders and scales through the same code path as an attack.
export function parseDamageRoll(roll: string): DieExpression | undefined {
  const match = /^(\d+)d(\d+)$/.exec(roll.trim());
  if (!match) return undefined;
  const count = Number(match[1]);
  const die = STANDARD_DIE_BY_FACES[Number(match[2])];
  if (!die || count < 1) return undefined;
  return [count, die, DieOperation.roll];
}

// The generated `mechanics` marks a spell's caster ability modifier with a
// placeholder class (see generate-spells.mjs); the real spellcasting class is
// only known when the spell is added, so we stamp it in here.
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

// SRD damage-type strings line up 1:1 with our enum values ("Fire", "Cold", …);
// guard anyway so a future/renamed type degrades to plain prose.
const asDamageType = (name?: string): DamageType | undefined =>
  name && (Object.values(DamageType) as string[]).includes(name)
    ? (name as DamageType)
    : undefined;

function buildComponents(srd: SrdSpell): SpellComponents | undefined {
  const components: SpellComponents = {};
  if (srd.verbal) components.verbal = true;
  if (srd.somatic) components.somatic = true;
  if (srd.material) components.material = [{ name: srd.material }];
  return Object.keys(components).length ? components : undefined;
}

// Compose the spell's detail: the SRD description, a compact stat line, an
// optional live base-damage slot, and the "at higher levels" scaling prose. The
// `{{}}` in the damage line is filled positionally from `detailFormulas` (see
// `TextWithFormulasDisplay`) — the same mechanism the weapon presets use so a
// looked-up spell shows a computed roll that recomputes with the character.
function buildDetail(srd: SrdSpell): {
  detail: string;
  detailFormulas: DieExpression[];
} {
  const detailFormulas: DieExpression[] = [];
  const parts: string[] = [srd.desc];

  const stats: string[] = [`_${srd.school}_`];
  if (srd.areaOfEffect) stats.push(`Area: ${srd.areaOfEffect}`);
  if (srd.save) stats.push(`Save: ${srd.save}`);
  parts.push(stats.join(" · "));

  const damageType = asDamageType(srd.damageType);
  const roll = srd.baseDamage ? parseDamageRoll(srd.baseDamage) : undefined;
  if (roll && damageType) {
    detailFormulas.push(roll);
    parts.push(`**Base damage:** {{}} ${damageType.toLowerCase()}`);
  }

  if (srd.higherLevel) parts.push(`**At Higher Levels.** ${srd.higherLevel}`);

  return { detail: parts.join("\n\n"), detailFormulas };
}

// Build a ready-to-edit `Spell` from an SRD entry, attributed to the given
// spellcasting class. Mirrors `buildAttackFromPreset` in `rules.ts`: official
// content pre-populates the fields (including a computed base-damage roll), and
// everything stays editable so a player can tweak or homebrew from there.
export function buildSpellFromSrd(
  srd: SrdSpell,
  spellcastingClass: UUID,
): Spell {
  const { detail, detailFormulas } = buildDetail(srd);
  const spell: Spell = {
    spellcastingClass,
    info: { title: srd.name, titleFormulas: [], detail, detailFormulas },
    castingTime: srd.castingTime,
    range: srd.range,
    duration: srd.duration,
  };
  if (srd.ritual) spell.ritual = true;
  if (srd.concentration) spell.concentration = true;
  const components = buildComponents(srd);
  if (components) spell.components = components;
  if (srd.mechanics)
    spell.mechanics = stampCaster(srd.mechanics, spellcastingClass);
  return spell;
}
