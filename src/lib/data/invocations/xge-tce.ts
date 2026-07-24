import { Invocation } from "src/lib/data/invocations/types";

// Eldritch invocations introduced in Xanathar's Guide to Everything (XGE)
// and Tasha's Cauldron of Everything (TCE). Neither book is SRD content, so
// — as with the rest of src/lib/data/ non-SRD material — only mechanical
// facts are recorded here (spells granted, dice, ranges, uses-per-rest,
// prerequisites) and every `summary` is an original, paraphrased sentence.
// Never published or wikidot prose. Sorted alphabetically by name.
export const XGE_TCE_INVOCATIONS: Invocation[] = [
  {
    name: "Aspect of the Moon",
    summary:
      "You no longer need to sleep or can be forced to, and a long rest only requires 8 hours of light activity instead.",
    prerequisite: "Pact of the Tome",
  },
  {
    name: "Bond of the Talisman",
    summary:
      "You and the wearer of your talisman can each spend an action to teleport to the other's space a number of times equal to your proficiency bonus per long rest, if you share a plane.",
    prerequisite: "12th level, Pact of the Talisman",
  },
  {
    name: "Cloak of Flies",
    summary:
      "Bonus action, once per rest: a 5-ft. aura deals poison damage equal to your Charisma modifier to creatures starting their turn in it, and trades advantage on Intimidation for disadvantage on other Charisma checks.",
    prerequisite: "5th level",
  },
  {
    name: "Eldritch Mind",
    summary:
      "You have advantage on Constitution saving throws to maintain concentration on a spell.",
  },
  {
    name: "Eldritch Smite",
    summary:
      "Once per turn on a hit with your pact weapon, you can expend a warlock spell slot to add 1d8 force damage plus 1d8 per slot level, and knock a Huge or smaller target prone.",
    prerequisite: "5th level, Pact of the Blade",
  },
  {
    name: "Far Scribe",
    summary:
      "Up to a number of creatures equal to your proficiency bonus can write their names in your Book of Shadows, letting you cast sending to them without a spell slot or material components.",
    prerequisite: "5th level, Pact of the Tome",
  },
  {
    name: "Ghostly Gaze",
    summary:
      "As an action once per short or long rest, you see through solid objects and gain darkvision to 30 feet for 1 minute or until your concentration ends.",
    prerequisite: "7th level",
  },
  {
    name: "Gift of the Depths",
    summary:
      "You can breathe water, gain a swimming speed equal to your walking speed, and cast water breathing once per long rest without a spell slot.",
    prerequisite: "5th level",
  },
  {
    name: "Gift of the Ever-Living Ones",
    summary:
      "Whenever you regain hit points while your familiar is within 100 feet of you, any dice rolled for the healing count as their maximum value.",
    prerequisite: "Pact of the Chain",
  },
  {
    name: "Gift of the Protectors",
    summary:
      "Up to a number of creatures equal to your proficiency bonus can write their names in your Book of Shadows so that, once per long rest total, one of them drops to 1 hit point instead of 0 when reduced to 0.",
    prerequisite: "9th level, Pact of the Tome",
  },
  {
    name: "Grasp of Hadar",
    summary:
      "Once per turn on a hit with eldritch blast, you can pull the target 10 feet straight toward you.",
    prerequisite: "eldritch blast cantrip",
  },
  {
    name: "Improved Pact Weapon",
    summary:
      "Your pact weapon can act as your spellcasting focus, can be conjured as a bow or crossbow, and gains a +1 bonus to attack and damage rolls if it isn't already magical.",
    prerequisite: "Pact of the Blade",
  },
  {
    name: "Investment of the Chain Master",
    summary:
      "Your find familiar summon gains a 40-foot fly or swim speed, can be commanded to Attack as a bonus action with magical weapon attacks using your spell save DC, and can grant you damage resistance as a reaction.",
    prerequisite: "Pact of the Chain",
  },
  {
    name: "Lance of Lethargy",
    summary:
      "Once per turn on a hit with eldritch blast, you can reduce the target's speed by 10 feet until the end of your next turn.",
    prerequisite: "eldritch blast cantrip",
  },
  {
    name: "Maddening Hex",
    summary:
      "Bonus action: deal psychic damage equal to your Charisma modifier to a creature you have cursed within 30 ft., and to others of your choice within 5 ft. of it.",
    prerequisite: "5th level, hex spell or a cursing warlock feature",
  },
  {
    name: "Protection of the Talisman",
    summary:
      "A number of times per long rest equal to your proficiency bonus, the wearer of your talisman can add a d4 to a failed saving throw, potentially turning it into a success.",
    prerequisite: "7th level, Pact of the Talisman",
  },
  {
    name: "Rebuke of the Talisman",
    summary:
      "As a reaction when the wearer of your talisman is hit by an attacker within 30 feet you can see, you deal psychic damage equal to your proficiency bonus to the attacker and push it up to 10 feet away.",
    prerequisite: "Pact of the Talisman",
  },
  {
    name: "Relentless Hex",
    summary:
      "As a bonus action, you can teleport up to 30 feet to an unoccupied space within 5 feet of a target cursed by your hex spell (or a cursing warlock feature), provided the target is visible to you.",
    prerequisite: "7th level, hex spell or a cursing warlock feature",
  },
  {
    name: "Shroud of Shadow",
    summary: "You can cast invisibility at will without a spell slot.",
    prerequisite: "15th level",
  },
  {
    name: "Tomb of Levistus",
    summary:
      "Reaction on taking damage, once per rest: gain 10 temporary hit points per warlock level, but until the end of your next turn you are incapacitated, have speed 0, and are vulnerable to fire.",
    prerequisite: "5th level",
  },
  {
    name: "Trickster's Escape",
    summary:
      "You can cast freedom of movement on yourself once per long rest without a spell slot.",
    prerequisite: "7th level",
  },
  {
    name: "Undying Servitude",
    summary:
      "You can cast animate dead once per long rest without expending a spell slot.",
    prerequisite: "5th level",
  },
];
