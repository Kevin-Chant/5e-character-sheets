import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each sorcerer subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const SORCERER_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Aberrant Mind": {
    1: [
      {
        title: "Psionic Spells (level 1)",
        detail:
          "You always know Arms of Hadar, Dissonant Whispers, and Mind Sliver, on top of your other known spells.",
      },
    ],
    3: [
      {
        title: "Psionic Spells (level 3)",
        detail:
          "You always know Calm Emotions and Detect Thoughts, on top of your other known spells.",
      },
    ],
    5: [
      {
        title: "Psionic Spells (level 5)",
        detail:
          "You always know Hunger of Hadar and Sending, on top of your other known spells.",
      },
    ],
    6: [
      {
        title: "Psionic Sorcery",
        detail:
          "You can cast any of your Psionic Spells by spending sorcery points equal to the spell's level instead of a spell slot.",
      },
      {
        title: "Psychic Defenses",
        detail:
          "You gain resistance to psychic damage and advantage on saving throws against being charmed or frightened.",
      },
    ],
    7: [
      {
        title: "Psionic Spells (level 7)",
        detail:
          "You always know Evard's Black Tentacles and Summon Aberration, on top of your other known spells.",
      },
    ],
    9: [
      {
        title: "Psionic Spells (level 9)",
        detail:
          "You always know Rary's Telepathic Bond and Telekinesis, on top of your other known spells.",
      },
    ],
    14: [
      {
        title: "Revelation in Flesh",
        detail:
          "As a bonus action, spend at least 1 sorcery point to warp your body for 10 minutes; spend more points to add benefits such as the ability to see invisible creatures within 60 ft., a flying speed equal to your walking speed (with the ability to hover), a doubled swim speed with waterbreathing, or the ability to move through gaps as narrow as 1 inch without squeezing.",
      },
    ],
    18: [
      {
        title: "Warping Implosion",
        detail:
          "As an action, teleport up to 120 ft to an unoccupied space you can see; every creature within 30 ft of your former space makes a Strength save, taking 3d10 force damage and being pulled to that space on a failure, or half damage with no pull on a success. Usable once per long rest, or again by spending 5 sorcery points.",
      },
    ],
  },
  "Clockwork Soul": {
    1: [
      {
        title: "Clockwork Magic (level 1)",
        detail:
          "You always know Alarm and Protection from Evil and Good, on top of your other known spells.",
      },
    ],
    3: [
      {
        title: "Clockwork Magic (level 3)",
        detail:
          "You always know Aid and Lesser Restoration, on top of your other known spells.",
      },
    ],
    5: [
      {
        title: "Clockwork Magic (level 5)",
        detail:
          "You always know Dispel Magic and Protection from Energy, on top of your other known spells.",
      },
    ],
    6: [
      {
        title: "Bastion of Law",
        detail:
          "As a bonus action, spend 1 to 5 sorcery points to grant yourself or a creature within 30 ft. a ward of that many d8s; when the warded creature takes damage, it can expend and roll ward dice to reduce that damage, until the dice run out or you take a long rest.",
      },
    ],
    7: [
      {
        title: "Clockwork Magic (level 7)",
        detail:
          "You always know Freedom of Movement and Summon Construct, on top of your other known spells.",
      },
    ],
    9: [
      {
        title: "Clockwork Magic (level 9)",
        detail:
          "You always know Greater Restoration and Wall of Force, on top of your other known spells.",
      },
    ],
    14: [
      {
        title: "Trance of Order",
        detail:
          "As a bonus action, enter a 1-minute trance in which your d20 rolls of 9 or lower on attacks, ability checks, and saves count as 10, and attackers gain no advantage against you from being unseen. Usable once per long rest for free, or again by spending 5 sorcery points.",
      },
    ],
    18: [
      {
        title: "Clockwork Cavalcade",
        detail:
          "As an action, summon spirits of order in a 30-ft. cube for one minute: they restore up to 100 hit points distributed among creatures of your choice, repair damaged objects, and end spells of 6th level or lower on creatures and objects in the area. Usable once per long rest, or again by spending 7 sorcery points.",
      },
    ],
  },
  "Divine Soul": {
    6: [
      {
        title: "Empowered Healing",
        detail:
          "Once per turn when you or an ally within 5 ft. rolls dice to restore hit points, you can spend 1 sorcery point to reroll any number of those dice once.",
      },
    ],
    14: [
      {
        title: "Angelic Form",
        detail:
          "As a bonus action, sprout spectral wings that grant a flying speed of 30 ft. until you dismiss them, are incapacitated, or die.",
      },
    ],
    18: [
      {
        title: "Unearthly Recovery",
        detail:
          "Once per long rest, if you are below half your hit point maximum, use a bonus action to regain hit points equal to half your maximum.",
      },
    ],
  },
  "Draconic Bloodline": {
    6: [
      {
        title: "Elemental Affinity",
        detail:
          "When you cast a spell that deals damage of your draconic type, add your Charisma modifier to one damage roll of that spell; you can also spend 1 sorcery point to gain resistance to that damage type for 1 hour.",
      },
    ],
    14: [
      {
        title: "Dragon Wings",
        detail:
          "As a bonus action, manifest spectral wings that grant a flying speed equal to your current speed until you dismiss them as a bonus action.",
      },
    ],
    18: [
      {
        title: "Draconic Presence",
        detail:
          "As an action, spend 5 sorcery points to exude an aura of awe or fear in a 60-ft. radius for up to 1 minute; each hostile creature that starts its turn in the aura must succeed on a Wisdom save or be charmed (awe) or frightened (fear) until the aura ends, and a creature that succeeds is immune to the aura for 24 hours.",
      },
    ],
  },
  "Lunar Sorcery": {
    6: [
      {
        title: "Lunar Boons & Waxing and Waning",
        detail:
          "A number of times per long rest equal to your proficiency bonus, Metamagic options that match your current moon phase's schools of magic cost 1 fewer sorcery point (minimum 0); you can also switch phases for 1 sorcery point as a bonus action instead of only after a long rest.",
      },
    ],
    14: [
      {
        title: "Lunar Empowerment",
        detail:
          "While in your full-moon phase you shed light and have advantage on Wisdom (Perception) and Intelligence (Investigation) checks; in your new-moon phase you have advantage on Dexterity (Stealth) checks and attackers have disadvantage against you in darkness; in your crescent-moon phase you have resistance to necrotic and radiant damage.",
      },
    ],
    18: [
      {
        title: "Lunar Phenomenon",
        detail:
          "As a bonus action once per long rest (or again by spending 5 sorcery points), unleash an effect tied to your current phase: full moon forces a Constitution save on nearby creatures or they're blinded, while a creature of your choice regains 3d8 hit points; new moon deals necrotic damage in a radius on a failed Dexterity save and turns you invisible; crescent moon teleports you (and a willing ally) a short distance and grants resistance to all damage until your next turn.",
      },
    ],
  },
  "Shadow Magic": {
    6: [
      {
        title: "Hound of Ill Omen",
        detail:
          "As a bonus action, spend 3 sorcery points to summon a spectral hound (using a dire wolf's statistics) for up to 5 minutes to hunt a creature you can see within 120 ft.",
      },
    ],
    14: [
      {
        title: "Shadow Walk",
        detail:
          "While in dim light or darkness, use a bonus action to teleport up to 120 ft. to an unoccupied space you can see that is also in dim light or darkness.",
      },
    ],
    18: [
      {
        title: "Umbral Form",
        detail:
          "As a bonus action, spend 6 sorcery points to transform into a shadowy form for 1 minute: you gain resistance to all damage except force and radiant, and can move through creatures and objects as if they were difficult terrain, taking force damage if you end your turn inside one.",
      },
    ],
  },
  "Storm Sorcery": {
    6: [
      {
        title: "Heart of the Storm",
        detail:
          "You gain resistance to lightning and thunder damage, and when you cast a spell of 1st level or higher that deals lightning or thunder damage, each creature of your choice within 10 ft. takes lightning or thunder damage equal to half your sorcerer level.",
      },
      {
        title: "Storm Guide",
        detail:
          "If it's raining, use an action to stop rain falling in a 20-ft. radius centered on you, ending the effect early as a bonus action. If it's windy, use a bonus action each round to set the wind direction in a 100-ft. radius centered on you.",
      },
    ],
    14: [
      {
        title: "Storm's Fury",
        detail:
          "When you're hit by a melee attack, use your reaction to deal lightning damage equal to your sorcerer level to the attacker, who must also succeed on a Strength save or be pushed 20 ft. away from you.",
      },
    ],
    18: [
      {
        title: "Wind Soul",
        detail:
          "You gain immunity to lightning and thunder damage and a flying speed of 60 ft.; as an action, you can reduce your own flying speed to 30 ft. for 1 hour to grant a 30-ft. flying speed for that hour to a number of creatures within 30 ft. equal to 3 + your Charisma modifier.",
      },
    ],
  },
  "Wild Magic": {
    6: [
      {
        title: "Bend Luck",
        detail:
          "When another creature you can see makes an attack roll, ability check, or saving throw, use your reaction and spend 2 sorcery points to roll 1d4 and apply it as a bonus or penalty to that roll.",
      },
    ],
    14: [
      {
        title: "Controlled Chaos",
        detail:
          "Whenever you roll on the Wild Magic Surge table, roll twice and use either result.",
      },
    ],
    18: [
      {
        title: "Spell Bombardment",
        detail:
          "Once per turn, when you roll damage for a sorcerer spell and roll the highest number on a damage die, roll that die again and add it to the damage.",
      },
    ],
  },
};
