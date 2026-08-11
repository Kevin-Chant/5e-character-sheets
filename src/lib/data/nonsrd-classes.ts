import { SkillName, StatKey } from "src/lib/data/data-definitions";
import { CatalogClass } from "src/lib/builder/types";

// Official 5e classes outside the open-license SRD (currently just Artificer).
// Merged into `ALL_CLASSES` at load time; only the level-1 slice is modelled,
// and feature details are original short summaries, not published prose.

export const NONSRD_CLASSES: CatalogClass[] = [
  {
    index: "artificer",
    name: "Artificer",
    hitDie: 8,
    savingThrows: [StatKey.con, StatKey.int],
    skillChoices: {
      choose: 2,
      from: [
        SkillName.Arcana,
        SkillName.History,
        SkillName.Investigation,
        SkillName.Medicine,
        SkillName.Nature,
        SkillName.Perception,
        SkillName["Sleight of Hand"],
      ],
    },
    proficiencies: {
      armor: ["Light Armor", "Medium Armor", "Shields"],
      weapons: ["Simple Weapons"],
      tools: ["Thieves' Tools", "Tinker's Tools"],
      skills: [],
    },
    startingEquipment: ["Thieves' Tools", "Dungeoneer's Pack"],
    startingEquipmentOptions: [
      "(a) any two simple weapons or (b) a light crossbow and 20 bolts",
      "(a) studded leather armor or (b) scale mail",
    ],
    spellcasting: {
      ability: StatKey.int,
      cantripsKnown: 2,
      // Artificers prepare spells rather than tracking a known count.
      spellsKnown: null,
      slotsLevel1: 2,
    },
    subclassAtLevel1: false,
    features: [
      {
        title: "Magical Tinkering",
        detail:
          "Using tinker's tools, you can imbue a tiny object with one of a few minor magical effects (light, a recorded message, a smell, or a static visual). You can maintain a number of these equal to your Intelligence modifier.",
      },
      {
        title: "Spellcasting",
        detail:
          "You have learned to channel magic through tools and infusions. Intelligence is your spellcasting ability, and you always have your prepared spells ready to cast using your tools as a spellcasting focus.",
      },
    ],
  },
];
