import { SUBCLASSES } from "src/lib/data/subclasses";
import { RaceTrait, SrdSubclass } from "src/lib/builder/types";

export { SUBCLASSES };

// The subclasses offered for a given class (by class index), in catalog order.
export const subclassesForClass = (classIndex?: string): SrdSubclass[] =>
  classIndex ? SUBCLASSES.filter((s) => s.classIndex === classIndex) : [];

// Look up a subclass by the (class index, subclass name) pair. The character
// stores the subclass by *name*, so this is how the build path recovers its
// mechanics.
export const getSubclassByName = (
  classIndex?: string,
  name?: string,
): SrdSubclass | undefined =>
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
  const table = getSubclassByName(classIndex, name)?.grants
    ?.spellIndicesByLevel;
  if (!table || level == null) return [];
  return Object.entries(table)
    .filter(([lvl]) => level >= Number(lvl))
    .flatMap(([, indices]) => indices);
};
