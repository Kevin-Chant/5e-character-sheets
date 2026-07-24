import { Invocation } from "src/lib/data/invocations/types";

// Eldritch invocations from the Player's Handbook (2014). Not SRD content,
// so — as with the rest of src/lib/data/ non-SRD material — only mechanical
// facts are recorded here (spells granted, dice, ranges, uses-per-rest,
// prerequisites) and every `summary` is an original, paraphrased sentence.
// Never published or wikidot prose. Sorted alphabetically by name.
export const PHB_INVOCATIONS: Invocation[] = [
  {
    name: "Agonizing Blast",
    summary: "Add your Charisma modifier to Eldritch Blast damage.",
    prerequisite: "Eldritch Blast cantrip",
  },
  {
    name: "Armor of Shadows",
    summary: "Cast Mage Armor on yourself at will, without a slot.",
  },
  {
    name: "Ascendant Step",
    summary: "Cast Levitate on yourself at will, without a slot.",
    prerequisite: "9th level",
  },
  {
    name: "Beast Speech",
    summary: "Cast Speak with Animals at will, without a slot.",
  },
  {
    name: "Beguiling Influence",
    summary: "Gain proficiency in Deception and Persuasion.",
  },
  {
    name: "Bewitching Whispers",
    summary: "Cast Compulsion once per long rest using a warlock spell slot.",
    prerequisite: "7th level",
  },
  {
    name: "Book of Ancient Secrets",
    summary:
      "Inscribe and ritual-cast spells from any class list in your Book of Shadows.",
    prerequisite: "Pact of the Tome",
  },
  {
    name: "Chains of Carceri",
    summary:
      "Cast Hold Monster at will on a celestial, fiend, or elemental, without a slot, limited to once per long rest against the same target.",
    prerequisite: "15th level, Pact of the Chain",
  },
  {
    name: "Devil's Sight",
    summary: "See normally in darkness, magical or not, to 120 ft.",
  },
  {
    name: "Dreadful Word",
    summary: "Cast Confusion once per long rest using a warlock spell slot.",
    prerequisite: "7th level",
  },
  {
    name: "Eldritch Sight",
    summary: "Cast Detect Magic at will, without a slot.",
  },
  {
    name: "Eldritch Spear",
    summary: "Extend Eldritch Blast's range to 300 ft.",
    prerequisite: "Eldritch Blast cantrip",
  },
  {
    name: "Eyes of the Rune Keeper",
    summary: "Read all writing.",
  },
  {
    name: "Fiendish Vigor",
    summary: "Cast False Life on yourself at will as a 1st-level spell.",
  },
  {
    name: "Gaze of Two Minds",
    summary:
      "Action: touch a willing humanoid to see and hear through its senses until the end of your next turn, blind and deaf to your own surroundings meanwhile.",
  },
  {
    name: "Lifedrinker",
    summary:
      "Add your Charisma modifier (minimum 1) as extra necrotic damage on hits with your pact weapon.",
    prerequisite: "12th level, Pact of the Blade",
  },
  {
    name: "Mask of Many Faces",
    summary: "Cast Disguise Self at will, without a slot.",
  },
  {
    name: "Master of Myriad Forms",
    summary: "Cast Alter Self at will, without a slot.",
    prerequisite: "15th level",
  },
  {
    name: "Minions of Chaos",
    summary:
      "Cast Conjure Elemental once per long rest using a warlock spell slot.",
    prerequisite: "9th level",
  },
  {
    name: "Mire the Mind",
    summary: "Cast Slow once per long rest using a warlock spell slot.",
    prerequisite: "5th level",
  },
  {
    name: "Misty Visions",
    summary: "Cast Silent Image at will, without a slot.",
  },
  {
    name: "One with Shadows",
    summary:
      "While in dim light or darkness, spend your action to turn invisible until you move, act, or take a reaction.",
    prerequisite: "5th level",
  },
  {
    name: "Otherworldly Leap",
    summary: "Cast Jump on yourself at will, without a slot.",
    prerequisite: "9th level",
  },
  {
    name: "Repelling Blast",
    summary: "Eldritch Blast pushes a hit creature 10 ft. away.",
    prerequisite: "Eldritch Blast cantrip",
  },
  {
    name: "Sculptor of Flesh",
    summary: "Cast Polymorph once per long rest using a warlock spell slot.",
    prerequisite: "7th level",
  },
  {
    name: "Sign of Ill Omen",
    summary: "Cast Bestow Curse once per long rest using a warlock spell slot.",
    prerequisite: "5th level",
  },
  {
    name: "Thief of Five Fates",
    summary: "Cast Bane once per long rest using a warlock spell slot.",
  },
  {
    name: "Thirsting Blade",
    summary:
      "Attack twice with your pact weapon when you take the Attack action.",
    prerequisite: "5th level, Pact of the Blade",
  },
  {
    name: "Visions of Distant Realms",
    summary: "Cast Arcane Eye at will, without a slot.",
    prerequisite: "15th level",
  },
  {
    name: "Voice of the Chain Master",
    summary:
      "Communicate telepathically with your familiar, perceive through its senses, and speak through it in your own voice, as long as you share a plane.",
    prerequisite: "Pact of the Chain",
  },
  {
    name: "Whispers of the Grave",
    summary: "Cast Speak with Dead at will, without a slot.",
    prerequisite: "9th level",
  },
  {
    name: "Witch Sight",
    summary:
      "See the true form of any shapechanger or creature disguised by illusion or transmutation magic within 30 ft. and in your line of sight.",
    prerequisite: "15th level",
  },
];
