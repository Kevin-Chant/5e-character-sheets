import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each artificer subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const ARTIFICER_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Alchemist: {
    3: [
      {
        title: "Experimental Elixir",
        detail:
          "After a long rest, brew one elixir (two at level 6, three at level 15; more by spending a spell slot); a drinker rolls d6 for one of six effects: healing (2d4 + INT), +10 ft speed for an hour, +1 AC for 10 minutes, a +1d4 bonus to attack rolls and saves for 1 minute, 10 ft of flight for 10 minutes, or an Alter Self-like transformation for 10 minutes.",
      },
    ],
    5: [
      {
        title: "Alchemical Savant",
        detail:
          "When you cast a spell through alchemist's supplies, add your INT modifier (minimum +1) to one healing roll or one acid, fire, necrotic, or poison damage roll of that spell.",
      },
    ],
    9: [
      {
        title: "Restorative Reagents",
        detail:
          "Your Experimental Elixirs now also grant the drinker temporary hit points equal to 2d6 + your INT modifier; a number of times per long rest equal to your INT modifier (minimum once), you can also cast Lesser Restoration without a spell slot.",
      },
    ],
    15: [
      {
        title: "Chemical Mastery",
        detail:
          "You gain resistance to acid and poison damage and immunity to the poisoned condition, and once per long rest each you can cast Greater Restoration or Heal without expending a spell slot.",
      },
    ],
  },
  Armorer: {
    3: [
      {
        title: "Arcane Armor",
        detail:
          "As an action with smith's tools, turn worn armor into an arcane focus that ignores Strength requirements; it can't be removed against your will, and donning/doffing it takes an action.",
      },
      {
        title: "Armor Model: Guardian",
        detail:
          "Your gauntlets deal 1d8 thunder damage unarmed and impose disadvantage on the target's attacks against anyone but you until your next turn; as a bonus action a number of times per long rest equal to your proficiency bonus, grant yourself temporary hit points equal to your artificer level.",
      },
      {
        title: "Armor Model: Infiltrator",
        detail:
          "Your armor's launcher makes a ranged attack (90/300 ft, 1d6 lightning, plus an extra 1d6 lightning the first time you hit each of your turns), your speed increases by 5 ft, and you gain advantage on Stealth checks.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail:
          "Attack twice, instead of once, whenever you take the Attack action on your turn.",
      },
    ],
    9: [
      {
        title: "Armor Modifications",
        detail:
          "Your Arcane Armor now counts as four separate items (helmet, chest piece, boots, and one weapon) for infusions, and the number of infused items you can have active at once increases by two.",
      },
    ],
    15: [
      {
        title: "Perfected Armor (Guardian)",
        detail:
          "When a Huge or larger creature ends its turn within 30 feet of you, use your reaction to pull it up to 25 feet toward you (it can attempt a Strength save to resist); if it ends adjacent to you, make a free melee attack against it.",
      },
      {
        title: "Perfected Armor (Infiltrator)",
        detail:
          "A creature you hit with your lightning launcher glows with light until the start of your next turn, suffers disadvantage on attacks against you while glowing, and your next attack against a glowing target has advantage and deals an extra 1d6 lightning damage.",
      },
    ],
  },
  Artillerist: {
    3: [
      {
        title: "Eldritch Cannon",
        detail:
          "As an action, conjure a Tiny or Small cannon (AC 18, HP equal to 5 times your artificer level) in one of three configurations: Flamethrower (15-ft cone, 2d8 fire, DEX save), Force Ballista (ranged spell attack, 2d8 force plus a 5-ft push), or Protector (grants 1d8 + INT temporary HP to a creature within 10 ft); command it as a bonus action, and it lasts 1 hour or until you create another.",
      },
    ],
    5: [
      {
        title: "Arcane Firearm",
        detail:
          "Enchant a wand, rod, or staff as your spellcasting focus; once per spell you cast through it, add 1d8 to one damage roll of that spell.",
      },
    ],
    9: [
      {
        title: "Explosive Cannon",
        detail:
          "Your eldritch cannon's damage rolls gain an extra 1d8, and as an action you can force it to explode (if within 60 ft), dealing 3d8 force damage in a 20-ft radius (DEX save for half) and destroying the cannon.",
      },
    ],
    15: [
      {
        title: "Fortified Position",
        detail:
          "You and allies within 10 feet of your eldritch cannon gain half cover, and you can maintain two cannons active at the same time.",
      },
    ],
  },
  "Battle Smith": {
    3: [
      {
        title: "Battle Ready",
        detail:
          "You gain proficiency with martial weapons, and may use your Intelligence modifier, instead of Strength or Dexterity, for attack and damage rolls with magic weapons.",
      },
      {
        title: "Steel Defender",
        detail:
          "Build a Medium construct companion (AC 15, HP equal to 2 + your INT modifier + 5 times your artificer level) that shares your initiative, acts right after your turn, and obeys your bonus-action commands.",
      },
    ],
    5: [
      {
        title: "Extra Attack",
        detail:
          "Attack twice, instead of once, whenever you take the Attack action on your turn.",
      },
    ],
    9: [
      {
        title: "Arcane Jolt",
        detail:
          "Once per turn, a number of times per long rest equal to your INT modifier (minimum once), when your magic weapon or your Steel Defender's attack hits, deal an extra 2d6 force damage, or restore 2d6 hit points to a creature within 30 feet.",
      },
    ],
    15: [
      {
        title: "Improved Defender",
        detail:
          "Your Steel Defender's AC increases by 2; its reaction that imposes disadvantage on an attack against another creature within 5 feet now also deals 1d4 + your INT modifier force damage to the attacker if that attack misses; and your Arcane Jolt dice increase to 4d6.",
      },
    ],
  },
};
