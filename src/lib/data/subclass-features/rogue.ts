import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each rogue subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const ROGUE_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Arcane Trickster": {
    3: [
      {
        title: "Mage Hand Legerdemain",
        detail:
          "Your Mage Hand cantrip becomes invisible and can stow or retrieve an item from a container worn or carried by another creature, or use thieves' tools to pick a lock or disarm a trap at range.",
      },
      {
        title: "Restricted Spell List",
        detail:
          "You learn two wizard cantrips and a small number of enchantment or illusion spells; your first two 1st-level spell picks must come from those two schools.",
      },
    ],
    9: [
      {
        title: "Magical Ambush",
        detail:
          "If you are hidden from a creature when you cast a spell on it, that creature has disadvantage on its saving throw against the spell this turn.",
      },
    ],
    13: [
      {
        title: "Versatile Trickster",
        detail:
          "As a bonus action, use your Mage Hand to distract a creature within 5 feet of it: you have advantage on attack rolls against that creature until the end of the turn.",
      },
    ],
    17: [
      {
        title: "Spell Thief",
        detail:
          "When targeted by a spell of 1st level or higher, use your reaction to force a saving throw against your spell save DC; on a failure the spell fails against you and you can cast a copy of it once within the next 8 hours, using your own spell slots if needed.",
      },
    ],
  },
  Assassin: {
    3: [
      {
        title: "Bonus Proficiencies",
        detail:
          "Gain proficiency with the disguise kit and the poisoner's kit.",
      },
      {
        title: "Assassinate",
        detail:
          "You have advantage on attack rolls against any creature that hasn't taken a turn yet in combat, and any hit you score against a surprised creature is an automatic critical hit.",
      },
    ],
    9: [
      {
        title: "Infiltration Expertise",
        detail:
          "Spend 7 days and 25 gp to craft a false identity, including documents, contacts, and a believable cover story, which you can use as a disguise.",
      },
    ],
    13: [
      {
        title: "Impostor",
        detail:
          "After studying a person's speech, writing, and behavior for at least 3 hours, you can convincingly impersonate them, gaining advantage on Deception checks to maintain the act.",
      },
    ],
    17: [
      {
        title: "Death Strike",
        detail:
          "When you hit a surprised creature, it must succeed on a Constitution saving throw (DC 8 + your Dexterity modifier + proficiency bonus) or take double damage from the attack.",
      },
    ],
  },
  Inquisitive: {
    3: [
      {
        title: "Ear for Deceit",
        detail:
          "Treat any d20 roll of 7 or lower as an 8 on Wisdom (Insight) checks made to determine whether someone is lying.",
      },
      {
        title: "Eye for Detail",
        detail:
          "Use a bonus action to make a Wisdom (Perception) check to spot a hidden creature or object, or an Intelligence (Investigation) check to uncover a clue.",
      },
      {
        title: "Insightful Fighting",
        detail:
          "As a bonus action, make a Wisdom (Insight) check contested by a creature's Charisma (Deception); on a success you can deal Sneak Attack damage to that creature without advantage for 1 minute, or until you use this feature on someone else.",
      },
    ],
    9: [
      {
        title: "Steady Eye",
        detail:
          "You have advantage on Wisdom (Perception) and Intelligence (Investigation) checks if you moved no more than half your speed on the same turn.",
      },
    ],
    13: [
      {
        title: "Unerring Eye",
        detail:
          "As an action, sense the presence of illusions, shapeshifted creatures, and disguising magic within 30 feet, unless you are blinded or deafened; usable a number of times equal to your Wisdom modifier (minimum 1) per long rest.",
      },
    ],
    17: [
      {
        title: "Eye for Weakness",
        detail:
          "While Insightful Fighting applies to a creature, your Sneak Attack against it deals an extra 3d6 damage.",
      },
    ],
  },
  Mastermind: {
    3: [
      {
        title: "Master of Intrigue",
        detail:
          "Gain proficiency with the disguise kit, the forgery kit, and one gaming set of your choice, plus two languages; after listening to a person speak for at least 1 minute, you can mimic their accent and speech patterns.",
      },
      {
        title: "Master of Tactics",
        detail:
          "Use the Help action as a bonus action, and when helping an ally attack a creature, the target of that help can be up to 30 feet away if it can see or hear you.",
      },
    ],
    9: [
      {
        title: "Insightful Manipulator",
        detail:
          "After observing or interacting with a creature for at least 1 minute outside combat, learn whether it is your better, equal, or worse in two of Intelligence, Wisdom, Charisma, or class levels, plus one additional piece of information about it.",
      },
    ],
    13: [
      {
        title: "Misdirection",
        detail:
          "When a creature within 5 feet of you gives you cover against an attack, use your reaction to redirect that attack to target that creature instead of you.",
      },
    ],
    17: [
      {
        title: "Soul of Deceit",
        detail:
          "Your thoughts can't be read by any means unless you allow it, you can present false surface thoughts that a Deception check contests against the reader's Insight, and magic can't compel you to tell the truth.",
      },
    ],
  },
  Phantom: {
    3: [
      {
        title: "Whispers of the Dead",
        detail:
          "When you finish a short or long rest, you can trade one previously chosen skill or tool proficiency of your choice for a different one.",
      },
      {
        title: "Wails from the Grave",
        detail:
          "Immediately after dealing Sneak Attack damage, you can also strike a second creature within 30 feet for necrotic damage equal to half your Sneak Attack dice, rolled separately; usable a number of times equal to your proficiency bonus per long rest.",
      },
    ],
    9: [
      {
        title: "Tokens of the Departed",
        detail:
          "When a creature you can see dies within 30 feet, use your reaction to conjure a Tiny spectral trinket, up to a number equal to your proficiency bonus; a trinket grants advantage on death saving throws and Constitution saving throws, can be broken to fuel a free use of Wails from the Grave, or broken as an action to ask the departed spirit one question.",
      },
    ],
    13: [
      {
        title: "Ghost Walk",
        detail:
          "As a bonus action, become an incorporeal spectral form for 10 minutes: gain a 10-foot fly speed with hover, can move through creatures and objects (taking 1d10 force damage if you end your turn inside one), and attacks against you have disadvantage; usable once per long rest, or by spending a Tokens of the Departed trinket.",
      },
    ],
    17: [
      {
        title: "Death's Friend",
        detail:
          "Wails from the Grave now deals its necrotic damage to both the original target and the second target, and you regain a Tokens of the Departed trinket automatically after a long rest if you have none.",
      },
    ],
  },
  Scout: {
    3: [
      {
        title: "Skirmisher",
        detail:
          "When a creature you can see ends its turn within 5 feet of you, use your reaction to move up to half your speed without provoking opportunity attacks from that creature.",
      },
      {
        title: "Survivalist",
        detail:
          "Gain proficiency in the Nature and Survival skills if you don't already have them, and your proficiency bonus is doubled for any ability check you make using either skill.",
      },
    ],
    9: [
      {
        title: "Superior Mobility",
        detail:
          "Your walking speed increases by 10 feet; if you have a climbing or swimming speed, it increases by 10 feet as well.",
      },
    ],
    13: [
      {
        title: "Ambush Master",
        detail:
          "You have advantage on initiative rolls, and the first creature you hit during the first round of combat has attack rolls made against it with advantage until the start of your next turn.",
      },
    ],
    17: [
      {
        title: "Sudden Strike",
        detail:
          "When you take the Attack action, make one additional attack as a bonus action; this extra attack can deal Sneak Attack damage even if you've already used it this turn, but not against the same target you've already hit with Sneak Attack this turn.",
      },
    ],
  },
  Soulknife: {
    3: [
      {
        title: "Psychic Blades",
        detail:
          "As a bonus action, manifest a simple, finesse melee weapon with a 60-foot thrown range that deals 1d6 plus the ability modifier used for the attack roll in psychic damage on a hit and vanishes after the attack; you can make a second, off-hand attack with it as a bonus action for 1d4 psychic damage with no ability modifier.",
      },
      {
        title: "Psionic Energy Dice",
        detail:
          "You have a pool of d6 Psionic Energy Dice, equal to twice your proficiency bonus, that recharge on a long rest (regaining one with a bonus action once per short or long rest). Spend a die to add its roll to a failed ability check (Psi-Bolstered Knack) or to power other Soulknife features; the die becomes a d8 at 5th level, a d10 at 11th, and a d12 at 17th.",
      },
    ],
    9: [
      {
        title: "Soul Blades",
        detail:
          "Spend a Psionic Energy Die to add its roll to a missed attack roll, potentially turning it into a hit (Homing Strikes), or to teleport up to a number of feet equal to ten times the roll (Psychic Teleportation).",
      },
    ],
    13: [
      {
        title: "Psychic Veil",
        detail:
          "As an action, turn invisible for 1 hour, ending early if you deal damage or force a saving throw; usable once per long rest, or by spending one Psionic Energy Die.",
      },
    ],
    17: [
      {
        title: "Rend Mind",
        detail:
          "When you deal Sneak Attack damage to a creature that can be frightened, it must succeed on a Wisdom saving throw (DC 8 + your proficiency bonus + your Dexterity modifier) or be stunned for 1 minute, repeating the save at the end of each of its turns; usable once per long rest, or by spending three Psionic Energy Dice.",
      },
    ],
  },
  Swashbuckler: {
    3: [
      {
        title: "Fancy Footwork",
        detail:
          "During your turn, a creature you make a melee attack against can't make opportunity attacks against you for the rest of your turn.",
      },
      {
        title: "Rakish Audacity",
        detail:
          "Add your Charisma modifier to your initiative rolls, and you can deal Sneak Attack damage without advantage if no creature other than your target is within 5 feet of you, you're within 5 feet of the target, and you don't have disadvantage on the attack roll.",
      },
    ],
    9: [
      {
        title: "Panache",
        detail:
          "As an action, make a Charisma (Persuasion) check contested by a creature's Wisdom (Insight); on a success, a hostile target has disadvantage attacking anyone but you and can't make opportunity attacks against others, or a non-hostile target becomes charmed and friendly toward you, either for 1 minute.",
      },
    ],
    13: [
      {
        title: "Elegant Maneuver",
        detail:
          "As a bonus action, gain advantage on the next Dexterity (Acrobatics) or Strength (Athletics) check you make this turn.",
      },
    ],
    17: [
      {
        title: "Master Duelist",
        detail:
          "Once per short or long rest, when you miss with an attack roll, reroll it with advantage.",
      },
    ],
  },
  Thief: {
    9: [
      {
        title: "Supreme Sneak",
        detail:
          "You have advantage on Dexterity (Stealth) checks if you move no more than half your speed on the same turn.",
      },
    ],
    13: [
      {
        title: "Use Magic Device",
        detail:
          "Ignore all class, race, and level requirements when attuning to or using a magic item.",
      },
    ],
    17: [
      {
        title: "Thief's Reflexes",
        detail:
          "During the first round of combat, take a second turn at your initiative count minus 10, unless you are surprised.",
      },
    ],
  },
};
