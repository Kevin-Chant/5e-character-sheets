import classData from "src/lib/data/srd-classes.json";
import { NONSRD_CLASSES } from "src/lib/data/nonsrd-classes";
import { SrdClass } from "src/lib/builder/types";

// The bundled SRD classes plus the hand-authored official classes from other
// books (currently the Artificer).
export const SRD_CLASSES = [
  ...(classData as unknown as SrdClass[]),
  ...NONSRD_CLASSES,
];

const BY_INDEX = new Map(SRD_CLASSES.map((c) => [c.index, c]));

export const getSrdClass = (index?: string): SrdClass | undefined =>
  index ? BY_INDEX.get(index) : undefined;

// The API attaches a level-1 spellcasting block even to classes that only begin
// casting at level 2 (Paladin/Ranger) — with zero cantrips and zero slots.
// Treat a class as a level-1 caster only when it actually gets something.
export const castsAtLevelOne = (klass?: SrdClass): boolean =>
  !!klass?.spellcasting &&
  (klass.spellcasting.cantripsKnown > 0 || klass.spellcasting.slotsLevel1 > 0);
