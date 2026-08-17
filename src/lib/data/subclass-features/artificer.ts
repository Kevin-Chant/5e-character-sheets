import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each artificer subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const ARTIFICER_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Alchemist: {
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
      // The model-specific weapon and property (Guardian vs Infiltrator) and
      // the 15th-level Perfected Armor are gated by the `armorModel` sub-choice
      // in chosen-options.ts, so only the model you chose is granted.
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
