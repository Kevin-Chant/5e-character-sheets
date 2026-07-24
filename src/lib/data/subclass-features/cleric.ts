import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each cleric subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const CLERIC_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Arcana: {
    6: [
      {
        title: "Spell Breaker",
        detail:
          "When a spell of 1st level or higher that you cast restores hit points to a creature, you can also end one spell affecting that creature of a level equal to or lower than the slot used.",
      },
    ],
    8: [
      {
        title: "Potent Spellcasting",
        detail:
          "Add your Wisdom modifier to the damage you deal with any cleric cantrip.",
      },
    ],
    17: [
      {
        title: "Arcane Mastery",
        detail:
          "Choose four wizard spells, one each of 6th, 7th, 8th, and 9th level; they are always prepared and count as cleric spells for you.",
      },
    ],
  },
  Death: {
    6: [
      {
        title: "Inescapable Destruction",
        detail:
          "Necrotic damage from your cleric spells and Channel Divinity options now ignores resistance to necrotic damage.",
      },
    ],
    17: [
      {
        title: "Improved Reaper",
        detail:
          "Necromancy spells of 1st through 5th level that normally target only one creature can instead target a second creature within 5 ft. of the first, paying any consumable components separately for each target.",
      },
    ],
  },
  Forge: {
    6: [
      {
        title: "Soul of the Forge",
        detail:
          "While wearing heavy armor, gain resistance to fire damage and a +1 bonus to AC.",
      },
    ],
    17: [
      {
        title: "Saint of Forge and Fire",
        detail:
          "While wearing heavy armor, gain immunity to fire damage and resistance to nonmagical bludgeoning, piercing, and slashing damage.",
      },
    ],
  },
  Grave: {
    6: [
      {
        title: "Sentinel at Death's Door",
        detail:
          "Reaction: turn a critical hit against you or an ally within 30 ft. into a normal hit instead, a number of times equal to your Wisdom modifier (minimum 1) per long rest.",
      },
    ],
    8: [
      {
        title: "Potent Spellcasting",
        detail:
          "Add your Wisdom modifier to the damage you deal with any cleric cantrip.",
      },
    ],
    17: [
      {
        title: "Keeper of Souls",
        detail:
          "Once per turn, when a creature dies within 30 ft. of you, you or an ally within 30 ft. regains hit points equal to that creature's hit dice, as long as you aren't incapacitated.",
      },
    ],
  },
  Knowledge: {
    8: [
      {
        title: "Potent Spellcasting",
        detail:
          "Add your Wisdom modifier to the damage you deal with any cleric cantrip.",
      },
    ],
    17: [
      {
        title: "Visions of the Past",
        detail:
          "Meditate for at least 1 minute (up to your Wisdom score in minutes) to glimpse recent history tied to an object you hold or the area around you.",
      },
    ],
  },
  Life: {
    6: [
      {
        title: "Blessed Healer",
        detail:
          "Whenever a healing spell you cast restores hit points to someone other than you, you also regain 2 plus the spell's level in hit points.",
      },
    ],
    17: [
      {
        title: "Supreme Healing",
        detail:
          "Whenever you would roll dice to restore hit points with a spell, use the maximum possible result on each die instead of rolling.",
      },
    ],
  },
  Light: {
    6: [
      {
        title: "Improved Flare",
        detail:
          "Warding Flare's reaction to impose disadvantage can now also protect an ally within 30 ft. when they're attacked.",
      },
    ],
    8: [
      {
        title: "Potent Spellcasting",
        detail:
          "Add your Wisdom modifier to the damage you deal with any cleric cantrip.",
      },
    ],
    17: [
      {
        title: "Corona of Light",
        detail:
          "As an action, shed bright light in a 60 ft. radius for 1 minute; enemies in that light have disadvantage on saves against your fire or radiant spells.",
      },
    ],
  },
  Nature: {
    6: [
      {
        title: "Dampen Elements",
        detail:
          "Reaction: when you or an ally within 30 ft. takes acid, cold, fire, lightning, or thunder damage, grant resistance to that instance of damage.",
      },
    ],
    17: [
      {
        title: "Master of Nature",
        detail:
          "Creatures charmed by your Charm Animals and Plants can be given commands as a bonus action.",
      },
    ],
  },
  Order: {
    6: [
      {
        title: "Embodiment of the Law",
        detail:
          "A number of times per long rest equal to your Wisdom modifier (minimum 1), cast an enchantment spell using a bonus action instead of its normal casting time, expending a spell slot.",
      },
    ],
    17: [
      {
        title: "Order's Wrath",
        detail:
          "Once per turn, after your Divine Strike hits, curse the target until the start of your next turn; the first ally who hits the cursed creature deals an extra 2d8 psychic damage and ends the curse.",
      },
    ],
  },
  Peace: {
    6: [
      {
        title: "Protective Bond",
        detail:
          "Reaction: when a creature bonded to you via Emboldening Bond takes damage, another bonded creature within 30 ft. can teleport next to it and take that damage instead.",
      },
    ],
    8: [
      {
        title: "Potent Spellcasting",
        detail:
          "Add your Wisdom modifier to the damage you deal with any cleric cantrip.",
      },
    ],
    17: [
      {
        title: "Expansive Bond",
        detail:
          "Emboldening Bond and Protective Bond's ranges extend to 60 ft.; a creature that takes damage via Protective Bond also gains resistance to that damage.",
      },
    ],
  },
  Tempest: {
    6: [
      {
        title: "Thunderbolt Strike",
        detail:
          "Whenever you deal lightning damage to a Large or smaller creature, you can also push it up to 10 ft. away from you.",
      },
    ],
    17: [
      {
        title: "Stormborn",
        detail:
          "Gain a flying speed equal to your walking speed whenever you are outdoors.",
      },
    ],
  },
  Trickery: {
    17: [
      {
        title: "Improved Duplicity",
        detail:
          "Invoke Duplicity now creates up to 4 duplicates, each independently movable up to 30 ft. within 120 ft. of you.",
      },
    ],
  },
  Twilight: {
    6: [
      {
        title: "Steps of Night",
        detail:
          "While in dim light or darkness, spend one of a number of uses equal to your proficiency bonus (recharging on a long rest) as a bonus action to gain a flying speed equal to your walking speed for 1 minute.",
      },
    ],
    17: [
      {
        title: "Twilight Shroud",
        detail:
          "While inside your Twilight Sanctuary sphere, you and your allies have half cover.",
      },
    ],
  },
  War: {
    17: [
      {
        title: "Avatar of Battle",
        detail:
          "Gain resistance to nonmagical bludgeoning, piercing, and slashing damage.",
      },
    ],
  },
};
