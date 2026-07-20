import { SUBCLASSES } from "src/lib/data/subclasses";
import { SrdSubclass } from "src/lib/builder/types";

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
