import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each barbarian subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const BARBARIAN_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Ancestral Guardian": {
    3: [
      {
        title: "Ancestral Protectors",
        detail:
          "On entering your rage, mark the first creature you hit; until the start of your next turn it has disadvantage on attacks against anyone but you, and any creature it hits with another attack gains resistance to that damage.",
      },
    ],
    6: [
      {
        title: "Spirit Shield",
        detail:
          "As a reaction while raging, when an ally within 30 feet takes damage, reduce that damage by 2d6, increasing to 3d6 at 10th level and 4d6 at 14th level.",
      },
    ],
    10: [
      {
        title: "Consult the Spirits",
        detail:
          "Once per short or long rest, cast Augury or Clairvoyance (using Wisdom) without a slot or material cost; your Clairvoyance sensor appears as a visible ancestral spirit.",
      },
    ],
    14: [
      {
        title: "Vengeful Ancestors",
        detail:
          "Whenever Spirit Shield prevents damage to an ally, the attacker takes that same amount of force damage.",
      },
    ],
  },
  Battlerager: {
    3: [
      {
        title: "Battlerager Armor",
        detail:
          "While wearing spiked armor and raging, make a bonus-action armor spikes attack against a target within 5 feet (1d4 piercing); when you grapple a creature with the Attack action and succeed, it also takes 3 piercing damage.",
      },
    ],
    6: [
      {
        title: "Reckless Abandon",
        detail:
          "Whenever you make a Reckless Attack while raging, gain temporary hit points equal to your Constitution modifier (minimum 1), lost when your rage ends.",
      },
    ],
    10: [
      {
        title: "Battlerager Charge",
        detail: "While raging, take the Dash action as a bonus action.",
      },
    ],
    14: [
      {
        title: "Spiked Retribution",
        detail:
          "While raging, wearing spiked armor, and not incapacitated, any creature that hits you with a melee attack from within 5 feet takes 3 piercing damage.",
      },
    ],
  },
  Beast: {
    6: [
      {
        title: "Bestial Soul",
        detail:
          "Your natural weapons count as magical, and after a rest choose one benefit to keep until your next rest: swim speed equal to your walking speed plus water breathing, climb speed equal to your walking speed on any surface, or add an Athletics check to your long jump distance once per turn.",
      },
    ],
    10: [
      {
        title: "Infectious Fury",
        detail:
          "When you hit with a natural weapon while raging, the target makes a Wisdom save (DC 8 + proficiency bonus + Constitution modifier) or either attacks a creature of your choice or takes 2d12 psychic damage; usable a number of times per long rest equal to your proficiency bonus.",
      },
    ],
    14: [
      {
        title: "Call the Hunt",
        detail:
          "On entering rage, grant 5 temporary hit points each to up to your Constitution-modifier (minimum 1) willing creatures within 30 feet; until your rage ends they add 1d6 to one damage roll each of their turns. Usable a number of times per long rest equal to your proficiency bonus.",
      },
    ],
  },
  Berserker: {
    6: [
      {
        title: "Mindless Rage",
        detail:
          "While raging, you can't be charmed or frightened, and any existing charm or fright effect is suspended for the rage's duration.",
      },
    ],
    10: [
      {
        title: "Intimidating Presence",
        detail:
          "As an action, frighten one creature within 30 feet (Wisdom save, DC 8 + proficiency bonus + Charisma modifier); a failure leaves it frightened until the end of your next turn (repeatable each turn, broken past 60 feet or out of sight), a success makes it immune to this feature for 24 hours.",
      },
    ],
    14: [
      {
        title: "Retaliation",
        detail:
          "As a reaction to taking damage from a creature within 5 feet, make one melee weapon attack against it.",
      },
    ],
  },
  Giant: {
    3: [
      {
        title: "Giant's Power",
        detail:
          "Learn to speak, read, and write Giant (or another language of your choice), and learn Druidcraft or Thaumaturgy, cast using Wisdom.",
      },
      {
        title: "Giant's Havoc",
        detail:
          "While raging: add your rage damage bonus to Strength-based thrown weapon attacks, gain 5 feet of reach, and become Large if you're smaller (space permitting).",
      },
    ],
    6: [
      {
        title: "Elemental Cleaver",
        detail:
          "On entering rage, infuse one held weapon with a damage type of your choice (acid, cold, fire, lightning, or thunder): it deals an extra 1d6 of that type on a hit and gains the thrown property (range 20/60, returning to your hand); change the type again as a bonus action while raging.",
      },
    ],
    10: [
      {
        title: "Mighty Impel",
        detail:
          "As a bonus action while raging, move a Medium or smaller creature within your reach to an unoccupied space within 30 feet; an unwilling target gets a Strength save (DC 8 + proficiency bonus + Strength modifier), and a target left without solid ground underneath falls prone.",
      },
    ],
    14: [
      {
        title: "Demiurgic Colossus",
        detail:
          "While raging, gain 10 feet of reach and become Large or Huge (your choice); Mighty Impel now works on Large or smaller creatures, and Elemental Cleaver's extra damage increases to 2d6.",
      },
    ],
  },
  // Storm Aura (3), Storm Soul (6) and Raging Storm (14) are environment-gated,
  // so they come from the `stormAura` sub-choice group in chosen-options.ts.
  // Only Shielding Storm is the same whichever environment you chose.
  "Storm Herald": {
    10: [
      {
        title: "Shielding Storm",
        detail:
          "Creatures of your choice within your Storm Aura share your Storm Soul resistance while inside it.",
      },
    ],
  },
  "Totem Warrior": {
    3: [
      {
        title: "Spirit Seeker",
        detail: "Cast Beast Sense and Speak with Animals, but only as rituals.",
      },
    ],
    10: [
      {
        title: "Spirit Walker",
        detail:
          "Cast Commune with Nature as a ritual, with a spirit animal appearing to convey the answers.",
      },
    ],
  },
  "Wild Magic": {
    3: [
      {
        title: "Magic Awareness",
        detail:
          "As an action, detect the presence and school of spells and magic items within 60 feet (not through total cover) until the end of your next turn; usable a number of times per long rest equal to your proficiency bonus.",
      },
    ],
    6: [
      {
        title: "Bolstering Magic",
        detail:
          "As an action, touch a creature (including yourself) and either grant a d3 bonus to its attack rolls or ability checks for 10 minutes, or restore one of its expended spell slots of d3 level (once per target per long rest); usable a number of times per long rest equal to your proficiency bonus.",
      },
    ],
    14: [
      {
        title: "Controlled Surge",
        detail:
          "Whenever you roll on the Wild Magic Surge table, roll twice and choose which result applies (or, if you roll doubles, choose any result on the table).",
      },
    ],
  },
  Zealot: {
    3: [
      {
        title: "Divine Fury",
        detail:
          "While raging, the first creature you hit each turn with a weapon attack takes an extra 1d6 plus half your barbarian level necrotic or radiant damage (chosen when you gain this feature).",
      },
      {
        title: "Warrior of the Gods",
        detail:
          "Spells cast on you that exist solely to restore you to life (but don't also prevent or reverse undeath) need no material components.",
      },
    ],
    6: [
      {
        title: "Fanatical Focus",
        detail:
          "Once per rage, when you fail a saving throw while raging, reroll it and use the new result.",
      },
    ],
    10: [
      {
        title: "Zealous Presence",
        detail:
          "As a bonus action, grant advantage on attack rolls and saving throws to up to ten creatures within 60 feet who can hear you, until the start of your next turn; usable once per long rest.",
      },
    ],
    14: [
      {
        title: "Rage Beyond Death",
        detail:
          "While raging at 0 hit points, you remain conscious and can act (still making death saves as normal); you die only if you're still at 0 hit points once your rage ends.",
      },
    ],
  },
};
