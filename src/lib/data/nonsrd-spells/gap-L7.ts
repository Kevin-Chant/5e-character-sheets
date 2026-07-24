import type { SrdSpell } from "src/lib/spells/srd-spells";

// Completeness-audit gap fill: official (non-UA) level-7 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
//
// Level 7 turned out to already be essentially complete (the PHB's 20 spells
// plus the de-branded "Arcane Sword" and the Xanathar's/Tasha's/Fizban's/
// Frostmaiden additions were all already present) — "Tether Essence" (from
// Explorer's Guide to Wildemount) was the one genuine gap found.
export const GAP_SPELLS_L7: SrdSpell[] = [
  {
    index: "tether-essence",
    name: "Tether Essence",
    level: 7,
    school: "Necromancy",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Concentration, up to 1 hour",
    concentration: true,
    ritual: false,
    verbal: true,
    somatic: true,
    material:
      "A spool of platinum cord worth at least 250 gp, which the spell consumes.",
    classes: ["Wizard"],
    save: "CON",
    desc: "Two creatures you can see within range must each succeed on a Constitution save (at disadvantage if they're within 30 feet of each other) or become bound together for the duration, no matter how far apart they end up: whatever damage or healing one of them takes, the other takes or receives too. Either target can choose to fail its save outright. If either bound creature drops to 0 hit points, the link snaps and the spell ends for both.",
  },
];
