import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each ranger subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const RANGER_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Beast Master": {
    3: [
      {
        title: "Ranger's Companion",
        detail:
          "Bond with a CR 1/4 or lower beast (AC, attacks, and other stats are its own; HP equal to 4x your ranger level or its own maximum, whichever is higher) that acts on your turn when you use a bonus action to command it.",
      },
    ],
    7: [
      {
        title: "Exceptional Training",
        detail:
          "On a turn your companion doesn't attack, spend a bonus action to have it Dash, Disengage, or Help instead; its attacks now count as magical for overcoming resistance.",
      },
    ],
    11: [
      {
        title: "Bestial Fury",
        detail:
          "When you command your companion to attack, it can make two attacks of its own (or use its own Multiattack if it has one).",
      },
    ],
    15: [
      {
        title: "Share Spells",
        detail:
          "When you cast a spell targeting only yourself, you can also affect your companion if it is within 30 feet of you.",
      },
    ],
  },
  Drakewarden: {
    3: [
      {
        title: "Drake Companion",
        detail:
          "Use an action to summon a Tiny draconic companion within 30 feet (AC 14 + your proficiency bonus, HP 5 + 5x your ranger level, its own Bite attack and reaction); it returns on a long rest or by expending a 1st-level or higher spell slot.",
      },
      {
        title: "Draconic Gift",
        detail:
          "Learn the Thaumaturgy cantrip and one additional language, typically Draconic.",
      },
    ],
    7: [
      {
        title: "Bond of Fang and Scale",
        detail:
          "Your drake grows to Medium size and can be mounted, gains a flying speed equal to its walking speed, its Bite deals an extra 1d6 damage, and you gain resistance to its damage type.",
      },
    ],
    11: [
      {
        title: "Drake's Breath",
        detail:
          "As an action, your drake can exhale in a 30-foot cone for 8d6 damage of its type (10d6 at 15th level), each creature making a Dexterity save against your spell save DC for half; it recharges on a long rest or by expending a 3rd-level or higher spell slot.",
      },
    ],
    15: [
      {
        title: "Perfected Bond",
        detail:
          "Your drake grows to Large size (rideable while flying) and its Bite bonus damage becomes 2d6; a number of times per long rest equal to your proficiency bonus, you can use a reaction to grant yourself or your drake resistance to a single instance of damage either of you takes.",
      },
    ],
  },
  "Fey Wanderer": {
    3: [
      {
        title: "Dreadful Strikes",
        detail:
          "Once per turn on a hit, deal an extra 1d4 psychic damage, rising to 1d6 at 11th level.",
      },
      {
        title: "Otherworldly Glamour",
        detail:
          "Add your Wisdom modifier (minimum +1) to Charisma checks, and gain proficiency in one of Deception, Performance, or Persuasion.",
      },
      {
        title: "Fey Wanderer Magic",
        detail:
          "Always have Charm Person prepared as a bonus known spell (cast normally using a spell slot, not for free); gain further bonus spells at 5th level (Misty Step), 9th (Dispel Magic), 13th (Dimension Door), and 17th (Mislead), none counting against your spells known.",
      },
    ],
    7: [
      {
        title: "Beguiling Twist",
        detail:
          "Gain advantage on saves against being charmed or frightened; when you or an ally within 120 feet succeeds on such a save, you can force a different creature within 120 feet to make a Wisdom save against your spell save DC or be charmed or frightened for 1 minute.",
      },
    ],
    11: [
      {
        title: "Fey Reinforcements",
        detail:
          "Once per long rest, cast Summon Fey without a spell slot or material components (optionally ending your concentration early to cap the duration at 1 minute).",
      },
    ],
    15: [
      {
        title: "Misty Wanderer",
        detail:
          "Cast Misty Step without expending a spell slot a number of times per long rest equal to your Wisdom modifier (minimum 1), optionally bringing one willing creature within 5 feet along with you.",
      },
    ],
  },
  "Gloom Stalker": {
    3: [
      {
        title: "Dread Ambusher",
        detail:
          "Add your Wisdom modifier to initiative rolls; on your first turn in combat, take an extra attack, and the first hit that turn deals an extra 1d8 of the weapon's damage type.",
      },
      {
        title: "Umbral Sight",
        detail:
          "Gain darkvision to 60 feet, or +30 feet if you already have it, and become invisible to creatures relying on darkvision to see you in darkness.",
      },
      {
        title: "Gloom Stalker Magic",
        detail:
          "Always have Disguise Self prepared as a bonus known spell, cast normally using a spell slot and not counting against your spells known.",
      },
    ],
    7: [
      {
        title: "Iron Mind",
        detail:
          "Gain proficiency in Wisdom saving throws, or in Intelligence or Charisma saves instead if already proficient in Wisdom.",
      },
    ],
    11: [
      {
        title: "Stalker's Flurry",
        detail:
          "Once per turn when you miss with a weapon attack, make another weapon attack as part of the same action.",
      },
    ],
    15: [
      {
        title: "Shadowy Dodge",
        detail:
          "As a reaction, before an attack roll is revealed to hit or miss, impose disadvantage on an attack against you if the attacker didn't already have advantage.",
      },
    ],
  },
  "Horizon Walker": {
    3: [
      {
        title: "Detect Portal",
        detail:
          "Once per short or long rest, use an action to sense the direction and distance to the nearest planar portal within 1 mile.",
      },
      {
        title: "Planar Warrior",
        detail:
          "As a bonus action, mark a creature within 30 feet; the next hit against it that turn deals all its damage as force damage plus an extra 1d8 force damage, rising to 2d8 at 11th level.",
      },
      {
        title: "Horizon Walker Magic",
        detail:
          "Always have Protection from Evil and Good prepared as a bonus known spell (cast normally using a spell slot, not for free); gain further bonus spells at 5th level (Misty Step), 9th (Haste), 13th (Banishment), and 17th (Teleportation Circle), none counting against your spells known.",
      },
    ],
    7: [
      {
        title: "Ethereal Step",
        detail:
          "Once per short or long rest, cast Etherealness as a bonus action without a spell slot, though the effect ends at the end of the current turn.",
      },
    ],
    11: [
      {
        title: "Distant Strike",
        detail:
          "During your Attack action, teleport up to 10 feet before each attack; if you hit at least two different creatures this turn, make one additional attack against a third.",
      },
    ],
    15: [
      {
        title: "Spectral Defense",
        detail:
          "As a reaction when you take damage, gain resistance to that attack's damage type for the rest of the turn.",
      },
    ],
  },
  Hunter: {
    3: [
      {
        title: "Hunter's Prey",
        detail:
          "Choose one option: Colossus Slayer (once per turn, an extra 1d8 damage to a creature below its hit point maximum), Giant Killer (reaction attack against a Large or larger creature within 5 feet that hits or misses you), or Horde Breaker (once per turn on a weapon hit, make one more attack against a different creature within 5 feet of the first target).",
      },
    ],
    7: [
      {
        title: "Defensive Tactics",
        detail:
          "Choose one option: Escape the Horde (attacks of opportunity against you are made with disadvantage), Multiattack Defense (+4 AC against further attacks from a creature that just hit you this turn), or Steel Will (advantage on saves against being frightened).",
      },
    ],
    11: [
      {
        title: "Multiattack",
        detail:
          "Choose one option: Volley (make a ranged attack against any number of creatures within 10 feet of a point you can see in range, rolling separately against each) or Whirlwind Attack (make a melee attack against any number of creatures within 5 feet of you, rolling separately against each).",
      },
    ],
    15: [
      {
        title: "Superior Hunter's Defense",
        detail:
          "Choose one option: Evasion (a Dexterity save for half damage instead deals no damage on success and half on failure), Stand Against the Tide (reaction to redirect a missed melee attack against you onto another creature within its reach), or Uncanny Dodge (reaction to halve an attack's damage against you).",
      },
    ],
  },
  "Monster Slayer": {
    3: [
      {
        title: "Monster Slayer Magic",
        detail:
          "You learn an additional spell at 3rd, 5th, 9th, 13th, and 17th level; it's always prepared and doesn't count against the number you can prepare.",
      },
      {
        title: "Hunter's Sense",
        detail:
          "As an action, learn a seen creature's damage immunities, resistances, and vulnerabilities, a number of times per long rest equal to your Wisdom modifier (minimum 1).",
      },
      {
        title: "Slayer's Prey",
        detail:
          "As a bonus action, mark a creature within 60 feet; the first hit against it each turn deals an extra 1d6 damage until you switch targets or finish a rest.",
      },
    ],
    7: [
      {
        title: "Supernatural Defense",
        detail:
          "Add 1d6 to your own saving throw or grapple-escape check when your marked target's ability, spell, or effect forces the roll.",
      },
    ],
    11: [
      {
        title: "Magic-User's Nemesis",
        detail:
          "As a reaction when you see your marked target within 60 feet casting a spell or attempting to teleport, force it to make a Wisdom save against your spell save DC or waste the spell or teleport; recharges on a short or long rest.",
      },
    ],
    15: [
      {
        title: "Slayer's Counter",
        detail:
          "When your marked target forces you to make a saving throw, you can use a reaction to make one weapon attack against it before rolling the save; if that attack hits, your save automatically succeeds in addition to the attack's normal effects.",
      },
    ],
  },
  Swarmkeeper: {
    3: [
      {
        title: "Gathered Swarm",
        detail:
          "Once per turn after you hit a creature, choose one: deal an extra 1d6 piercing damage, force a Strength save or move it 15 feet, or move yourself 5 feet.",
      },
      {
        title: "Swarmkeeper Magic",
        detail:
          "Learn the Mage Hand cantrip (reflavored as your swarm) if you don't already know it; always have Faerie Fire prepared as a bonus known spell (cast normally using a spell slot), with further bonus spells at 5th level (Web), 9th (Gaseous Form), 13th (Arcane Eye), and 17th (Insect Plague).",
      },
    ],
    7: [
      {
        title: "Writhing Tide",
        detail:
          "As a bonus action, gain a 10-foot flying speed and the ability to hover for 1 minute or until incapacitated, a number of times per long rest equal to your proficiency bonus.",
      },
    ],
    11: [
      {
        title: "Mighty Swarm",
        detail:
          "Gathered Swarm's damage option improves to 1d8 piercing damage; a target that fails the save against being moved can also be knocked prone; and moving yourself now grants half cover until the start of your next turn.",
      },
    ],
    15: [
      {
        title: "Swarming Dispersal",
        detail:
          "As a reaction when you take damage, gain resistance to that damage and teleport to an unoccupied space within 30 feet, a number of times per long rest equal to your proficiency bonus.",
      },
    ],
  },
};
