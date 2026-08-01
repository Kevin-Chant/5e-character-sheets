import { DamageType, StatKey } from "src/lib/data/data-definitions";
import type { CatalogSpell } from "src/lib/spells/spell-catalog";
import { saveHalf, spellMech } from "src/lib/spells/nonsrd-mechanics";

// Completeness-audit gap fill: official (non-UA) level-8 spells the initial
// authoring pass missed (the mega-page enumeration was lossy). Mechanical facts
// with ORIGINAL paraphrased descriptions only — never published prose.
export const GAP_SPELLS_L8: CatalogSpell[] = [
  {
    index: "dark-star",
    name: "Dark Star",
    level: 8,
    school: "Evocation",
    castingTime: "1 action",
    range: "150 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    ritual: false,
    verbal: true,
    somatic: true,
    material: "A shard of onyx and a drop of the caster's blood, consumed.",
    classes: ["Wizard"],
    save: "CON",
    damageType: "Force",
    baseDamage: "8d10",
    areaOfEffect: "40-foot-radius sphere",
    desc: "Conjures a sphere of crushing gravity and total darkness up to 40 feet across. Nothing inside can be seen through darkvision or lit by mundane light, no sound crosses its boundary, and creatures fully inside are deafened and immune to thunder damage. Anyone who enters the area or starts a turn there takes a heavy load of force damage (half on a successful save); a creature dropped to 0 hit points this way crumbles to dust along with its unshielded gear.",
    mechanics: spellMech({
      level: 8,
      resolution: saveHalf(StatKey.con),
      damage: [{ type: DamageType.Force, base: "8d10" }],
    }),
  },
  {
    index: "reality-break",
    name: "Reality Break",
    level: 8,
    school: "Conjuration",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Concentration, up to 1 minute",
    concentration: true,
    ritual: false,
    verbal: true,
    somatic: true,
    material: "A crystal prism.",
    classes: ["Wizard"],
    save: "WIS",
    desc: "Tears open the fabric between realities around one creature. It must succeed on a Wisdom save or lose the ability to take reactions for the duration; at the start of each of its turns thereafter it suffers one of four random effects — a psychic assault that briefly stuns it, a rending tear that forces a Dexterity save against heavy force damage, a wormhole that flings it up to 30 feet and knocks it prone while dealing force damage, or a void-cold blast that blinds it and deals cold damage. The target may attempt the Wisdom save again at the end of each of its turns to end the effect early.",
    // Damage/resolution varies by an in-spell d10 roll across four distinct
    // effects (different saves, damage types, and conditions) — not a single
    // clean resolution, so no `mechanics` block; see MECH-SPELLS.md guidance
    // on irregular scaling.
  },
];
