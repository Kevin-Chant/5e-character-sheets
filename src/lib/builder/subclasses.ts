import { SUBCLASSES } from "src/lib/data/subclasses";
import { RaceTrait, CatalogSubclass } from "src/lib/builder/types";
import { SUBCLASS_SPELLS } from "src/lib/data/subclass-spells";

export { SUBCLASSES };

// The subclasses offered for a given class (by class index), in catalog order.
export const subclassesForClass = (classIndex?: string): CatalogSubclass[] =>
  classIndex ? SUBCLASSES.filter((s) => s.classIndex === classIndex) : [];

// Look up a subclass by (class index, subclass name) — Character stores the
// subclass by name.
export const getSubclassByName = (
  classIndex?: string,
  name?: string,
): CatalogSubclass | undefined =>
  classIndex && name
    ? SUBCLASSES.find((s) => s.classIndex === classIndex && s.name === name)
    : undefined;

// Feature prose a subclass confers on reaching `level`; empty for levels it
// grants nothing at.
export const subclassFeaturesAt = (
  classIndex?: string,
  name?: string,
  level?: number,
): RaceTrait[] =>
  (level != null
    ? getSubclassByName(classIndex, name)?.levelFeatures?.[level]
    : undefined) ?? [];

// Spell indices a subclass grants by `level`: every tier at or below it
// (e.g. an oath's spells unlock at 3/5/9/13/17), cumulative so a jump in
// levels doesn't skip a tier.
export const subclassSpellIndicesAt = (
  classIndex?: string,
  name?: string,
  level?: number,
): string[] => {
  if (level == null || !classIndex || !name) return [];
  const tiersOf = (table?: Record<number, string[]>): string[] =>
    table
      ? Object.entries(table)
          .filter(([lvl]) => level >= Number(lvl))
          .flatMap(([, indices]) => indices)
      : [];
  // Inline `grants.spellIndicesByLevel` plus the per-class registry.
  return [
    ...tiersOf(
      getSubclassByName(classIndex, name)?.grants?.spellIndicesByLevel,
    ),
    ...tiersOf(SUBCLASS_SPELLS[classIndex]?.[name]),
  ];
};
