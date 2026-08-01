import type { CatalogSpell } from "src/lib/spells/spell-catalog";
import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { attack, save, spellMech } from "src/lib/spells/nonsrd-mechanics";

// Completeness-audit gap fill: official (non-UA) level-1 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L1: CatalogSpell[] = [
  {
    index: "gift-of-alacrity",
    name: "Gift of Alacrity",
    level: 1,
    school: "Divination",
    castingTime: "1 minute",
    range: "Touch",
    duration: "8 hours",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    classes: ["Wizard"],
    desc: "The caster touches a willing creature, granting it a lingering edge in reacting to danger: for the duration it may add 1d8 to its initiative rolls.",
  },
  {
    index: "magnify-gravity",
    name: "Magnify Gravity",
    level: 1,
    school: "Transmutation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "1 round",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    classes: ["Wizard"],
    save: "CON",
    damageType: "Force",
    baseDamage: "2d8",
    areaOfEffect: "10-foot-radius sphere",
    desc: "Gravity briefly intensifies in a 10-foot-radius sphere the caster can see within range. Each creature caught inside when the spell is cast must make a Constitution save, taking 2d8 force damage and having its speed halved until the end of its next turn on a failure, or half damage and no speed loss on a success. Until the caster's next turn, moving an unattended object in the sphere requires a Strength check against the caster's spell save DC. A higher-level slot adds 1d8 damage per slot level above 1st.",
    mechanics: spellMech({
      level: 1,
      resolution: save(StatKey.con),
      damage: [{ type: DamageType.Force, base: "2d8", scale: "1d8" }],
    }),
  },
  {
    index: "jims-magic-missile",
    name: "Jim's Magic Missile",
    level: 1,
    school: "Evocation",
    castingTime: "1 action",
    range: "120 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    material: "A single gold coin, consumed as a toll for the spell's magic.",
    classes: ["Wizard"],
    damageType: "Force",
    baseDamage: "2d4",
    desc: "Three darts of magical force streak toward chosen targets in range, each requiring a separate ranged spell attack that deals 2d4 force damage on a hit (5d4 instead on a critical hit). If any of the attack rolls comes up a natural 1, every dart instead recoils and strikes the caster for 1 force damage apiece. A higher-level slot creates one more dart, and taxes one more gold piece, per slot level above 1st.",
    mechanics: spellMech({
      level: 1,
      resolution: attack("ranged"),
      damage: [{ type: DamageType.Force, base: "2d4" }],
      instances: 3,
      scaleInstances: 1,
    }),
  },
];
