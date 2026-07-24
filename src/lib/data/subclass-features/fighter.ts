import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each fighter subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const FIGHTER_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Arcane Archer": {
    3: [
      {
        title: "Arcane Archer Lore",
        detail:
          "Gain proficiency in Arcana or Nature, and learn the prestidigitation or druidcraft cantrip (your choice).",
      },
      {
        title: "Arcane Shot",
        detail:
          "Twice per short or long rest, when you fire an arrow you can infuse it with one of your known Arcane Shot options for a magical effect. You know two options at 3rd level, gaining more at higher levels.",
      },
    ],
    7: [
      {
        title: "Magic Arrow",
        detail:
          "Nonmagical ammunition you fire from a shortbow or longbow counts as magical for the purpose of overcoming resistance and immunity to nonmagical attacks.",
      },
      {
        title: "Curving Shot",
        detail:
          "When an Arcane Shot arrow misses a target, you can spend a bonus action to redirect it against a different creature within 60 feet of the original target.",
      },
    ],
    15: [
      {
        title: "Ever-Ready Shot",
        detail:
          "If you roll initiative and have no uses of Arcane Shot left, you regain one use.",
      },
    ],
  },
  Banneret: {
    3: [
      {
        title: "Rallying Cry",
        detail:
          "When you use Second Wind, you can also inspire up to three allies within 60 feet, each regaining hit points equal to your fighter level.",
      },
    ],
    7: [
      {
        title: "Royal Envoy",
        detail:
          "Gain proficiency in Persuasion, or double your proficiency bonus for Persuasion checks if already proficient.",
      },
    ],
    10: [
      {
        title: "Inspiring Surge",
        detail:
          "When you use Action Surge, one ally within 60 feet who can see or hear you can immediately use their reaction to make one weapon attack.",
      },
    ],
    15: [
      {
        title: "Bulwark",
        detail:
          "When you use Indomitable to reroll a failed Intelligence, Wisdom, or Charisma save, one ally within 60 feet who failed the same save can also reroll theirs (if they can see or hear you).",
      },
    ],
    18: [
      {
        title: "Inspiring Surge (Improved)",
        detail:
          "When you use Action Surge, two allies within 60 feet (instead of one) can each use their reaction to make a weapon attack.",
      },
    ],
  },
  "Battle Master": {
    7: [
      {
        title: "Know Your Enemy",
        detail:
          "Spend 1 minute observing or interacting with a creature outside combat to learn how it compares to you in two of: Strength, Dexterity, Constitution, armor class, current hit points, total class levels, and fighter levels.",
      },
    ],
    15: [
      {
        title: "Relentless",
        detail:
          "If you roll initiative and have no superiority dice left, you regain one superiority die.",
      },
    ],
  },
  Cavalier: {
    3: [
      {
        title: "Bonus Proficiency",
        detail:
          "Gain proficiency in one of Animal Handling, History, Insight, Performance, or Persuasion, or learn one language of your choice.",
      },
      {
        title: "Born to the Saddle",
        detail:
          "Gain advantage on saving throws to avoid falling off your mount, land safely when you fall off it from no higher than 10 feet, and mounting or dismounting costs only 5 feet of movement.",
      },
      {
        title: "Unwavering Mark",
        detail:
          "When you hit a creature with a melee attack, you can mark it until the end of your next turn, giving it disadvantage on attacks that don't target you while it's within 5 feet of you. If it damages someone else anyway, on your next turn you can make a bonus-action melee attack against it with advantage, dealing extra damage equal to half your fighter level. Uses equal to your Strength modifier (minimum 1) per long rest.",
      },
    ],
    7: [
      {
        title: "Warding Maneuver",
        detail:
          "When you or a creature within 5 feet is hit by an attack, use your reaction to roll a d8 and add it to the target's AC against that attack, granting resistance to the damage if it still hits. Uses equal to your Constitution modifier (minimum 1) per long rest.",
      },
    ],
    10: [
      {
        title: "Hold the Line",
        detail:
          "Creatures moving 5 feet or more while within your reach provoke an opportunity attack from you even if they don't leave your reach, and a hit reduces the target's speed to 0 for the rest of the turn.",
      },
    ],
    15: [
      {
        title: "Ferocious Charger",
        detail:
          "If you move at least 10 feet in a straight line immediately before hitting a creature with a melee attack, you can force it to make a Strength save (DC 8 + proficiency bonus + Strength modifier) or be knocked prone, once per turn.",
      },
    ],
    18: [
      {
        title: "Vigilant Defender",
        detail:
          "You gain a special reaction usable once on every other creature's turn (not just once per round), on top of your normal reaction, but only to make an opportunity attack.",
      },
    ],
  },
  Champion: {
    7: [
      {
        title: "Remarkable Athlete",
        detail:
          "Add half your proficiency bonus (round up) to Strength, Dexterity, or Constitution checks that don't already include your proficiency bonus, and add your Strength modifier to your running long jump distance.",
      },
    ],
    10: [
      {
        title: "Additional Fighting Style",
        detail: "Learn a second Fighting Style option.",
      },
    ],
    15: [
      {
        title: "Superior Critical",
        detail: "Your weapon attacks score a critical hit on an 18-20.",
      },
    ],
    18: [
      {
        title: "Survivor",
        detail:
          "At the start of each of your turns, if you have no more than half your hit point maximum and aren't at 0 hit points, regain 5 + your Constitution modifier hit points.",
      },
    ],
  },
  "Echo Knight": {
    3: [
      {
        title: "Manifest Echo",
        detail:
          "As a bonus action, summon a spectral echo of yourself in an unoccupied space within 15 feet; it has 1 hit point, AC 14 + your proficiency bonus, and can be moved or teleported near you as a bonus action.",
      },
      {
        title: "Unleash Incarnation",
        detail:
          "Once per turn when you take the Attack action, you can make one additional melee attack from your echo's space. Uses equal to your Constitution modifier (minimum 1) per long rest.",
      },
    ],
    7: [
      {
        title: "Echo Avatar",
        detail:
          "As an action, see and hear through your echo's senses (you're blinded and deafened yourself) for up to 10 minutes; while doing so, the echo can be up to 1,000 feet from you without being destroyed.",
      },
    ],
    10: [
      {
        title: "Shadow Martyr",
        detail:
          "As a reaction before an attack roll targets another creature you can see, teleport your echo within 5 feet of that creature so the attack instead targets the echo, once per short or long rest.",
      },
    ],
    15: [
      {
        title: "Reclaim Potential",
        detail:
          "When your echo is destroyed and you have no temporary hit points, gain 2d6 + your Constitution modifier temporary hit points.",
      },
    ],
    18: [
      {
        title: "Legion of One",
        detail:
          "Manifest two echoes at once instead of one, and if you roll initiative with no uses of Unleash Incarnation left, you regain one use.",
      },
    ],
  },
  "Eldritch Knight": {
    3: [
      {
        title: "Spellcasting",
        detail:
          "Learn Intelligence-based wizard spells (favoring abjuration and evocation), gaining cantrips, spells known, and spell slots as you level, up to 4th-level spells.",
      },
      {
        title: "Weapon Bond",
        detail:
          "Ritually bond with up to two weapons; as a bonus action, summon a bonded weapon to your hand, and it can't be disarmed from you unless you're incapacitated.",
      },
    ],
    7: [
      {
        title: "War Magic",
        detail:
          "When you cast a cantrip as your action, you can make one weapon attack as a bonus action.",
      },
    ],
    10: [
      {
        title: "Eldritch Strike",
        detail:
          "When you hit a creature with a weapon attack, it has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.",
      },
    ],
    15: [
      {
        title: "Arcane Charge",
        detail:
          "When you use Action Surge, you can teleport up to 30 feet to an unoccupied space you can see.",
      },
    ],
    18: [
      {
        title: "Improved War Magic",
        detail:
          "When you cast a spell as your action, you can make one weapon attack as a bonus action.",
      },
    ],
  },
  "Psi Warrior": {
    3: [
      {
        title: "Psionic Power",
        detail:
          "Gain a pool of Psionic Energy dice (d6s, growing larger at higher levels) equal to twice your proficiency bonus, regained on a long rest; as a bonus action, regain one die once per short or long rest.",
      },
      {
        title: "Protective Field",
        detail:
          "As a reaction when a creature within 30 feet takes damage, spend a Psionic Energy die and roll it, reducing the damage by the roll plus your Intelligence modifier (minimum 1).",
      },
      {
        title: "Psionic Strike",
        detail:
          "Once per turn when you hit a creature within 30 feet with a weapon attack, you can spend a Psionic Energy die to deal extra force damage equal to the roll plus your Intelligence modifier.",
      },
      {
        title: "Telekinetic Movement",
        detail:
          "As an action, move a Large or smaller object or a willing creature up to 30 feet, once per short or long rest for free, or more often by spending a Psionic Energy die.",
      },
    ],
    7: [
      {
        title: "Psi-Powered Leap",
        detail:
          "As a bonus action, gain a flying speed equal to twice your walking speed until the end of the turn, once per short or long rest for free, or more often by spending a Psionic Energy die.",
      },
      {
        title: "Telekinetic Thrust",
        detail:
          "When your Psionic Strike damages a creature, it must make a Strength save (DC 8 + proficiency bonus + Intelligence modifier) or be knocked prone or pushed 10 feet.",
      },
    ],
    10: [
      {
        title: "Guarded Mind",
        detail:
          "Gain resistance to psychic damage; you can also spend a Psionic Energy die to end being charmed or frightened at the start of your turn.",
      },
    ],
    15: [
      {
        title: "Bulwark of Force",
        detail:
          "As a bonus action, grant yourself and up to your Intelligence modifier of creatures within 30 feet half cover for 1 minute, once per long rest for free, or more often by spending a Psionic Energy die.",
      },
    ],
    18: [
      {
        title: "Telekinetic Master",
        detail:
          "Cast telekinesis without spell slots or components, using Intelligence as your spellcasting ability, and make a bonus-action weapon attack each turn you concentrate on it. Once per long rest, or again by spending a Psionic Energy die.",
      },
    ],
  },
  "Rune Knight": {
    3: [
      {
        title: "Bonus Proficiencies",
        detail: "Gain proficiency with smith's tools and the Giant language.",
      },
      {
        title: "Rune Carver",
        detail:
          "Learn two runes (from Cloud, Fire, Frost, and Stone, plus Hill and Storm once you reach 7th level) to inscribe on your gear, gaining more at 7th, 10th, and 15th level; you can swap one known rune for another when you gain a fighter level.",
      },
      {
        title: "Giant's Might",
        detail:
          "As a bonus action, grow to Large size for 1 minute a number of times equal to your proficiency bonus per long rest: you gain advantage on Strength checks and saves, and once per turn on a weapon hit deal an extra 1d6 damage (larger at higher levels).",
      },
    ],
    7: [
      {
        title: "Runic Shield",
        detail:
          "As a reaction when an ally within 60 feet you can see is hit by an attack roll, force the attacker to reroll the d20 and use the new result. Uses equal to your proficiency bonus per long rest.",
      },
    ],
    10: [
      {
        title: "Great Stature",
        detail:
          "Your body is permanently reshaped by your runes: roll 3d4 to determine how many inches you've grown, and Giant's Might's extra damage increases to 1d8.",
      },
    ],
    15: [
      {
        title: "Master of Runes",
        detail:
          "Invoke each of your runes' magical effects twice (instead of once) between rests, and they recharge on a short rest instead of only a long rest.",
      },
    ],
    18: [
      {
        title: "Runic Juggernaut",
        detail:
          "Giant's Might's extra damage increases to 1d10, and while enlarged you can instead grow to Huge size, extending your reach by 5 feet.",
      },
    ],
  },
  Samurai: {
    7: [
      {
        title: "Elegant Courtier",
        detail:
          "Add your Wisdom modifier to Charisma (Persuasion) checks, and gain proficiency in Wisdom saving throws (or, if already proficient, gain proficiency in an Intelligence or Charisma save instead).",
      },
    ],
    10: [
      {
        title: "Tireless Spirit",
        detail:
          "If you roll initiative and have no uses of Fighting Spirit left, you regain one use.",
      },
    ],
    15: [
      {
        title: "Rapid Strike",
        detail:
          "Once per turn, if you have advantage on a weapon attack, you can forgo the advantage to make one additional weapon attack against the same target.",
      },
    ],
    18: [
      {
        title: "Strength Before Death",
        detail:
          "When you drop to 0 hit points but aren't killed outright, use your reaction to take an extra turn immediately (still making death saving throws as normal), once per long rest.",
      },
    ],
  },
};
