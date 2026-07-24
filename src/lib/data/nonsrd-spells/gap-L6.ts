import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { saveHalf, spellMech } from "src/lib/spells/nonsrd-mechanics";
import type { SrdSpell } from "src/lib/spells/srd-spells";

// Completeness-audit gap fill: official (non-UA) level-6 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L6: SrdSpell[] = [
  {
    index: "gravity-fissure",
    name: "Gravity Fissure",
    level: 6,
    school: "Evocation",
    castingTime: "1 action",
    range: "Self (100-foot line)",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    material: "a fistful of iron filings",
    classes: ["Wizard"],
    save: "CON",
    damageType: "Force",
    baseDamage: "8d8",
    areaOfEffect: "100-foot line",
    desc: "The caster tears open a gravitational ravine in a line stretching out from them. Anyone caught directly in it must succeed on a Constitution save or take a heavy dose of force damage, half on a success. Creatures within 10 feet of the line but not standing in it face the same save, and on a failure take the full damage and get yanked bodily into the ravine.",
    higherLevel:
      "When cast using a spell slot of 7th level or higher, the damage increases by 1d8 for each slot level above 6th.",
    mechanics: spellMech({
      level: 6,
      resolution: saveHalf(StatKey.con),
      damage: [{ type: DamageType.Force, base: "8d8", scale: "1d8" }],
    }),
  },
];
