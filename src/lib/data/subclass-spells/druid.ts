import { SubclassSpellTable } from "src/lib/data/subclass-spells/types";

// By-level subclass spell grants for druid circles (see ./types). Spell
// indices only — identifiers into the bundled catalog, no prose.
//
// Circle of the Land is deliberately absent: its circle spells depend on the
// chosen terrain, so they live on the `landTerrain` option group in
// chosen-options.ts instead. Circle of Stars grants its two spells once at
// the choice level, so it sits inline in subclasses.ts.
export const DRUID_SUBCLASS_SPELLS: SubclassSpellTable = {
  Spores: {
    2: ["chill-touch"],
    3: ["blindness-deafness", "gentle-repose"],
    5: ["animate-dead", "gaseous-form"],
    7: ["blight", "confusion"],
    9: ["cloudkill", "contagion"],
  },
  Wildfire: {
    2: ["burning-hands", "cure-wounds"],
    3: ["flaming-sphere", "scorching-ray"],
    5: ["plant-growth", "revivify"],
    7: ["aura-of-life", "fire-shield"],
    9: ["flame-strike", "mass-cure-wounds"],
  },
};
