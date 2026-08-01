import type { CatalogSpell } from "src/lib/spells/spell-catalog";

// Completeness-audit gap fill: official (non-UA) level-5 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L5: CatalogSpell[] = [
  {
    index: "temporal-shunt",
    name: "Temporal Shunt",
    level: 5,
    school: "Transmutation",
    castingTime:
      "1 reaction, which you take when a creature you can see makes an attack roll or begins to cast a spell",
    range: "120 feet",
    duration: "1 round",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    classes: ["Wizard"],
    save: "WIS",
    desc: "You knock the triggering creature briefly out of the timestream unless it succeeds on a Wisdom save, causing the attack to miss or the spell to fizzle. The creature vanishes until the start of its next turn, when it reappears in its old space (or the nearest open one) with no memory of the interruption.",
    higherLevel:
      "Using a slot of 6th level or higher lets you target one additional creature, within 30 feet of the first, for each slot level above 5th.",
  },
];
