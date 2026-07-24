import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each cleric subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const CLERIC_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Arcana: {
    2: [
      {
        title: "Channel Divinity: Arcane Abjuration",
        detail:
          "Spend a Channel Divinity use to force a celestial, elemental, fey, or fiend within 30 ft. to make a WIS save; on a failure it is turned (must flee, no reactions) for 1 minute or until it takes damage. Against a low enough CR target at cleric level 5+, it is banished instead.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Touch of Death",
        detail:
          "Spend a Channel Divinity use on a melee hit to deal extra necrotic damage equal to 5 plus twice your cleric level.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Artisan's Blessing",
        detail:
          "Spend a Channel Divinity use and 1 hour to craft a nonmagical metal item worth up to 100 gp, consuming that much raw material.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Path to the Grave",
        detail:
          "Spend a Channel Divinity use to curse a creature within 30 ft.; the next attack against it before the start of your next turn treats it as if it had vulnerability to that damage, then the curse ends.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Knowledge of the Ages",
        detail:
          "Spend a Channel Divinity use to gain proficiency with one skill or tool of your choice for 10 minutes.",
      },
    ],
    6: [
      {
        title: "Channel Divinity: Read Thoughts",
        detail:
          "Spend a Channel Divinity use to force a creature within 60 ft. to make a WIS save; on a failure you read its surface thoughts for 1 minute and can spend your action to cast Suggestion on it without using a spell slot, and it automatically fails the save.",
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
        title: "Visions of the Past",
        detail:
          "Meditate for at least 1 minute (up to your Wisdom score in minutes) to glimpse recent history tied to an object you hold or the area around you.",
      },
    ],
  },
  Life: {
    2: [
      {
        title: "Channel Divinity: Preserve Life",
        detail:
          "Spend a Channel Divinity use to restore hit points totalling five times your cleric level, split among creatures within 30 ft. (up to half each creature's HP maximum); can't target undead or constructs.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Radiance of the Dawn",
        detail:
          "Spend a Channel Divinity use to dispel magical darkness within 30 ft. and force a CON save from hostile creatures in the area, dealing 2d10 plus your cleric level radiant damage (half on a success).",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Charm Animals and Plants",
        detail:
          "Spend a Channel Divinity use to force beasts and plant creatures within 30 ft. to make a WIS save or be charmed toward you for 1 minute (ends early if they take damage).",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Order's Demand",
        detail:
          "Spend a Channel Divinity use to force a WIS save from creatures within 30 ft.; failures are charmed until the end of your next turn (or until they take damage) and can be made to drop what they're holding.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Balm of Peace",
        detail:
          "Spend a Channel Divinity use to move up to your speed without provoking opportunity attacks, healing 2d6 plus your Wisdom modifier hit points (minimum 1) to each creature you come within 5 ft. of along the way, once each.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Destructive Wrath",
        detail:
          "Spend a Channel Divinity use, when you roll lightning or thunder damage, to deal the maximum possible damage instead of rolling.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Invoke Duplicity",
        detail:
          "Spend a Channel Divinity use to create an illusory duplicate of yourself within 30 ft. for up to 1 minute; you can cast spells as if from its space, and you gain advantage on attack rolls against a creature adjacent to both you and the duplicate.",
      },
    ],
    6: [
      {
        title: "Channel Divinity: Cloak of Shadows",
        detail:
          "Spend a Channel Divinity use to become invisible until the end of your next turn (ends early if you attack or cast a spell).",
      },
    ],
    17: [
      {
        title: "Improved Duplicity",
        detail:
          "Invoke Duplicity now creates up to 4 duplicates, each independently movable up to 30 ft. within 120 ft. of you.",
      },
    ],
  },
  Twilight: {
    2: [
      {
        title: "Channel Divinity: Twilight Sanctuary",
        detail:
          "Spend a Channel Divinity use to create a 30 ft. radius dim-light sphere centered on you for 1 minute; creatures that end their turn inside choose either 1d6 plus your cleric level temporary hit points or to end one charmed or frightened effect on themselves.",
      },
    ],
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
    2: [
      {
        title: "Channel Divinity: Guided Strike",
        detail:
          "Spend a Channel Divinity use, after making an attack roll but before knowing the result, to add +10 to it.",
      },
    ],
    6: [
      {
        title: "Channel Divinity: War God's Blessing",
        detail:
          "Reaction: spend a Channel Divinity use to grant +10 to an ally's attack roll within 30 ft., before the result of that roll is known.",
      },
    ],
    17: [
      {
        title: "Avatar of Battle",
        detail:
          "Gain resistance to nonmagical bludgeoning, piercing, and slashing damage.",
      },
    ],
  },
};
