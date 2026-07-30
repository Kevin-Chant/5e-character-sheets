import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each bard subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const BARD_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Creation: {
    3: [
      {
        title: "Mote of Potential",
        detail:
          "When a creature spends a Bardic Inspiration die you gave it, an extra effect triggers depending on the roll: on a check, it can reroll and take either result; on an attack, each creature within 5 ft. of the target takes thunder damage equal to the die roll on a failed Constitution save; on a save, it gains temporary hit points equal to the die roll plus your Charisma modifier (minimum 1).",
      },
      // Performance of Creation is a limited-use pool — see SUBCLASS_POOLS["Creation"].
    ],
    6: [
      // Animating Performance is a limited-use pool — see SUBCLASS_POOLS["Creation"].
    ],
    14: [
      {
        title: "Creative Crescendo",
        detail:
          "Performance of Creation can now conjure multiple items at once, up to your Charisma modifier (minimum two), with no limit on their combined value.",
      },
    ],
  },
  Eloquence: {
    3: [
      {
        title: "Silver Tongue",
        detail:
          "Any Persuasion or Deception check you make that rolls 9 or lower on the d20 counts as a 10 instead.",
      },
    ],
    6: [
      {
        title: "Unfailing Inspiration",
        detail:
          "A Bardic Inspiration die that fails to change the outcome of the roll it was added to is not used up.",
      },
      // Universal Speech is a limited-use pool — see SUBCLASS_POOLS["Eloquence"].
    ],
    14: [
      // Infectious Inspiration is a limited-use pool — see SUBCLASS_POOLS["Eloquence"].
    ],
  },
  Glamour: {
    3: [
      {
        title: "Mantle of Inspiration",
        detail:
          "As a bonus action, expend a use to grant up to your Charisma modifier (minimum one) creatures within 60 ft. 5 temporary hit points (rising to 8 at 5th, 11 at 10th, and 14 at 15th level) and let each immediately move up to their speed without provoking opportunity attacks.",
      },
      // Enthralling Performance is a limited-use pool — see SUBCLASS_POOLS["Glamour"].
    ],
    6: [
      // Mantle of Majesty is a limited-use pool — see SUBCLASS_POOLS["Glamour"].
    ],
    14: [
      // Unbreakable Majesty is a limited-use pool — see SUBCLASS_POOLS["Glamour"].
    ],
  },
  Lore: {
    6: [
      {
        title: "Additional Magical Secrets",
        detail:
          "Learn two spells of your choice from any class's spell list; they count as bard spells for you but don't count against the number of bard spells you know.",
      },
    ],
  },
  Spirits: {
    3: [
      {
        title: "Guiding Whispers",
        detail:
          "Learn the Guidance cantrip without it counting against your cantrips known, and you can cast it on a creature up to 60 ft. away.",
      },
      {
        title: "Spiritual Focus",
        detail:
          "Choose a small trinket, doll, or totem to serve as your spellcasting focus, channeling the spirits you commune with.",
      },
    ],
    6: [
      {
        title: "Spiritual Focus Enhancement",
        detail:
          "Once per turn when you cast a spell dealing damage or restoring hit points through your spiritual focus, add 1d6 to one damage or healing roll of that spell.",
      },
      // Spirit Session is a limited-use pool — see SUBCLASS_POOLS["Spirits"].
    ],
    14: [
      {
        title: "Mystical Connection",
        detail:
          "When you use Tales from Beyond, roll on the Spirit Tales table twice and use either result, or if both rolls match you may instead choose any entry on the table.",
      },
    ],
  },
  Swords: {
    3: [
      {
        title: "Bonus Proficiencies",
        detail:
          "Gain proficiency with medium armor and the scimitar, and any simple or martial melee weapon you're proficient with can serve as a spellcasting focus for your bard spells.",
      },
      {
        title: "Fighting Style",
        detail: "Learn the Dueling or Two-Weapon Fighting fighting style.",
      },
      {
        title: "Blade Flourish",
        detail:
          "Whenever you take the Attack action, your walking speed increases by 10 ft. until the end of the turn, and once per turn on a weapon hit you can add a Bardic Inspiration die to the damage and choose one effect: your AC also increases by the die's roll until the start of your next turn (Defensive Flourish), the same weapon also hits a second creature of your choice within 5 ft. of you (Slashing Flourish), or the target is pushed 5 ft. plus the die's roll away and you can then use your reaction to move up to your full speed to within 5 ft. of it (Mobile Flourish).",
      },
    ],
    6: [
      {
        title: "Extra Attack",
        detail:
          "You can attack twice, instead of once, whenever you take the Attack action on your turn.",
      },
    ],
    14: [
      {
        title: "Master's Flourish",
        detail:
          "When you use Blade Flourish, you can roll a d6 in place of expending a Bardic Inspiration die.",
      },
    ],
  },
  Valor: {
    3: [
      {
        title: "Bonus Proficiencies",
        detail:
          "Gain proficiency with medium armor, shields, and martial weapons.",
      },
      {
        title: "Combat Inspiration",
        detail:
          "A creature holding a Bardic Inspiration die you gave it can add the roll to a weapon damage roll it just made, or use its reaction after being attacked to add the roll to its AC against that attack.",
      },
    ],
    6: [
      {
        title: "Extra Attack",
        detail:
          "You can attack twice, instead of once, whenever you take the Attack action on your turn.",
      },
    ],
    14: [
      {
        title: "Battle Magic",
        detail:
          "Immediately after you cast a bard spell using your action, you can make one weapon attack as a bonus action.",
      },
    ],
  },
  Whispers: {
    3: [
      // Words of Terror is a limited-use pool — see SUBCLASS_POOLS["Whispers"].
      // Psychic Blades' damage is a rider on the attack roll (see
      // `classDamageRiders`), so it needs its prose row here.
      {
        title: "Psychic Blades",
        detail:
          "Once per turn when you hit a creature with a weapon attack, expend a use of Bardic Inspiration to deal extra psychic damage: 2d6, rising to 3d6 at 5th level, 5d6 at 10th, and 8d6 at 15th.",
      },
    ],
    6: [
      // Mantle of Whispers is a limited-use pool — see SUBCLASS_POOLS["Whispers"].
    ],
    14: [
      // Shadow Lore is a limited-use pool — see SUBCLASS_POOLS["Whispers"].
    ],
  },
};
