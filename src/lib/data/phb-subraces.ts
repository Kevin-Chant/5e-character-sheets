import { StatKey } from "src/lib/data/data-definitions";
import { SrdSubrace } from "src/lib/builder/types";

// Player's Handbook subraces that the open-license SRD omits (the SRD ships
// exactly one subrace per race). Keyed by race index and merged with the SRD
// subraces at load time. As with the backgrounds, only mechanical facts are
// stored and the trait descriptions are original short summaries, not the
// published prose.
export const PHB_SUBRACES: Record<string, SrdSubrace[]> = {
  dwarf: [
    {
      index: "mountain-dwarf",
      name: "Mountain Dwarf",
      abilityBonuses: [{ stat: StatKey.str, bonus: 2 }],
      proficiencies: {
        armor: ["Light Armor", "Medium Armor"],
        weapons: [],
        tools: [],
        skills: [],
      },
      traits: [
        {
          title: "Dwarven Armor Training",
          detail: "You are proficient with light and medium armor.",
        },
      ],
    },
  ],
  elf: [
    {
      index: "wood-elf",
      name: "Wood Elf",
      abilityBonuses: [{ stat: StatKey.wis, bonus: 1 }],
      speed: 35,
      proficiencies: { armor: [], weapons: [], tools: [], skills: [] },
      traits: [
        {
          title: "Fleet of Foot",
          detail: "Your base walking speed increases to 35 feet.",
        },
        {
          title: "Mask of the Wild",
          detail:
            "You can attempt to hide even when only lightly obscured by foliage, rain, snow, mist, or other natural phenomena.",
        },
      ],
    },
    {
      index: "drow",
      name: "Drow (Dark Elf)",
      abilityBonuses: [{ stat: StatKey.cha, bonus: 1 }],
      proficiencies: { armor: [], weapons: [], tools: [], skills: [] },
      traits: [
        {
          title: "Superior Darkvision",
          detail: "Your darkvision has a range of 120 feet.",
        },
        {
          title: "Sunlight Sensitivity",
          detail:
            "You have disadvantage on attack rolls and Perception checks that rely on sight when you, the target, or whatever you're trying to perceive is in direct sunlight.",
        },
        {
          title: "Drow Magic",
          detail:
            "You know the Dancing Lights cantrip. At 3rd level you can cast Faerie Fire once per long rest, and at 5th level Darkness once per long rest, using Charisma.",
        },
        {
          title: "Drow Weapon Training",
          detail:
            "You are proficient with rapiers, shortswords, and hand crossbows.",
        },
      ],
    },
  ],
  halfling: [
    {
      index: "stout-halfling",
      name: "Stout Halfling",
      abilityBonuses: [{ stat: StatKey.con, bonus: 1 }],
      proficiencies: { armor: [], weapons: [], tools: [], skills: [] },
      traits: [
        {
          title: "Stout Resilience",
          detail:
            "You have advantage on saving throws against poison, and resistance against poison damage.",
        },
      ],
    },
  ],
  gnome: [
    {
      index: "forest-gnome",
      name: "Forest Gnome",
      abilityBonuses: [{ stat: StatKey.dex, bonus: 1 }],
      proficiencies: { armor: [], weapons: [], tools: [], skills: [] },
      traits: [
        {
          title: "Natural Illusionist",
          detail: "You know the Minor Illusion cantrip, using Intelligence.",
        },
        {
          title: "Speak with Small Beasts",
          detail:
            "Through sounds and gestures, you can communicate simple ideas with Small or smaller beasts.",
        },
      ],
    },
  ],
};
