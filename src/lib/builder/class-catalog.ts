import classData from "src/lib/data/srd-classes.json";
import { NONSRD_CLASSES } from "src/lib/data/nonsrd-classes";
import { CatalogClass } from "src/lib/builder/types";

// The bundled SRD classes plus the hand-authored official classes from other
// books (currently the Artificer).
export const ALL_CLASSES = [
  ...(classData as unknown as CatalogClass[]),
  ...NONSRD_CLASSES,
];

const BY_INDEX = new Map(ALL_CLASSES.map((c) => [c.index, c]));

export const getCatalogClass = (index?: string): CatalogClass | undefined =>
  index ? BY_INDEX.get(index) : undefined;

// Paladin/Ranger carry a level-1 spellcasting block with zero cantrips/slots
// even though casting starts at level 2; treat them as non-casters at 1st.
export const castsAtLevelOne = (klass?: CatalogClass): boolean =>
  !!klass?.spellcasting &&
  (klass.spellcasting.cantripsKnown > 0 || klass.spellcasting.slotsLevel1 > 0);
