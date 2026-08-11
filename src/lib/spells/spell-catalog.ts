import { SpellMechanics } from "src/lib/types";
import srdSpellData from "src/lib/data/srd-spells.json";
import { NONSRD_SPELLS } from "src/lib/data/nonsrd-spells";

// The compact catalog-entry shape: written by `scripts/generate-spells.mjs` for
// the SRD snapshot, and hand-authored in the same shape for non-SRD spells. See
// `spell-adapter.ts` for how one becomes an editable `Spell`.
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
  material?: string; // present only when there's a material component
  desc: string;
  higherLevel?: string; // "At Higher Levels" / character-level scaling prose
  classes: string[]; // e.g. ["Sorcerer", "Wizard"]
  save?: string; // saving-throw ability abbreviation, e.g. "DEX"
  damageType?: string; // matches `DamageType` enum values
  baseDamage?: string; // base roll at lowest slot/character level, e.g. "8d6"
  areaOfEffect?: string; // e.g. "20-foot sphere"
  // Present only for spells with parseable damage (base + scaling, or an
  // exact damageTable).
  mechanics?: SpellMechanics;
}

export const SRD_SPELLS = srdSpellData as CatalogSpell[];

// The SRD snapshot plus hand-authored non-SRD spells. Lookups and search run
// over this combined list.
export const ALL_SPELLS: CatalogSpell[] = [...SRD_SPELLS, ...NONSRD_SPELLS];

const BY_INDEX = new Map(ALL_SPELLS.map((s) => [s.index, s]));

export const getCatalogSpell = (index: string): CatalogSpell | undefined =>
  BY_INDEX.get(index);

// Case-insensitive substring match on name, ranked so prefix matches sort
// first, then by level then name. Optional class filter. Empty query returns
// the full sorted list.
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
