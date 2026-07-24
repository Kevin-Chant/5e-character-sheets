import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { saveHalf, spellMech } from "src/lib/spells/nonsrd-mechanics";
import type { SrdSpell } from "src/lib/spells/srd-spells";

// Completeness-audit gap fill: official (non-UA) level-3 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L3: SrdSpell[] = [
  {
    index: "pulse-wave",
    name: "Pulse Wave",
    level: 3,
    school: "Evocation",
    castingTime: "1 action",
    range: "Self (30-foot cone)",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    classes: ["Wizard"],
    save: "CON",
    damageType: "Force",
    baseDamage: "6d6",
    areaOfEffect: "30-foot cone",
    desc: "A wave of force radiates from the caster in a cone, and the caster chooses whether it pulls or pushes: each creature there must succeed on a Constitution save or take force damage (half on a success) and be pulled 15 feet toward the caster or pushed 15 feet away, matching the caster's chosen direction. Unsecured objects in the cone are moved the same way. A higher slot adds 1d6 more damage and 5 more feet of push/pull distance per slot level above 3rd.",
    mechanics: spellMech({
      level: 3,
      resolution: saveHalf(StatKey.con),
      damage: [{ type: DamageType.Force, base: "6d6", scale: "1d6" }],
    }),
  },
];
