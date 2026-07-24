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
      {
        title: "Performance of Creation",
        detail:
          "As an action, expend a use to conjure a nonmagical item worth up to 20 gp per bard level (Medium or smaller, growing to Large at 6th and Huge at 14th level) that lasts for your Proficiency Bonus in hours; you can spend a 2nd-level or higher spell slot for an extra use.",
      },
    ],
    6: [
      {
        title: "Animating Performance",
        detail:
          "As an action, expend a use to animate a Large or smaller nonmagical item within 30 ft. into a friendly construct (AC 16, HP 10 + 5 per bard level) that acts for up to 1 hour, until reduced to 0 hit points, or until you die; you can spend a 3rd-level or higher spell slot for an extra use.",
      },
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
      {
        title: "Unsettling Words",
        detail:
          "As a bonus action, expend a Bardic Inspiration die and subtract its roll from a creature's next saving throw before the start of your next turn.",
      },
    ],
    6: [
      {
        title: "Unfailing Inspiration",
        detail:
          "A Bardic Inspiration die that fails to change the outcome of the roll it was added to is not used up.",
      },
      {
        title: "Universal Speech",
        detail:
          "As an action, expend a use to let up to your Charisma modifier (minimum one) creatures within 60 ft. magically understand your spoken words for 1 hour; a spent spell slot grants an extra use.",
      },
    ],
    14: [
      {
        title: "Infectious Inspiration",
        detail:
          "When a creature within 60 ft. succeeds on a roll using a Bardic Inspiration die you gave it, you can use your reaction to grant a new die to a different creature within range without spending a use, up to your Charisma modifier (minimum one) times per long rest.",
      },
    ],
  },
  Glamour: {
    3: [
      {
        title: "Mantle of Inspiration",
        detail:
          "As a bonus action, expend a use to grant up to your Charisma modifier (minimum one) creatures within 60 ft. 5 temporary hit points (rising to 8 at 5th, 11 at 10th, and 14 at 15th level) and let each immediately move up to their speed without provoking opportunity attacks.",
      },
      {
        title: "Enthralling Performance",
        detail:
          "After performing for at least 1 minute, force up to your Charisma modifier (minimum one) humanoids within 60 ft. who watched to make a Wisdom save or be charmed for 1 hour, ending early if the target takes damage, you attack it, or it witnesses you attack one of its allies; usable once per short or long rest.",
      },
    ],
    6: [
      {
        title: "Mantle of Majesty",
        detail:
          "As a bonus action, cast Command each turn for up to 1 minute of concentration without spending a spell slot; creatures already charmed by you automatically fail their save. Usable once per long rest.",
      },
    ],
    14: [
      {
        title: "Unbreakable Majesty",
        detail:
          "As a bonus action, become majestic for up to 1 minute or until incapacitated: the first creature to attack you each turn must succeed on a Charisma save or waste the attack, and on a success it instead has disadvantage on its next save against your spells. Usable once per short or long rest.",
      },
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
    14: [
      {
        title: "Peerless Skill",
        detail:
          "When you make an ability check, expend a Bardic Inspiration die and add the roll to your own check after seeing the roll but before the outcome is decided.",
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
      {
        title: "Tales from Beyond",
        detail:
          "While holding your Spiritual Focus, use a bonus action and expend a Bardic Inspiration die to roll on the Spirit Tales table, retaining the tale until you bestow it (as an action, on a creature within 30 ft.) or finish a short or long rest; save DC equals your spell save DC where relevant.",
      },
    ],
    6: [
      {
        title: "Spiritual Focus Enhancement",
        detail:
          "Once per turn when you cast a spell dealing damage or restoring hit points through your spiritual focus, add 1d6 to one damage or healing roll of that spell.",
      },
      {
        title: "Spirit Session",
        detail:
          "As a 1-hour ritual with up to your Proficiency Bonus willing creatures, temporarily learn one Divination or Necromancy spell of a level no higher than the number of participants; it counts as a bard spell but doesn't count against spells known until your next long rest.",
      },
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
      {
        title: "Psychic Blades",
        detail:
          "Once per turn on a weapon hit, expend a Bardic Inspiration use to deal an extra 2d6 psychic damage (rising to 3d6 at 5th, 5d6 at 10th, and 8d6 at 15th level).",
      },
      {
        title: "Words of Terror",
        detail:
          "After speaking privately with a humanoid for at least 1 minute, force a Wisdom save or the target becomes frightened of you or a creature of your choice for 1 hour, ending early if it takes damage or witnesses an ally harmed. Usable once per short or long rest.",
      },
    ],
    6: [
      {
        title: "Mantle of Whispers",
        detail:
          "As a reaction when a humanoid dies within 30 ft., capture its shadow (retained until used or you finish a long rest); as an action, wear the shadow as a disguise of that creature for 1 hour (ending early as a bonus action), gaining a +5 bonus on your Deception check when contested by an observer's Insight check. Can capture a new shadow only after a short or long rest.",
      },
    ],
    14: [
      {
        title: "Shadow Lore",
        detail:
          "As an action, target one creature within 30 ft. with a Wisdom save; on a failure it is charmed for 8 hours, believing you know its darkest secret and obeying your reasonable requests until you or an ally attacks or damages it. Usable once per long rest.",
      },
    ],
  },
};
