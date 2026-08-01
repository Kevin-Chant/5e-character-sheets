import { SUBCLASSES } from "src/lib/data/subclasses";
import { RaceTrait, CatalogSubclass } from "src/lib/builder/types";
import { SUBCLASS_SPELLS } from "src/lib/data/subclass-spells";

export { SUBCLASSES };

// The subclasses offered for a given class (by class index), in catalog order.
export const subclassesForClass = (classIndex?: string): CatalogSubclass[] =>
  classIndex ? SUBCLASSES.filter((s) => s.classIndex === classIndex) : [];

// Look up a subclass by the (class index, subclass name) pair. The character
// stores the subclass by *name*, so this is how the build path recovers its
// mechanics.
export const getSubclassByName = (
  classIndex?: string,
  name?: string,
): CatalogSubclass | undefined =>
  classIndex && name
    ? SUBCLASSES.find((s) => s.classIndex === classIndex && s.name === name)
    : undefined;

// The feature prose a subclass confers on reaching `level` — the subclass half
// of `classFeaturesAt`. Empty for a class level the subclass grants nothing at,
// which is most of them.
export const subclassFeaturesAt = (
  classIndex?: string,
  name?: string,
  level?: number,
): RaceTrait[] =>
  (level != null
    ? getSubclassByName(classIndex, name)?.levelFeatures?.[level]
    : undefined) ?? [];

// The spell indices a subclass grants by the time `level` is reached: every
// `grants.spellIndicesByLevel` tier at or below it (an oath's spells unlock at
// 3/5/9/13/17). Cumulative, so the builder can grant idempotently every
// level-up without missing a tier reached in one jump.
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
  // Inline `grants.spellIndicesByLevel` plus the per-class registry, which is
  // where most subclass spell lists live (one file per class, for parallel
  // authoring).
  return [
    ...tiersOf(
      getSubclassByName(classIndex, name)?.grants?.spellIndicesByLevel,
    ),
    ...tiersOf(SUBCLASS_SPELLS[classIndex]?.[name]),
  ];
};
