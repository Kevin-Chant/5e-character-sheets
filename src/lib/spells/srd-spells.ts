import { SpellMechanics } from "src/lib/types";
import srdSpellData from "src/lib/data/srd-spells.json";

// The compact snapshot shape written by `scripts/generate-spells.mjs`. This is a
// flattened, display-oriented projection of the D&D 5e API's SRD spell — only
// the fields the sheet needs, so the bundled JSON stays small. See the adapter
// (`srd-spell-adapter.ts`) for how one becomes an editable `Spell`.
export interface SrdSpell {
  index: string;
  name: string;
  // 0 = cantrip, 1–9 = spell level.
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  verbal: boolean;
  somatic: boolean;
  // Present only when the spell has a material component (the flavor text).
  material?: string;
  // SRD description, paragraphs joined by blank lines.
  desc: string;
  // "At Higher Levels" / character-level scaling prose, when present.
  higherLevel?: string;
  // Classes with this on their SRD list, e.g. ["Sorcerer", "Wizard"].
  classes: string[];
  // Saving-throw ability abbreviation, e.g. "DEX". Absent for attack-roll spells.
  save?: string;
  // Damage type (matches the `DamageType` enum values), when the spell deals damage.
  damageType?: string;
  // Base damage roll at the lowest slot/character level, e.g. "8d6". This is the
  // piece we turn into a live formula; higher-level scaling stays in `higherLevel`.
  baseDamage?: string;
  // e.g. "20-foot sphere", when the spell has an area.
  areaOfEffect?: string;
  // Structured mechanics inferred from the SRD damage table (base + scaling, or
  // an exact damageTable). Present only for spells with parseable damage; see
  // `.claude/docs/spell-scaling.md`.
  mechanics?: SpellMechanics;
}

export const SRD_SPELLS = srdSpellData as SrdSpell[];

const BY_INDEX = new Map(SRD_SPELLS.map((s) => [s.index, s]));

export const getSrdSpell = (index: string): SrdSpell | undefined =>
  BY_INDEX.get(index);

// Case-insensitive substring match on name, ranked so prefix matches sort first,
// then by level then name. Optionally filter to a spellcasting class. Returns the
// full list (still sorted) for an empty query so the picker can show everything.
export function searchSrdSpells(query: string, className?: string): SrdSpell[] {
  const q = query.trim().toLowerCase();
  const pool = className
    ? SRD_SPELLS.filter((s) => s.classes.includes(className))
    : SRD_SPELLS;
  if (!q) return pool;
  return pool
    .filter((s) => s.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return (
        aStarts - bStarts || a.level - b.level || a.name.localeCompare(b.name)
      );
    });
}
