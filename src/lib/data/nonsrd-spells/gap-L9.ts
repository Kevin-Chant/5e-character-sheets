import { DamageType, StatKey } from "src/lib/data/data-definitions";
import { auto, saveHalf, spellMech } from "src/lib/spells/nonsrd-mechanics";
import type { CatalogSpell } from "src/lib/spells/spell-catalog";

// Completeness-audit gap fill: official (non-UA) level-9 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L9: CatalogSpell[] = [
  {
    index: "ravenous-void",
    name: "Ravenous Void",
    level: 9,
    school: "Evocation",
    castingTime: "1 action",
    range: "1,000 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    ritual: false,
    verbal: true,
    somatic: true,
    material: "A small, nine-pointed star made of iron.",
    classes: ["Wizard"],
    save: "STR",
    damageType: "Force",
    baseDamage: "5d10",
    areaOfEffect: "20-foot-radius sphere",
    desc: "Conjures a collapsing gravitational sphere: the sphere and a surrounding 100-foot band become difficult terrain, and each turn every creature within 100 feet must succeed a Strength save or be dragged toward the center. Any creature that enters the sphere itself, or starts its turn there, automatically takes force damage and is restrained until it escapes the sphere (a Strength check against the caster's spell save DC frees it or another restrained creature within reach). A creature reduced to 0 hit points inside the sphere, along with its nonmagical gear, is destroyed outright.",
    // The pull-in Strength save (STR, above) only gates whether a creature
    // gets dragged toward the center; the 5d10 hits automatically once
    // something is inside the sphere, so the modeled resolution is `auto()`.
    // No upcast scaling since this is a fixed 9th-level spell.
    mechanics: spellMech({
      level: 9,
      resolution: auto(),
      damage: [{ type: DamageType.Force, base: "5d10" }],
    }),
  },
  {
    index: "time-ravage",
    name: "Time Ravage",
    level: 9,
    school: "Necromancy",
    castingTime: "1 action",
    range: "90 feet",
    duration: "Instantaneous",
    concentration: false,
    ritual: false,
    verbal: true,
    somatic: true,
    material:
      "An hourglass filled with diamond dust worth at least 5,000 gp, which the spell consumes.",
    classes: ["Wizard"],
    save: "CON",
    damageType: "Necrotic",
    baseDamage: "10d12",
    desc: "Wrenches a single target through decades of aging in an instant. On a failed save the target takes necrotic damage and is aged so that only 30 days of natural life remain, suffering disadvantage on attack rolls, ability checks, and saving throws plus halved speed for the rest of its shortened life; a successful save halves the damage and avoids the aging. Only a wish spell, or greater restoration cast with a 9th-level slot, can undo the aging.",
    mechanics: spellMech({
      level: 9,
      resolution: saveHalf(StatKey.con),
      damage: [{ type: DamageType.Necrotic, base: "10d12" }],
    }),
  },
];
