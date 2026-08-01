import { SpellMechanics } from "src/lib/types";
import srdSpellData from "src/lib/data/srd-spells.json";
import { NONSRD_SPELLS } from "src/lib/data/nonsrd-spells";

// The compact catalog-entry shape: written by `scripts/generate-spells.mjs` for
// the SRD snapshot (a flattened, display-oriented projection of the D&D 5e
// API's spell — only the fields the sheet needs, so the bundled JSON stays
// small), and hand-authored in the same shape for the non-SRD spells. See the
// adapter (`spell-adapter.ts`) for how one becomes an editable `Spell`.
export interface CatalogSpell {
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

export const SRD_SPELLS = srdSpellData as CatalogSpell[];

// The full catalog: the SRD snapshot plus the hand-authored non-SRD spells
// (`src/lib/data/nonsrd-spells/`). Those files only `import type` from here, so
// the value graph stays acyclic. Lookups and search run over this combined
// list, so a Genie warlock's Wish or a paladin's Compelled Duel resolve by
// index and show up in the picker.
export const ALL_SPELLS: CatalogSpell[] = [...SRD_SPELLS, ...NONSRD_SPELLS];

const BY_INDEX = new Map(ALL_SPELLS.map((s) => [s.index, s]));

export const getCatalogSpell = (index: string): CatalogSpell | undefined =>
  BY_INDEX.get(index);

// Case-insensitive substring match on name, ranked so prefix matches sort first,
// then by level then name. Optionally filter to a spellcasting class. Returns the
// full list (still sorted) for an empty query so the picker can show everything.
export function searchCatalogSpells(
  query: string,
  className?: string,
): CatalogSpell[] {
  const q = query.trim().toLowerCase();
  const pool = className
    ? ALL_SPELLS.filter((s) => s.classes.includes(className))
    : ALL_SPELLS;
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
