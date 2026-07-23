import { OfficialClass } from "src/lib/data/data-definitions";
import { Character, ChosenOption } from "src/lib/types";

// The closed option lists a class lets you pick a fixed number of things from:
// Metamagic, Battle Master maneuvers, Pact Boon. Distinct from `features`
// (open-ended prose) and from limited-use pools (a resource) — what makes these
// their own model is the pairing of a *closed list* with a *known count*, which
// is what lets the sheet say "3 / 5 known" and offer only the rest.
//
// Licensing: Metamagic and Pact Boon are open-license SRD (both are base-class
// features). The Battle Master is *not* in the SRD, so its maneuver summaries
// below are original paraphrases of mechanical facts only — never published
// prose. Same rule as `nonsrd-classes.ts` / `subclasses.ts`.

export interface OptionDef {
  name: string;
  // What this specific option does. Omitted for "pick a type" lists where every
  // option has the same effect (a ranger's favored enemy) — those describe it
  // once on the group instead.
  summary?: string;
}

export interface OptionGroup {
  // Stable key, stored on each `ChosenOption.category`.
  category: string;
  // Shown as the section heading.
  label: string;
  // The effect shared by every option in the group, when the options themselves
  // are just values (see `OptionDef.summary`).
  summary?: string;
  // The class that grants the picks, and (for a subclass feature) which
  // subclass — a fighter only gets maneuvers as a Battle Master.
  className: OfficialClass;
  subclass?: string;
  // How many you know at a given class level: the last threshold reached.
  // `[level, count]` pairs, ascending.
  known: [number, number][];
  options: OptionDef[];
}

// The count from a step table at a level: the last entry the level has reached,
// or 0 before the first. Mirrors `atLevel` in class-pools.ts, but zero-based —
// "you don't have this feature yet" is a real answer here.
const knownAt = (level: number, steps: [number, number][]): number => {
  let value = 0;
  for (const [at, count] of steps) if (level >= at) value = count;
  return value;
};

export const OPTION_GROUPS: OptionGroup[] = [
  // The two ranger lists are the only groups available at level 1, which makes
  // them the only ones the character-creation wizard ever prompts for — the
  // rest all start at class level 3.
  {
    category: "favoredEnemy",
    label: "Favored Enemy",
    summary:
      "Advantage on Survival checks to track them and on Intelligence checks to recall information about them. You also learn one language of your choice that they speak.",
    className: OfficialClass.Ranger,
    known: [
      [1, 1],
      [6, 2],
      [14, 3],
    ],
    options: [
      { name: "Aberrations" },
      { name: "Beasts" },
      { name: "Celestials" },
      { name: "Constructs" },
      { name: "Dragons" },
      { name: "Elementals" },
      { name: "Fey" },
      { name: "Fiends" },
      { name: "Giants" },
      { name: "Monstrosities" },
      { name: "Oozes" },
      { name: "Plants" },
      { name: "Undead" },
      {
        name: "Two humanoid races",
        summary: "Counts as one choice — pick two races of humanoid.",
      },
    ],
  },
  {
    category: "naturalExplorer",
    label: "Natural Explorer",
    summary:
      "In this terrain: difficult terrain doesn't slow your group, you can't get lost except by magic, you stay alert while tracking/foraging/navigating, you travel stealthily at a normal pace alone, you forage twice as much, and you learn the exact number and size of creatures you track. Intelligence and Wisdom checks related to it are doubly proficient.",
    className: OfficialClass.Ranger,
    known: [
      [1, 1],
      [6, 2],
      [10, 3],
    ],
    options: [
      { name: "Arctic" },
      { name: "Coast" },
      { name: "Desert" },
      { name: "Forest" },
      { name: "Grassland" },
      { name: "Mountain" },
      { name: "Swamp" },
    ],
  },
  {
    category: "metamagic",
    label: "Metamagic",
    className: OfficialClass.Sorcerer,
    known: [
      [3, 2],
      [10, 3],
      [17, 4],
    ],
    options: [
      {
        name: "Careful Spell",
        summary:
          "Spend 1 sorcery point to let up to your Charisma modifier of creatures automatically succeed on the spell's saving throw.",
      },
      {
        name: "Distant Spell",
        summary:
          "Spend 1 sorcery point to double a spell's range, or to give a touch spell a range of 30 feet.",
      },
      {
        name: "Empowered Spell",
        summary:
          "Spend 1 sorcery point to reroll up to your Charisma modifier of a spell's damage dice, keeping the new rolls.",
      },
      {
        name: "Extended Spell",
        summary:
          "Spend 1 sorcery point to double a spell's duration, to a maximum of 24 hours.",
      },
      {
        name: "Heightened Spell",
        summary:
          "Spend 3 sorcery points to give one target disadvantage on its first saving throw against the spell.",
      },
      {
        name: "Quickened Spell",
        summary:
          "Spend 2 sorcery points to cast a 1-action spell as a bonus action instead.",
      },
      {
        name: "Subtle Spell",
        summary:
          "Spend 1 sorcery point to cast without verbal or somatic components.",
      },
      {
        name: "Twinned Spell",
        summary:
          "Spend sorcery points equal to the spell's level (1 for a cantrip) to target a second creature with a single-target spell.",
      },
    ],
  },
  {
    category: "pactBoon",
    label: "Pact Boon",
    className: OfficialClass.Warlock,
    known: [[3, 1]],
    options: [
      {
        name: "Pact of the Blade",
        summary:
          "Create a pact weapon as an action; you're proficient with it, and can bond an existing magic weapon to it.",
      },
      {
        name: "Pact of the Chain",
        summary:
          "Learn Find Familiar; the familiar can take an extra exotic form, and can forgo its attack so you can use yours.",
      },
      {
        name: "Pact of the Tome",
        summary:
          "Gain a Book of Shadows holding three cantrips from any class's list, castable at will.",
      },
    ],
  },
  {
    category: "maneuvers",
    label: "Maneuvers",
    className: OfficialClass.Fighter,
    subclass: "Battle Master",
    known: [
      [3, 3],
      [7, 5],
      [10, 7],
      [15, 9],
    ],
    options: [
      {
        name: "Ambush",
        summary: "Add the die to a Stealth check or initiative roll.",
      },
      {
        name: "Bait and Switch",
        summary:
          "Swap places with a willing adjacent creature; one of you gains the die as an AC bonus for a round.",
      },
      {
        name: "Commander's Strike",
        summary:
          "Give up one attack to let an ally use its reaction to attack, adding the die to its damage.",
      },
      {
        name: "Disarming Attack",
        summary:
          "Add the die to damage; the target makes a STR save or drops an item of your choice.",
      },
      {
        name: "Distracting Strike",
        summary:
          "Add the die to damage; the next attack against that target by another creature has advantage.",
      },
      {
        name: "Evasive Footwork",
        summary: "Add the die to your AC while you move.",
      },
      {
        name: "Feinting Attack",
        summary:
          "Spend a bonus action to gain advantage against an adjacent creature, adding the die to damage on a hit.",
      },
      {
        name: "Goading Attack",
        summary:
          "Add the die to damage; the target makes a WIS save or has disadvantage attacking anyone but you.",
      },
      {
        name: "Grappling Strike",
        summary:
          "After hitting, spend a bonus action to grapple, adding the die to the contested check.",
      },
      {
        name: "Lunging Attack",
        summary: "Add 5 feet of reach to a melee attack and the die to damage.",
      },
      {
        name: "Maneuvering Attack",
        summary:
          "Add the die to damage; an ally can use its reaction to move half its speed without provoking from the target.",
      },
      {
        name: "Menacing Attack",
        summary:
          "Add the die to damage; the target makes a WIS save or is frightened of you until your next turn ends.",
      },
      {
        name: "Parry",
        summary:
          "As a reaction, reduce melee damage taken by the die plus your DEX modifier.",
      },
      {
        name: "Precision Attack",
        summary:
          "Add the die to an attack roll, before or after seeing it miss.",
      },
      {
        name: "Pushing Attack",
        summary:
          "Add the die to damage; a Large or smaller target makes a STR save or is pushed 15 feet.",
      },
      {
        name: "Quick Toss",
        summary:
          "Draw and throw a weapon as a bonus action, adding the die to its damage.",
      },
      {
        name: "Rally",
        summary:
          "As a bonus action, give an ally temporary hit points equal to the die plus your CHA modifier.",
      },
      {
        name: "Riposte",
        summary:
          "As a reaction to a melee miss against you, attack that creature and add the die to damage.",
      },
      {
        name: "Sweeping Attack",
        summary:
          "On a hit, deal the die as damage to a second creature within reach of the same attack.",
      },
      {
        name: "Tripping Attack",
        summary:
          "Add the die to damage; a Large or smaller target makes a STR save or is knocked prone.",
      },
    ],
  },
];

export const optionGroup = (category: string): OptionGroup | undefined =>
  OPTION_GROUPS.find((g) => g.category === category);

// The groups this character has access to, with how many picks each allows at
// their current level. A group whose class isn't on the sheet — or whose
// subclass doesn't match, or whose level threshold isn't reached — is omitted,
// so the sheet shows nothing until the choice is actually available.
export function availableOptionGroups(
  character: Character,
): { group: OptionGroup; known: number }[] {
  return OPTION_GROUPS.flatMap((group) => {
    const klass = character.class.find(
      (k) =>
        k.name === group.className &&
        (!group.subclass || k.subclass === group.subclass),
    );
    if (!klass) return [];
    const known = knownAt(klass.level, group.known);
    return known > 0 ? [{ group, known }] : [];
  });
}

// How many *new* picks reaching `level` in a class grants, per group: the
// count at that level minus the count at the one below. Used by both wizards to
// prompt only for what this level actually adds.
//
// `subclass` is passed separately rather than read off the character because
// the subclass is often chosen in the *same* step — a fighter picking Battle
// Master at 3rd gets their first three maneuvers immediately.
export function newOptionPicksAt(
  className: string,
  level: number,
  subclass?: string,
): { group: OptionGroup; count: number }[] {
  return OPTION_GROUPS.flatMap((group) => {
    if (group.className !== className) return [];
    if (group.subclass && group.subclass !== subclass) return [];
    const count = knownAt(level, group.known) - knownAt(level - 1, group.known);
    return count > 0 ? [{ group, count }] : [];
  });
}

// The character's picks in one category, in catalog order.
export const chosenIn = (
  character: Character,
  category: string,
): ChosenOption[] =>
  (character.chosenOptions ?? []).filter((o) => o.category === category);
