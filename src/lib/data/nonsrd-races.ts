import { REAL_SKILLS, SkillName, StatKey } from "src/lib/data/data-definitions";
import { SrdRace } from "src/lib/builder/types";

// Official 5e races that live outside the open-license SRD (Volo's Guide,
// Mordenkainen's Tome / Monsters of the Multiverse, Eberron, Ravnica, Theros,
// the Feywild books, …). They are merged into `SRD_RACES` at load time by
// `srd-races.ts`, so they surface in the guided builder alongside the SRD races.
//
// As with `phb-subraces.ts`, only mechanical facts are stored (ability bonuses,
// speed, proficiencies, the *names* of racial traits) and the trait details are
// original short summaries, never the published prose. Racial spellcasting is
// described in trait text rather than auto-added to the sheet — consistent with
// how the SRD High Elf's cantrip is handled today.
//
// A few post-2020 races (Fairy, Harengon, Owlin) only ever printed fully
// "floating" ability increases. We seed a thematic default here; the builder's
// ability step lets the player reassign racial bonuses freely (modern
// floating-bonus rules), so nothing is lost.

const noProf = () => ({
  armor: [] as string[],
  weapons: [] as string[],
  tools: [] as string[],
  skills: [] as SkillName[],
});

export const NONSRD_RACES: SrdRace[] = [
  // ---------------------------------------------------------------- Volo's
  {
    index: "aasimar",
    name: "Aasimar",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.cha, bonus: 2 }],
    languages: ["Common", "Celestial"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light (shades of grey).",
      },
      {
        title: "Celestial Resistance",
        detail: "You have resistance to necrotic damage and radiant damage.",
      },
      {
        title: "Healing Hands",
        detail:
          "As an action, you can touch a creature and heal it a number of hit points equal to your level, once per long rest.",
      },
      {
        title: "Light Bearer",
        detail:
          "You know the Light cantrip, using Charisma as your spellcasting ability.",
      },
    ],
    subraces: [
      {
        index: "protector-aasimar",
        name: "Protector Aasimar",
        abilityBonuses: [{ stat: StatKey.wis, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Radiant Soul",
            detail:
              "From 3rd level, as an action you can sprout wings for 1 minute, gaining a 30-foot fly speed and extra radiant damage on one attack or spell each turn. Once per long rest.",
          },
        ],
      },
      {
        index: "scourge-aasimar",
        name: "Scourge Aasimar",
        abilityBonuses: [{ stat: StatKey.con, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Radiant Consumption",
            detail:
              "From 3rd level, as an action you can unleash searing light for 1 minute, dealing radiant damage to nearby creatures (and yourself) each turn. Once per long rest.",
          },
        ],
      },
      {
        index: "fallen-aasimar",
        name: "Fallen Aasimar",
        abilityBonuses: [{ stat: StatKey.str, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Necrotic Shroud",
            detail:
              "From 3rd level, as an action you can manifest skeletal wings for 1 minute, frightening nearby foes and adding necrotic damage to one attack or spell each turn. Once per long rest.",
          },
        ],
      },
    ],
  },
  {
    index: "firbolg",
    name: "Firbolg",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.wis, bonus: 2 },
      { stat: StatKey.str, bonus: 1 },
    ],
    languages: ["Common", "Elvish", "Giant"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Firbolg Magic",
        detail:
          "You can cast Detect Magic and Disguise Self with this trait, once each per short or long rest, using Wisdom.",
      },
      {
        title: "Hidden Step",
        detail:
          "As a bonus action you can turn invisible until the start of your next turn (or until you attack, cast a spell, or force a save). Once per short or long rest.",
      },
      {
        title: "Powerful Build",
        detail:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        title: "Speech of Beast and Leaf",
        detail:
          "You can communicate simple ideas to beasts and plants, and have advantage on Charisma checks to influence them.",
      },
    ],
    subraces: [],
  },
  {
    index: "goliath",
    name: "Goliath",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.con, bonus: 1 },
    ],
    languages: ["Common", "Giant"],
    proficiencies: { ...noProf(), skills: [SkillName.Athletics] },
    traits: [
      {
        title: "Natural Athlete",
        detail: "You have proficiency in the Athletics skill.",
      },
      {
        title: "Stone's Endurance",
        detail:
          "When you take damage, you can use your reaction to roll a d12 and reduce the damage by that roll plus your Constitution modifier. Once per short or long rest.",
      },
      {
        title: "Powerful Build",
        detail:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        title: "Mountain Born",
        detail:
          "You have resistance to cold damage and are acclimated to high altitude, including elevations above 20,000 feet.",
      },
    ],
    subraces: [],
  },
  {
    index: "kenku",
    name: "Kenku",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Auran"],
    skillChoices: {
      choose: 2,
      from: [
        SkillName.Acrobatics,
        SkillName.Deception,
        SkillName.Stealth,
        SkillName["Sleight of Hand"],
      ],
    },
    proficiencies: noProf(),
    traits: [
      {
        title: "Expert Forgery",
        detail:
          "You have advantage on checks made to produce forgeries or duplicate objects and craftwork you have seen.",
      },
      {
        title: "Mimicry",
        detail:
          "You can mimic sounds you have heard, including voices. A listener can tell they are imitations with a successful Insight check contested by your Deception check.",
      },
    ],
    subraces: [],
  },
  {
    index: "lizardfolk",
    name: "Lizardfolk",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.con, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Draconic"],
    skillChoices: {
      choose: 2,
      from: [
        SkillName["Animal Handling"],
        SkillName.Nature,
        SkillName.Perception,
        SkillName.Stealth,
        SkillName.Survival,
      ],
    },
    proficiencies: noProf(),
    traits: [
      {
        title: "Bite",
        detail:
          "Your fanged maw is a natural weapon that deals 1d6 + Strength piercing damage on an unarmed strike.",
      },
      {
        title: "Natural Armor",
        detail:
          "When you aren't wearing armor, your AC equals 13 + your Dexterity modifier. A shield still benefits you normally.",
      },
      {
        title: "Hold Breath",
        detail: "You can hold your breath for up to 15 minutes at a time.",
      },
      {
        title: "Hungry Jaws",
        detail:
          "As a bonus action you can make a special bite attack; on a hit you gain temporary hit points equal to your Constitution modifier. Once per short or long rest.",
      },
    ],
    subraces: [],
  },
  {
    index: "tabaxi",
    name: "Tabaxi",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.cha, bonus: 1 },
    ],
    languages: ["Common"],
    languageChoices: 1,
    proficiencies: {
      ...noProf(),
      skills: [SkillName.Perception, SkillName.Stealth],
    },
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Feline Agility",
        detail:
          "When you move on your turn in combat, you can double your speed until the end of the turn. You can't use it again until you move 0 feet on a turn.",
      },
      {
        title: "Cat's Claws",
        detail:
          "You have a climbing speed of 20 feet, and your claws are natural weapons dealing 1d4 + Strength slashing damage on an unarmed strike.",
      },
      {
        title: "Cat's Talent",
        detail: "You have proficiency in the Perception and Stealth skills.",
      },
    ],
    subraces: [],
  },
  {
    index: "triton",
    name: "Triton",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 1 },
      { stat: StatKey.con, bonus: 1 },
      { stat: StatKey.cha, bonus: 1 },
    ],
    languages: ["Common", "Primordial"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Amphibious",
        detail:
          "You can breathe air and water, and you have a swimming speed of 30 feet.",
      },
      {
        title: "Control Air and Water",
        detail:
          "You can cast Fog Cloud with this trait. At 3rd level you can cast Gust of Wind, and at 5th level Wall of Water, each once per long rest, using Charisma.",
      },
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Emissary of the Sea",
        detail:
          "You can communicate simple ideas to beasts that can breathe water.",
      },
      {
        title: "Guardians of the Depths",
        detail:
          "You have resistance to cold damage and ignore the drawbacks of a deep, underwater environment.",
      },
    ],
    subraces: [],
  },
  {
    index: "bugbear",
    name: "Bugbear",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.dex, bonus: 1 },
    ],
    languages: ["Common", "Goblin"],
    proficiencies: { ...noProf(), skills: [SkillName.Stealth] },
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Long-Limbed",
        detail:
          "When you make a melee attack on your turn, your reach for it is 5 feet greater than normal.",
      },
      {
        title: "Powerful Build",
        detail:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        title: "Sneaky",
        detail: "You are proficient in the Stealth skill.",
      },
      {
        title: "Surprise Attack",
        detail:
          "If you surprise a creature and hit it in the first round of combat, the attack deals an extra 2d6 damage.",
      },
    ],
    subraces: [],
  },
  {
    index: "goblin",
    name: "Goblin",
    size: "Small",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.con, bonus: 1 },
    ],
    languages: ["Common", "Goblin"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Fury of the Small",
        detail:
          "When you damage a creature larger than you, you can deal extra damage equal to your level. Once per short or long rest.",
      },
      {
        title: "Nimble Escape",
        detail:
          "You can take the Disengage or Hide action as a bonus action on each of your turns.",
      },
    ],
    subraces: [],
  },
  {
    index: "hobgoblin",
    name: "Hobgoblin",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.con, bonus: 2 },
      { stat: StatKey.int, bonus: 1 },
    ],
    languages: ["Common", "Goblin"],
    proficiencies: {
      armor: ["Light Armor"],
      weapons: [],
      tools: [],
      skills: [],
    },
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Martial Training",
        detail:
          "You are proficient with light armor and with two martial weapons of your choice.",
      },
      {
        title: "Saving Face",
        detail:
          "After you miss with an attack, save, or ability check, you can add a bonus (up to +5) equal to the number of allies you can see within 30 feet. Once per short or long rest.",
      },
    ],
    subraces: [],
  },
  {
    index: "kobold",
    name: "Kobold",
    size: "Small",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.str, bonus: -2 },
    ],
    languages: ["Common", "Draconic"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Grovel, Cower, and Beg",
        detail:
          "As an action you can cower to distract foes; allies gain advantage on attacks against enemies within 10 feet of you until the end of your turn. Once per short or long rest.",
      },
      {
        title: "Pack Tactics",
        detail:
          "You have advantage on an attack roll against a creature if at least one of your allies is within 5 feet of it and isn't incapacitated.",
      },
      {
        title: "Sunlight Sensitivity",
        detail:
          "You have disadvantage on attack rolls and on Perception checks relying on sight while you or your target is in direct sunlight.",
      },
    ],
    subraces: [],
  },
  {
    index: "orc",
    name: "Orc",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.con, bonus: 1 },
    ],
    languages: ["Common", "Orc"],
    skillChoices: {
      choose: 1,
      from: [
        SkillName["Animal Handling"],
        SkillName.Insight,
        SkillName.Intimidation,
        SkillName.Medicine,
        SkillName.Nature,
        SkillName.Perception,
        SkillName.Survival,
      ],
    },
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Aggressive",
        detail:
          "As a bonus action you can move up to your speed toward an enemy you can see or hear.",
      },
      {
        title: "Powerful Build",
        detail:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        title: "Primal Intuition",
        detail:
          "You gain proficiency in one skill of your choice from a short list of primal skills.",
      },
    ],
    subraces: [],
  },
  {
    index: "yuan-ti-pureblood",
    name: "Yuan-ti Pureblood",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.cha, bonus: 2 },
      { stat: StatKey.int, bonus: 1 },
    ],
    languages: ["Common", "Abyssal", "Draconic"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Innate Spellcasting",
        detail:
          "You know the Poison Spray cantrip and can cast Animal Friendship (on snakes) at will. At 3rd level you can cast Suggestion once per long rest, using Charisma.",
      },
      {
        title: "Magic Resistance",
        detail:
          "You have advantage on saving throws against spells and other magical effects.",
      },
      {
        title: "Poison Immunity",
        detail: "You are immune to poison damage and the poisoned condition.",
      },
    ],
    subraces: [],
  },
  // --------------------------------------------- Elemental Evil / settings
  {
    index: "genasi",
    name: "Genasi",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.con, bonus: 2 }],
    languages: ["Common", "Primordial"],
    proficiencies: noProf(),
    traits: [],
    subraces: [
      {
        index: "air-genasi",
        name: "Air Genasi",
        abilityBonuses: [{ stat: StatKey.dex, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Unending Breath",
            detail:
              "You can hold your breath indefinitely while you're not incapacitated.",
          },
          {
            title: "Mingle with the Wind",
            detail:
              "You can cast Levitate on yourself once per long rest, using Constitution.",
          },
        ],
      },
      {
        index: "earth-genasi",
        name: "Earth Genasi",
        abilityBonuses: [{ stat: StatKey.str, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Earth Walk",
            detail:
              "You can move across difficult terrain made of earth or stone without spending extra movement.",
          },
          {
            title: "Merge with Stone",
            detail:
              "You can cast Pass Without Trace once per long rest, using Constitution.",
          },
        ],
      },
      {
        index: "fire-genasi",
        name: "Fire Genasi",
        abilityBonuses: [{ stat: StatKey.int, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Darkvision",
            detail:
              "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
          },
          {
            title: "Fire Resistance",
            detail: "You have resistance to fire damage.",
          },
          {
            title: "Reach to the Blaze",
            detail:
              "You know the Produce Flame cantrip. At 3rd level you can cast Burning Hands once per long rest, using Constitution.",
          },
        ],
      },
      {
        index: "water-genasi",
        name: "Water Genasi",
        abilityBonuses: [{ stat: StatKey.wis, bonus: 1 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Acid Resistance",
            detail: "You have resistance to acid damage.",
          },
          {
            title: "Amphibious",
            detail:
              "You can breathe air and water, and you have a swimming speed of 30 feet.",
          },
          {
            title: "Call to the Wave",
            detail:
              "You know the Shape Water cantrip. At 3rd level you can cast Create or Destroy Water once per long rest, using Constitution.",
          },
        ],
      },
    ],
  },
  {
    index: "aarakocra",
    name: "Aarakocra",
    size: "Medium",
    speed: 25,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Aarakocra", "Auran"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Flight",
        detail:
          "You have a flying speed of 50 feet. You can't fly while wearing medium or heavy armor.",
      },
      {
        title: "Talons",
        detail:
          "Your talons are natural weapons dealing 1d4 + Strength slashing damage on an unarmed strike.",
      },
    ],
    subraces: [],
  },
  {
    index: "tortle",
    name: "Tortle",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Aquan"],
    proficiencies: { ...noProf(), skills: [SkillName.Survival] },
    traits: [
      {
        title: "Claws",
        detail:
          "Your claws are natural weapons dealing 1d4 + Strength slashing damage on an unarmed strike.",
      },
      {
        title: "Hold Breath",
        detail: "You can hold your breath for up to 1 hour at a time.",
      },
      {
        title: "Natural Armor",
        detail:
          "Your shell gives you a base AC of 17 (your Dexterity modifier doesn't affect this number). You can't wear body armor, but a shield still helps.",
      },
      {
        title: "Shell Defense",
        detail:
          "As an action you can withdraw into your shell, gaining +4 AC and advantage on Strength and Constitution saves while prone, speed 0, and disadvantage on Dexterity saves.",
      },
      {
        title: "Survival Instinct",
        detail: "You have proficiency in the Survival skill.",
      },
    ],
    subraces: [],
  },
  // ------------------------------------------- Mordenkainen's / planar
  {
    index: "gith",
    name: "Gith",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.int, bonus: 1 }],
    languages: ["Common", "Gith"],
    proficiencies: noProf(),
    traits: [],
    subraces: [
      {
        index: "githyanki",
        name: "Githyanki",
        abilityBonuses: [{ stat: StatKey.str, bonus: 2 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Decadent Mastery",
            detail:
              "You gain proficiency in one skill or tool of your choice and learn one extra language.",
          },
          {
            title: "Martial Prodigy",
            detail:
              "You are proficient with light and medium armor and with shortswords, longswords, and greatswords.",
          },
          {
            title: "Githyanki Psionics",
            detail:
              "You know the Mage Hand cantrip (invisible hand). At 3rd level you can cast Jump, and at 5th level Misty Step, each once per long rest, using Intelligence.",
          },
        ],
      },
      {
        index: "githzerai",
        name: "Githzerai",
        abilityBonuses: [{ stat: StatKey.wis, bonus: 2 }],
        proficiencies: noProf(),
        traits: [
          {
            title: "Mental Discipline",
            detail:
              "You have advantage on saving throws against the charmed and frightened conditions.",
          },
          {
            title: "Githzerai Psionics",
            detail:
              "You know the Mage Hand cantrip (invisible hand). At 3rd level you can cast Shield, and at 5th level Detect Thoughts, each once per long rest, using Wisdom.",
          },
        ],
      },
    ],
  },
  // ----------------------------------------------------------- Eberron
  {
    index: "warforged",
    name: "Warforged",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.con, bonus: 2 }],
    abilityBonusOptions: {
      choose: 1,
      from: [StatKey.str, StatKey.dex, StatKey.int, StatKey.wis, StatKey.cha],
    },
    languages: ["Common"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Constructed Resilience",
        detail:
          "You have advantage on saves against poison and resistance to poison damage, don't need to eat/drink/breathe or sleep, and are immune to disease and to magic that puts you to sleep.",
      },
      {
        title: "Sentry's Rest",
        detail:
          "When you take a long rest, you spend at least six hours in an inactive, motionless state rather than sleeping, remaining semiconscious.",
      },
      {
        title: "Integrated Protection",
        detail:
          "Your body has built-in defensive layers: you gain +1 to AC, and armor you wear becomes part of you (donned/doffed only over an hour).",
      },
      {
        title: "Specialized Design",
        detail:
          "You gain one skill proficiency and one tool proficiency of your choice.",
      },
    ],
    subraces: [],
  },
  {
    index: "changeling",
    name: "Changeling",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.cha, bonus: 2 }],
    abilityBonusOptions: {
      choose: 1,
      from: [StatKey.str, StatKey.dex, StatKey.con, StatKey.int, StatKey.wis],
    },
    languages: ["Common"],
    languageChoices: 2,
    proficiencies: noProf(),
    traits: [
      {
        title: "Shapechanger",
        detail:
          "As an action you can change your appearance and voice to that of any humanoid of roughly your size that you've seen. You revert if you die.",
      },
      {
        title: "Changeling Instincts",
        detail:
          "You gain proficiency in two of the following skills: Deception, Insight, Intimidation, and Persuasion.",
      },
    ],
    subraces: [],
  },
  {
    index: "kalashtar",
    name: "Kalashtar",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.wis, bonus: 2 },
      { stat: StatKey.cha, bonus: 1 },
    ],
    languages: ["Common", "Quori"],
    languageChoices: 1,
    proficiencies: noProf(),
    traits: [
      {
        title: "Dual Mind",
        detail: "You have advantage on all Wisdom saving throws.",
      },
      {
        title: "Mental Discipline",
        detail: "You have resistance to psychic damage.",
      },
      {
        title: "Mind Link",
        detail:
          "You can speak telepathically to any creature you can see within a number of feet equal to ten times your level.",
      },
      {
        title: "Severed from Dreams",
        detail:
          "You are immune to magic that lets others sense your emotions or read your thoughts, and to spells that rely on dreams.",
      },
    ],
    subraces: [],
  },
  {
    index: "shifter",
    name: "Shifter",
    size: "Medium",
    speed: 30,
    abilityBonuses: [],
    languages: ["Common"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Shifting",
        detail:
          "As a bonus action you can assume a more bestial form for 1 minute, gaining temporary hit points equal to twice your proficiency bonus (minimum 2) plus a benefit from your shifter type. Uses equal to your proficiency bonus per long rest.",
      },
    ],
    subraces: [
      {
        index: "beasthide-shifter",
        name: "Beasthide",
        abilityBonuses: [
          { stat: StatKey.con, bonus: 2 },
          { stat: StatKey.str, bonus: 1 },
        ],
        proficiencies: noProf(),
        traits: [
          {
            title: "Beasthide Shifting",
            detail:
              "While shifted you gain an extra 1d6 temporary hit points and a +1 bonus to AC.",
          },
        ],
      },
      {
        index: "longtooth-shifter",
        name: "Longtooth",
        abilityBonuses: [
          { stat: StatKey.str, bonus: 2 },
          { stat: StatKey.dex, bonus: 1 },
        ],
        proficiencies: noProf(),
        traits: [
          {
            title: "Longtooth Shifting",
            detail:
              "While shifted you can make a bonus-action bite dealing 1d6 + Strength piercing damage.",
          },
        ],
      },
      {
        index: "swiftstride-shifter",
        name: "Swiftstride",
        abilityBonuses: [
          { stat: StatKey.dex, bonus: 2 },
          { stat: StatKey.cha, bonus: 1 },
        ],
        proficiencies: noProf(),
        traits: [
          {
            title: "Swiftstride Shifting",
            detail:
              "While shifted your walking speed increases by 10 feet, and you can move up to 10 feet as a reaction when a creature ends its turn within 5 feet of you.",
          },
        ],
      },
      {
        index: "wildhunt-shifter",
        name: "Wildhunt",
        abilityBonuses: [
          { stat: StatKey.wis, bonus: 2 },
          { stat: StatKey.dex, bonus: 1 },
        ],
        proficiencies: noProf(),
        traits: [
          {
            title: "Wildhunt Shifting",
            detail:
              "While shifted you have advantage on Wisdom checks, and no attack roll against you can gain advantage while you're within 30 feet and not incapacitated.",
          },
        ],
      },
    ],
  },
  // ------------------------------------------------------------- Ravnica
  {
    index: "centaur",
    name: "Centaur",
    size: "Medium",
    speed: 40,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Sylvan"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Charge",
        detail:
          "If you move at least 30 feet straight toward a target and then hit it with a melee attack on the same turn, you can immediately make a hooves attack as a bonus action.",
      },
      {
        title: "Hooves",
        detail:
          "Your hooves are natural weapons dealing 1d4 + Strength bludgeoning damage on an unarmed strike.",
      },
      {
        title: "Equine Build",
        detail:
          "You count as one size larger for carrying capacity, and climbing that costs extra movement costs you 4 extra feet per foot instead of the usual amount.",
      },
      {
        title: "Survivor",
        detail:
          "You have proficiency in one of the following skills of your choice: Animal Handling, Medicine, Nature, or Survival.",
      },
    ],
    subraces: [],
  },
  {
    index: "loxodon",
    name: "Loxodon",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.con, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Loxodon"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Powerful Build",
        detail:
          "You count as one size larger when determining your carrying capacity and the weight you can push, drag, or lift.",
      },
      {
        title: "Loxodon Serenity",
        detail:
          "You have advantage on saving throws against being charmed or frightened.",
      },
      {
        title: "Natural Armor",
        detail:
          "When you aren't wearing armor, your AC equals 12 + your Constitution modifier. A shield still benefits you normally.",
      },
      {
        title: "Trunk",
        detail:
          "You can grasp, lift, and manipulate objects with your trunk, use it to make unarmed strikes, and smell keenly with it.",
      },
      {
        title: "Keen Smell",
        detail:
          "You have advantage on Perception, Investigation, and Survival checks that rely on smell.",
      },
    ],
    subraces: [],
  },
  {
    index: "minotaur",
    name: "Minotaur",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.str, bonus: 2 },
      { stat: StatKey.con, bonus: 1 },
    ],
    languages: ["Common", "Minotaur"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Horns",
        detail:
          "Your horns are natural weapons dealing 1d6 + Strength piercing damage on an unarmed strike.",
      },
      {
        title: "Goring Rush",
        detail:
          "When you use the Dash action and move at least 20 feet, you can make one horns attack as a bonus action.",
      },
      {
        title: "Hammering Horns",
        detail:
          "When you hit a creature with a melee attack on your turn, you can use a bonus action to try to shove it up to 10 feet away.",
      },
      {
        title: "Imposing Presence",
        detail:
          "You have proficiency in the Intimidation or Persuasion skill (your choice).",
      },
    ],
    subraces: [],
  },
  {
    index: "simic-hybrid",
    name: "Simic Hybrid",
    size: "Medium",
    speed: 30,
    abilityBonuses: [{ stat: StatKey.con, bonus: 2 }],
    abilityBonusOptions: {
      choose: 1,
      from: [StatKey.str, StatKey.dex, StatKey.int, StatKey.wis, StatKey.cha],
    },
    languages: ["Common", "Elvish"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Animal Enhancement",
        detail:
          "You gain one grafted animal adaptation of your choice (such as a limited glide, a climb speed, underwater breathing, grappling appendages, natural armor, or an acid spit), with another added at 5th level.",
      },
    ],
    subraces: [],
  },
  {
    index: "vedalken",
    name: "Vedalken",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.int, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common", "Vedalken"],
    languageChoices: 1,
    proficiencies: noProf(),
    traits: [
      {
        title: "Vedalken Dispassion",
        detail:
          "You have advantage on Intelligence, Wisdom, and Charisma saving throws.",
      },
      {
        title: "Tireless Precision",
        detail:
          "When you make an ability check with a skill or tool you're proficient in, roll a d4 and add it to the check.",
      },
      {
        title: "Partially Amphibious",
        detail:
          "You can breathe underwater for up to 1 hour before you must return to breathing air.",
      },
    ],
    subraces: [],
  },
  // ------------------------------------------------------------- Theros
  {
    index: "leonin",
    name: "Leonin",
    size: "Medium",
    speed: 35,
    abilityBonuses: [
      { stat: StatKey.con, bonus: 2 },
      { stat: StatKey.str, bonus: 1 },
    ],
    languages: ["Common", "Leonin"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Claws",
        detail:
          "Your claws are natural weapons dealing 1d4 + Strength slashing damage on an unarmed strike.",
      },
      {
        title: "Hunter's Instincts",
        detail:
          "You have proficiency in one of the following skills of your choice: Athletics, Intimidation, Perception, or Survival.",
      },
      {
        title: "Daunting Roar",
        detail:
          "As a bonus action you can let out a roar; nearby creatures of your choice must succeed on a Wisdom save or be frightened until the end of your next turn. Once per short or long rest.",
      },
    ],
    subraces: [],
  },
  {
    index: "satyr",
    name: "Satyr",
    size: "Medium",
    speed: 35,
    abilityBonuses: [
      { stat: StatKey.cha, bonus: 2 },
      { stat: StatKey.dex, bonus: 1 },
    ],
    languages: ["Common", "Sylvan"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Ram",
        detail:
          "Your horns are natural weapons dealing 1d4 + Strength bludgeoning damage on an unarmed strike.",
      },
      {
        title: "Magic Resistance",
        detail:
          "You have advantage on saving throws against spells and other magical effects.",
      },
      {
        title: "Mirthful Leaps",
        detail:
          "Whenever you make a long or high jump, you can roll a d8 and add the result (in feet) to the distance.",
      },
      {
        title: "Reveler",
        detail:
          "You have proficiency in the Performance and Persuasion skills and with one musical instrument of your choice.",
      },
    ],
    subraces: [],
  },
  // ---------------------------------------------- Feywild / Strixhaven
  {
    index: "fairy",
    name: "Fairy",
    size: "Small",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.cha, bonus: 1 },
    ],
    languages: ["Common", "Sylvan"],
    proficiencies: noProf(),
    traits: [
      {
        title: "Flight",
        detail:
          "You have a flying speed equal to your walking speed. You can't fly while wearing medium or heavy armor.",
      },
      {
        title: "Fairy Magic",
        detail:
          "You know the Druidcraft cantrip. At 3rd level you can cast Faerie Fire, and at 5th level Enlarge/Reduce, each once per long rest, using an ability of your choice (Int, Wis, or Cha).",
      },
      {
        title: "Flexible Ability Increases",
        detail:
          "A fairy's ability score increases are freely assignable; the +2/+1 shown here is a default you can reassign in the ability-score step.",
      },
    ],
    subraces: [],
  },
  {
    index: "harengon",
    name: "Harengon",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common"],
    languageChoices: 1,
    proficiencies: noProf(),
    traits: [
      {
        title: "Hare-Trigger",
        detail: "You can add your proficiency bonus to your initiative rolls.",
      },
      {
        title: "Leporine Senses",
        detail: "You have proficiency in the Perception skill.",
      },
      {
        title: "Lucky Footwork",
        detail:
          "When you fail a Dexterity saving throw, you can use your reaction to roll a d4 and add it to the result, possibly turning the failure into a success.",
      },
      {
        title: "Rabbit Hop",
        detail:
          "As a bonus action you can jump a number of feet equal to five times your proficiency bonus without provoking opportunity attacks. Uses equal to your proficiency bonus per long rest.",
      },
      {
        title: "Flexible Ability Increases",
        detail:
          "A harengon's ability score increases are freely assignable; the +2/+1 shown here is a default you can reassign in the ability-score step.",
      },
    ],
    subraces: [],
  },
  {
    index: "owlin",
    name: "Owlin",
    size: "Medium",
    speed: 30,
    abilityBonuses: [
      { stat: StatKey.dex, bonus: 2 },
      { stat: StatKey.wis, bonus: 1 },
    ],
    languages: ["Common"],
    languageChoices: 1,
    proficiencies: { ...noProf(), skills: [SkillName.Stealth] },
    traits: [
      {
        title: "Darkvision",
        detail:
          "You can see in dim light within 120 feet as if it were bright light, and in darkness as if it were dim light.",
      },
      {
        title: "Flight",
        detail:
          "You have a flying speed equal to your walking speed. You can't fly while wearing medium or heavy armor.",
      },
      {
        title: "Silent Feathers",
        detail: "You have proficiency in the Stealth skill.",
      },
      {
        title: "Flexible Ability Increases",
        detail:
          "An owlin's ability score increases are freely assignable; the +2/+1 shown here is a default you can reassign in the ability-score step.",
      },
    ],
    subraces: [],
  },
  // ------------------------------------------------------------- Tasha's
  {
    index: "custom-lineage",
    name: "Custom Lineage",
    size: "Medium",
    speed: 30,
    // A single +2 the player assigns; seeded onto STR and reassignable like
    // every other racial bonus.
    abilityBonuses: [{ stat: StatKey.str, bonus: 2 }],
    languages: ["Common"],
    languageChoices: 1,
    // RAW this is "darkvision 60 ft OR one skill proficiency". The sheet offers
    // the skill and names darkvision in the trait text — set it under Senses if
    // that's the pick instead.
    skillChoices: { choose: 1, from: REAL_SKILLS },
    grantsFeat: true,
    proficiencies: noProf(),
    traits: [
      {
        title: "Custom Lineage Traits",
        detail:
          "One ability score increases by 2. You gain either darkvision out to 60 feet or one skill proficiency, plus one feat. Your size is Small or Medium (your choice).",
      },
    ],
    subraces: [],
  },
];
