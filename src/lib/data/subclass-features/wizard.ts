import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each wizard subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const WIZARD_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Abjuration: {
    2: [
      {
        title: "Abjuration Savant",
        detail:
          "Copying an abjuration spell into your spellbook costs half the usual gold and time.",
      },
      // Arcane Ward is a limited-use pool — see SUBCLASS_POOLS["Abjuration"].
    ],
    6: [
      {
        title: "Projected Ward",
        detail:
          "As a reaction, redirect damage a creature you can see within 30 feet would take into your Arcane Ward instead; any damage exceeding the ward's remaining points still hits the creature.",
      },
    ],
    10: [
      {
        title: "Improved Abjuration",
        detail:
          "Add your proficiency bonus to any ability check made as part of casting an abjuration spell, such as a Counterspell or Dispel Magic check.",
      },
    ],
    14: [
      {
        title: "Spell Resistance",
        detail:
          "Gain advantage on saving throws against spells, and resistance to damage from spells.",
      },
    ],
  },
  Bladesinging: {
    2: [
      {
        title: "Training in War and Song",
        detail:
          "Gain proficiency with light armor, one one-handed melee weapon of your choice, and Performance (if not already proficient).",
      },
      // Bladesong is a limited-use pool — see SUBCLASS_POOLS["Bladesinging"].
    ],
    6: [
      {
        title: "Extra Attack",
        detail:
          "Attack twice, instead of once, whenever you take the Attack action on your turn; you may replace one of those attacks with a cantrip.",
      },
    ],
    10: [
      {
        title: "Song of Defense",
        detail:
          "As a reaction while your Bladesong is active, expend a spell slot to reduce incoming damage to yourself by 5 times the slot's level.",
      },
    ],
    14: [
      {
        title: "Song of Victory",
        detail:
          "While your Bladesong is active, add your Intelligence modifier (minimum +1) to the damage of your melee weapon attacks.",
      },
    ],
  },
  Chronurgy: {
    2: [
      // Chronal Shift is a limited-use pool — see SUBCLASS_POOLS["Chronurgy"].
      {
        title: "Temporal Awareness",
        detail: "Add your Intelligence modifier to your initiative rolls.",
      },
    ],
    6: [
      {
        title: "Momentary Stasis",
        detail:
          "As an action, a number of times equal to your Intelligence modifier (minimum 1) per long rest, one Large or smaller creature within 60 feet must succeed on a Constitution save against your wizard spell save DC or become incapacitated with speed 0 until the end of your next turn or until it takes damage.",
      },
    ],
    10: [
      {
        title: "Arcane Abeyance",
        detail:
          "Once per short or long rest, bind a spell of 4th level or lower that you cast into a small enchanted object with AC 15 and 1 hit point; anyone can release the stored spell with an action within the next hour before it dissipates.",
      },
    ],
    14: [
      {
        title: "Convergent Future",
        detail:
          "As a reaction, force one attack roll, ability check, or saving throw within 60 feet to become the minimum result needed to succeed, or one lower, then gain a level of exhaustion that only a long rest removes.",
      },
    ],
  },
  Conjuration: {
    2: [
      {
        title: "Conjuration Savant",
        detail:
          "Copying a conjuration spell into your spellbook costs half the usual gold and time.",
      },
      {
        title: "Minor Conjuration",
        detail:
          "As an action, conjure a nonmagical object no larger than 3 feet and 10 pounds into your hand or an unoccupied space within 10 feet; it sheds dim light in a 5-foot radius and vanishes after an hour, on reuse, or if it takes any damage.",
      },
    ],
    6: [
      {
        title: "Benign Transportation",
        detail:
          "As an action, teleport up to 30 feet to an unoccupied space you can see, or swap places with a willing Small or Medium creature within range; regain the use on a long rest or by casting a conjuration spell of 1st level or higher.",
      },
    ],
    10: [
      {
        title: "Focused Conjuration",
        detail:
          "Taking damage can no longer break your concentration on a conjuration spell.",
      },
    ],
    14: [
      {
        title: "Durable Summons",
        detail:
          "Any creature you summon or create with a conjuration spell arrives with 30 temporary hit points.",
      },
    ],
  },
  Divination: {
    2: [
      {
        title: "Divination Savant",
        detail:
          "Copying a divination spell into your spellbook costs half the usual gold and time.",
      },
      // Portent is a limited-use pool — see SUBCLASS_POOLS["Divination"].
    ],
    6: [
      {
        title: "Expert Divination",
        detail:
          "Whenever you cast a divination spell of 2nd level or higher using a spell slot, regain one expended slot of a lower level (maximum 5th).",
      },
    ],
    10: [
      {
        title: "The Third Eye",
        detail:
          "As an action once per short or long rest, gain one of the following until incapacitated or you rest: 60 feet of darkvision, 60 feet of sight onto the Ethereal Plane, the ability to read any language, or 10 feet of see invisibility.",
      },
    ],
    14: [
      {
        title: "Greater Portent",
        detail: "Roll three d20s instead of two for your Portent feature.",
      },
    ],
  },
  Enchantment: {
    2: [
      {
        title: "Enchantment Savant",
        detail:
          "Copying an enchantment spell into your spellbook costs half the usual gold and time.",
      },
      {
        title: "Hypnotic Gaze",
        detail:
          "As an action, lock eyes with one creature within 5 feet; it must succeed on a Wisdom save against your wizard spell save DC or be charmed, with speed 0 and incapacitated, until the end of your next turn. You may extend the effect each turn with your action, but it ends early if you move away, it can no longer see or hear you, or it takes damage, and you can't use this feature on that creature again until you finish a long rest.",
      },
    ],
    6: [
      {
        title: "Instinctive Charm",
        detail:
          "As a reaction, a number of times equal to your Intelligence modifier (minimum 1) per long rest, when a creature within 30 feet targets you with an attack, it must make a Wisdom save against your wizard spell save DC or redirect the attack to the creature nearest to it (excluding you and itself, with the attacker choosing among ties).",
      },
    ],
    10: [
      {
        title: "Split Enchantment",
        detail:
          "Whenever you cast an enchantment spell of 1st level or higher that targets only one creature, you can have it target a second creature as well.",
      },
    ],
    14: [
      {
        title: "Alter Memories",
        detail:
          "Whenever you charm a creature, it doesn't realize it was charmed; once before the effect ends, you may force it to make an Intelligence save against your wizard spell save DC or lose 1 plus your Charisma modifier hours of memory, capped by the spell's duration.",
      },
    ],
  },
  Evocation: {
    6: [
      {
        title: "Potent Cantrip",
        detail:
          "When a creature succeeds on a saving throw against your cantrip that would otherwise deal no damage on a success, it still takes half the cantrip's damage.",
      },
    ],
    10: [
      {
        title: "Empowered Evocation",
        detail:
          "Add your Intelligence modifier (minimum +1) to the damage of one damage roll of any wizard evocation spell you cast.",
      },
    ],
    14: [
      {
        title: "Overchannel",
        detail:
          "Once per long rest for free, then again before your next long rest at a cost, cast a wizard spell of 1st through 5th level to deal its maximum possible damage; each additional use before a long rest deals you necrotic damage equal to 2d12 per level of the spell, increasing by 1d12 per further use, bypassing resistance and immunity.",
      },
    ],
  },
  Graviturgy: {
    2: [
      {
        title: "Adjust Density",
        detail:
          "As an action while concentrating for up to a minute, halve or double the weight of one Large or smaller creature or object (Huge or smaller at 10th level) within 30 feet; halving grants +10 feet of speed, doubled jump distance, and disadvantage on Strength checks and saves, while doubling imposes -10 feet of speed and advantage on Strength checks and saves.",
      },
    ],
    6: [
      {
        title: "Gravity Well",
        detail:
          "Whenever you hit with a spell or force a creature to fail a save against one, you may shove the target 5 feet into an unoccupied space of your choice.",
      },
    ],
    10: [
      // Violent Attraction is a limited-use pool — see SUBCLASS_POOLS["Graviturgy"].
    ],
    14: [
      {
        title: "Event Horizon",
        detail:
          "Once per long rest as an action while concentrating for up to a minute (or by expending a 3rd-level or higher spell slot), create a 30-foot gravity field around yourself; hostile creatures starting their turn inside it must succeed on a Strength save against your wizard spell save DC or take 2d10 force damage and have speed 0 until their next turn, with a success halving the damage and doubling the cost to move within the field.",
      },
    ],
  },
  Illusion: {
    2: [
      {
        title: "Illusion Savant",
        detail:
          "Copying an illusion spell into your spellbook costs half the usual gold and time.",
      },
      {
        title: "Improved Minor Illusion",
        detail:
          "Learn the Minor Illusion cantrip if you don't already know it (or another wizard cantrip if you do); when you cast it, it can now create both a sound and an image with a single casting.",
      },
    ],
    6: [
      {
        title: "Malleable Illusions",
        detail:
          "As an action, while within range of an illusion spell with a duration of 1 minute or longer that you cast, change the nature of that illusion within the limits of the spell's original parameters.",
      },
    ],
    10: [
      {
        title: "Illusory Self",
        detail:
          "Once per short or long rest, as a reaction when a creature attacks you, interpose a disappearing illusory duplicate so that the attack automatically misses you.",
      },
    ],
    14: [
      {
        title: "Illusory Reality",
        detail:
          "As a bonus action when you cast an illusion spell of 1st level or higher, make one nonmagical object within the illusion briefly real for up to a minute; the object can't deal damage or be damaged and reverts to illusory when the effect ends.",
      },
    ],
  },
  Necromancy: {
    2: [
      {
        title: "Necromancy Savant",
        detail:
          "Copying a necromancy spell into your spellbook costs half the usual gold and time.",
      },
      {
        title: "Grim Harvest",
        detail:
          "Once per turn when you kill a creature (other than a construct or undead) with a spell of 1st level or higher, regain hit points equal to twice the spell's level, or three times its level if the spell was a necromancy spell.",
      },
    ],
    6: [
      {
        title: "Undead Thralls",
        detail:
          "Add Animate Dead to your spellbook if it isn't there already; when you cast it, you can animate or reassert control over one extra corpse, and your undead created this way gain extra hit points equal to your wizard level and add your proficiency bonus to their weapon damage.",
      },
    ],
    10: [
      {
        title: "Inured to Undeath",
        detail:
          "Gain resistance to necrotic damage, and your hit point maximum can't be reduced.",
      },
    ],
    14: [
      {
        title: "Command Undead",
        detail:
          "As an action, one undead creature within 60 feet must succeed on a Charisma save against your wizard spell save DC or become friendly to you and obey your commands until you use this feature again (the undead has advantage on the save if its Intelligence is 8-11, or may repeat the save once per hour if 12 or higher).",
      },
    ],
  },
  "Order of Scribes": {
    2: [
      {
        title: "Wizardly Quill",
        detail:
          "As a bonus action, conjure a magic quill into a free hand: it can write in colored ink at will, transcribes your spells into a spellbook in 2 minutes per spell level, and erases writing within 5 feet as a bonus action; it fades if replaced or you die.",
      },
      {
        title: "Awakened Spellbook",
        detail:
          "While holding your spellbook, it acts as your spellcasting focus; you may change the damage type of a prepared spell to another type your book contains at that slot level, and cast one ritual spell per long rest at its normal casting time instead of adding 10 minutes.",
      },
    ],
    6: [
      {
        title: "Manifest Mind",
        detail:
          "As a bonus action, a number of times equal to your proficiency bonus per long rest, manifest your spellbook's mind as a spectral, senseless object that moves up to 60 feet (30 feet per additional move) and lets you cast wizard spells as though you were in its space.",
      },
    ],
    10: [
      {
        title: "Master Scrivener",
        detail:
          "Whenever you finish a long rest, use your Wizardly Quill to copy a 1st- or 2nd-level spell with a casting time of an action from your spellbook onto a scroll, at half the usual gold and time; the scroll's spell counts as one level higher and vanishes when cast or when you finish your next long rest.",
      },
    ],
    14: [
      {
        title: "One with the Word",
        detail:
          "Gain advantage on Arcana checks while holding your spellbook. Once per long rest as a reaction, dismiss your manifested mind to negate all damage from one source, then roll 3d6 and lose access to prepared spells whose combined level equals or exceeds that total until 1d6 long rests pass.",
      },
    ],
  },
  Transmutation: {
    2: [
      {
        title: "Transmutation Savant",
        detail:
          "Copying a transmutation spell into your spellbook costs half the usual gold and time.",
      },
      {
        title: "Minor Alchemy",
        detail:
          "Turn one nonmagical material (wood, stone, iron, copper, or silver) into another of those materials for up to an hour, taking 10 minutes per cubic foot to perform; the transformation reverts early if your concentration breaks.",
      },
    ],
    6: [
      {
        title: "Transmuter's Stone",
        detail:
          "Spend 8 hours crafting a Transmuter's Stone (usable once per long rest) that grants its bearer one of: darkvision, +10 feet of speed, proficiency in Constitution saves, or resistance to acid/cold/fire/lightning/thunder damage; you may change the granted benefit each time you cast a transmutation spell of 1st level or higher.",
      },
    ],
    10: [
      {
        title: "Shapechanger",
        detail:
          "Add Polymorph to your spellbook; once per short or long rest, cast it on yourself without expending a spell slot, limited to beast forms with a challenge rating of 1 or lower.",
      },
    ],
    14: [
      {
        title: "Master Transmuter",
        detail:
          "As an action once per long rest, destroy your Transmuter's Stone to produce one of: reshaping a nonmagical object up to a 5-foot cube over 10 minutes, removing curses/diseases/poisons and fully healing one creature, casting Raise Dead without a slot, or aging a willing creature backward by 3d10 years (minimum age 13).",
      },
    ],
  },
  "War Magic": {
    2: [
      {
        title: "Arcane Deflection",
        detail:
          "As a reaction when you are hit by an attack or fail a saving throw, gain +2 AC against the triggering attack or +4 to the triggering save, though you can then cast only cantrips until the end of your next turn.",
      },
      {
        title: "Tactical Wit",
        detail: "Add your Intelligence modifier to your initiative rolls.",
      },
    ],
    6: [
      {
        title: "Power Surge",
        detail:
          "Store a number of charges equal to your Intelligence modifier (minimum 1) per long rest (also gained on a successful Counterspell or Dispel Magic); spend one charge, once per turn, to add force damage equal to half your wizard level to a damaging wizard spell you cast.",
      },
    ],
    10: [
      {
        title: "Durable Magic",
        detail:
          "While concentrating on a spell, gain +2 AC and +2 to all saving throws.",
      },
    ],
    14: [
      {
        title: "Deflecting Shroud",
        detail:
          "Whenever you use Arcane Deflection, up to three creatures of your choice within 60 feet each take force damage equal to half your wizard level.",
      },
    ],
  },
};
