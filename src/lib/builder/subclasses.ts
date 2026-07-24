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
