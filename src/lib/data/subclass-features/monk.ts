import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each monk subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
// Monastic Tradition features land at 3, 6, 11, and 17 (not the usual
// 3/6/10/14 pattern most other classes use).
export const MONK_SUBCLASS_FEATURES: SubclassFeatureTable = {
  "Ascendant Dragon": {
    3: [
      {
        title: "Draconic Disciple",
        detail:
          "Once per long rest, reroll a failed Charisma (Intimidation or Persuasion) check. Choose a draconic ancestry (acid, cold, fire, lightning, or poison) that recolors your unarmed strike damage, and learn Draconic or another language.",
      },
      {
        title: "Breath of the Dragon",
        detail:
          "In place of one Attack-action strike, exhale a 20-foot cone or 30-foot line: targets make a Dexterity save (your ki save DC) or take 2 Martial Arts dice of your ancestry's damage type, half on a success. Usable a number of times per long rest equal to your proficiency bonus, or for 2 ki once those uses run out.",
      },
    ],
    6: [
      {
        title: "Wings Unfurled",
        detail:
          "When you use Step of the Wind, you may also spend one of its uses to manifest spectral wings, gaining a flying speed equal to your walking speed until the end of the turn. Usable a number of times per long rest equal to your proficiency bonus.",
      },
    ],
    11: [
      {
        title: "Breath of the Dragon (upgrade)",
        detail:
          "Breath of the Dragon's damage increases to 3 Martial Arts dice.",
      },
      {
        title: "Aspect of the Wyrm",
        detail:
          "Bonus action, once per long rest (or for 3 ki): open a 10-foot aura for 1 minute, choosing one of two effects. Each turn, target one creature in the aura with a Wisdom save (your ki save DC), frightening it on a failure (repeatable save); or grant yourself and allies inside resistance to your ancestry's damage type for the duration.",
      },
    ],
    17: [
      {
        title: "Ascendant Aspect",
        detail:
          "Spend 1 extra ki to widen Breath of the Dragon to a 60-foot cone or 90-foot line for 4 Martial Arts dice of damage. Gain 10 feet of blindsight. Activating Aspect of the Wyrm also forces a Dexterity save from creatures in the aura, dealing 3d10 of your ancestry's damage type on a failure.",
      },
    ],
  },
  "Astral Self": {
    3: [
      {
        title: "Arms of the Astral Self",
        detail:
          "Bonus action, 1 ki, 10 minutes: summon spectral arms. Creatures within 10 feet make a Dexterity save or take 2 Martial Arts dice of force damage. While active, use Wisdom for Strength checks and saves and for unarmed-strike attack and damage rolls (force damage, +5 feet of reach).",
      },
    ],
    6: [
      {
        title: "Visage of the Astral Self",
        detail:
          "Bonus action (stacks with Arms), 1 ki, 10 minutes: gain darkvision 120 feet (works even in magical darkness) and advantage on Wisdom (Insight) and Charisma (Intimidation) checks, and speak telepathically to one creature within 60 feet or project your voice 600 feet.",
      },
    ],
    11: [
      {
        title: "Body of the Astral Self",
        detail:
          "No action required, needs Arms and Visage both active: reaction to reduce acid, cold, fire, force, lightning, or thunder damage by 1d10 + your Wisdom modifier (minimum 1). Once per turn, add a Martial Arts die of extra force damage on an Arms unarmed-strike hit.",
      },
    ],
    17: [
      {
        title: "Awakened Astral Self",
        detail:
          "Bonus action, 5 ki, 10 minutes: summon the arms, visage, and body of your astral self together, gaining +2 AC and letting Extra Attack make three unarmed strikes with the Arms instead of two.",
      },
    ],
  },
  "Drunken Master": {
    3: [
      {
        title: "Bonus Proficiencies",
        detail:
          "Gain proficiency in Performance and with brewer's supplies, if you don't already have them.",
      },
      {
        title: "Drunken Technique",
        detail:
          "Whenever you use Flurry of Blows, you also gain the effect of the Disengage action and your speed increases by 10 feet until the end of the current turn.",
      },
    ],
    6: [
      {
        title: "Tipsy Sway",
        detail:
          "While prone, standing up costs only 5 feet of movement instead of half your speed. As a reaction, spend 1 ki when a melee attack misses you to redirect it at another creature within 5 feet that you can see.",
      },
    ],
    11: [
      {
        title: "Drunkard's Luck",
        detail:
          "When you'd make an ability check, attack roll, or saving throw with disadvantage, spend 2 ki to remove the disadvantage for that roll.",
      },
    ],
    17: [
      {
        title: "Intoxicated Frenzy",
        detail:
          "Flurry of Blows can make up to 3 additional unarmed strikes (5 total), as long as each targets a different creature.",
      },
    ],
  },
  "Four Elements": {
    3: [
      {
        title: "Disciple of the Elements",
        detail:
          "Learn Elemental Attunement plus one other Elemental Discipline, gaining one more at 6th, 11th, and 17th level. From 5th level, spend extra ki to cast a discipline's spell at a higher level, up to a level-based ki cap (3 at 5th-8th, 4 at 9th-12th, 5 at 13th-16th, 6 at 17th-20th).",
      },
      {
        title: "Elemental Disciplines",
        detail:
          "Known disciplines, chosen as you gain them: Elemental Attunement (no ki, action: a harmless sensory effect, light/snuff a small flame, chill/warm 1 pound of material for 1 hour, or shape a bit of earth/fire/water/mist for 1 minute); Fangs of the Fire Snake (1 ki, or 2 for bonus damage: unarmed strikes gain 10 feet of reach and deal fire damage for the Attack action, +1d10 fire on a hit if the 2nd ki is spent); Fist of Unbroken Air (2+ ki: Strength save at your ki DC or 3d10 bludgeoning damage plus 1d10 per extra ki, pushed 20 feet and knocked prone, half damage on a save); Water Whip (2+ ki: same save/damage shape as Fist of Unbroken Air but knocks prone or pulls 25 feet, Dexterity save); Shape the Flowing River (1 ki, action: reshape or convert up to a 30-foot span of ice or water within 120 feet); Fist of Four Thunders (2 ki: cast Thunderwave); Rush of the Gale Spirits (2 ki: cast Gust of Wind); Sweeping Cinder Strike (2 ki: cast Burning Hands); Clench of the North Wind (3 ki, 6th level+: cast Hold Person); Gong of the Summit (3 ki, 6th level+: cast Shatter); Flames of the Phoenix (4 ki, 11th level+: cast Fireball); Mist Stance (4 ki, 11th level+: cast Gaseous Form on yourself); Ride the Wind (4 ki, 11th level+: cast Fly on yourself); River of Hungry Flame (5 ki, 17th level+: cast Wall of Fire); Eternal Mountain Defense (5 ki, 17th level+: cast Stoneskin on yourself); Breath of Winter (6 ki, 17th level+: cast Cone of Cold); Wave of Rolling Earth (6 ki, 17th level+: cast Wall of Stone).",
      },
    ],
  },
  Kensei: {
    3: [
      {
        title: "Path of the Kensei",
        detail:
          "Choose one melee and one ranged weapon type (no heavy or special property) as your kensei weapons — they count as monk weapons, and you gain proficiency with them if you lack it. While holding a melee kensei weapon, making an unarmed strike as part of the Attack action grants +2 AC until the start of your next turn. Bonus action: your ranged kensei weapon attacks deal an extra 1d4 damage of the weapon's type on a hit until the end of the turn. Also gain proficiency with calligrapher's or painter's supplies.",
      },
    ],
    6: [
      {
        title: "One with the Blade",
        detail:
          "Kensei weapon attacks count as magical against resistance and immunity. On a kensei weapon hit, spend 1 ki (once per turn) for extra damage equal to your Martial Arts die.",
      },
    ],
    11: [
      {
        title: "Sharpen the Blade",
        detail:
          "Bonus action, spend up to 3 ki: one kensei weapon you're holding gains a +1 to +3 bonus (matching ki spent) to attack and damage rolls for 1 minute or until you repeat this. No effect on a weapon that already has a magic bonus.",
      },
    ],
    17: [
      {
        title: "Unerring Accuracy",
        detail:
          "Once per turn, reroll a missed attack roll made with a monk weapon.",
      },
    ],
  },
  "Long Death": {
    3: [
      {
        title: "Touch of Death",
        detail:
          "When you drop a creature within 5 feet to 0 hit points, gain temporary hit points equal to your Wisdom modifier + your monk level (minimum 1).",
      },
    ],
    6: [
      {
        title: "Hour of Reaping",
        detail:
          "As an action, every creature within 30 feet that can see you makes a Wisdom save or becomes frightened of you until the end of your next turn.",
      },
    ],
    11: [
      {
        title: "Mastery of Death",
        detail:
          "When you'd drop to 0 hit points, you may spend 1 ki (no action required) to drop to 1 hit point instead.",
      },
    ],
    17: [
      {
        title: "Touch of the Long Death",
        detail:
          "As an action, touch a creature within 5 feet and spend 1-10 ki: it makes a Constitution save, taking 2d10 necrotic damage per ki spent, half on a success.",
      },
    ],
  },
  Mercy: {
    3: [
      {
        title: "Implements of Mercy",
        detail:
          "Gain proficiency in Insight, Medicine, and the herbalism kit, plus a mask that hides your identity while worn.",
      },
      {
        title: "Hands of Healing",
        detail:
          "Action, spend 1 ki: touch a creature and restore hit points equal to a Martial Arts die + your Wisdom modifier. Can replace one Flurry of Blows strike with this at no ki cost.",
      },
      {
        title: "Hands of Harm",
        detail:
          "Once per turn, when you hit with an unarmed strike, spend 1 ki for extra necrotic damage equal to a Martial Arts die + your Wisdom modifier.",
      },
    ],
    6: [
      {
        title: "Physician's Touch",
        detail:
          "Hands of Healing also cures one disease or one of blinded, deafened, paralyzed, poisoned, or stunned. Hands of Harm also poisons the target until the end of your next turn.",
      },
    ],
    11: [
      {
        title: "Flurry of Healing and Harm",
        detail:
          "Every Flurry of Blows strike can be replaced with Hands of Healing at no ki cost, and you may use Hands of Harm alongside Flurry strikes without spending ki (still once per turn).",
      },
    ],
    17: [
      {
        title: "Hand of Ultimate Mercy",
        detail:
          "Once per long rest, as an action, spend 5 ki and touch a creature dead no longer than 24 hours: it returns to life with 4d10 + your Wisdom modifier hit points, cured of the same conditions as Physician's Touch.",
      },
    ],
  },
  "Open Hand": {
    6: [
      {
        title: "Wholeness of Body",
        detail:
          "Once per long rest, as an action regain hit points equal to 3 × your monk level.",
      },
    ],
    11: [
      {
        title: "Tranquility",
        detail:
          "At the end of a long rest, gain the effect of Sanctuary — attackers must succeed on a Wisdom save (your ki save DC) to target you — until you finish your next long rest.",
      },
    ],
    17: [
      {
        title: "Quivering Palm",
        detail:
          "On an unarmed-strike hit, spend 3 ki to set up lethal vibrations lasting days equal to your monk level. At any point within that time, end them as a bonus action, forcing a Constitution save (your ki save DC): the target drops to 0 hit points on a failure, or takes 10d10 necrotic damage on a success. Only one target at a time.",
      },
    ],
  },
  Shadow: {
    3: [
      {
        title: "Shadow Arts",
        detail:
          "Learn the Minor Illusion cantrip. Spend 2 ki to cast Darkness, Darkvision, Pass without Trace, or Silence without material components.",
      },
    ],
    6: [
      {
        title: "Shadow Step",
        detail:
          "While in dim light or darkness, bonus action: teleport up to 60 feet to an unoccupied space you can see that's also in dim light or darkness, then gain advantage on your first melee attack before the end of the turn.",
      },
    ],
    11: [
      {
        title: "Cloak of Shadows",
        detail:
          "While in dim light or darkness, action: become invisible until you attack, cast a spell, or enter an area of bright light.",
      },
    ],
    17: [
      {
        title: "Opportunist",
        detail:
          "Reaction: whenever a creature within 5 feet of you is hit by someone else's attack, make a melee attack against it.",
      },
    ],
  },
  "Sun Soul": {
    3: [
      {
        title: "Radiant Sun Bolt",
        detail:
          "Ranged spell attack, 30 feet, using Dexterity; deals your Martial Arts die of radiant damage. Spend 1 ki to make the attack twice as a bonus action (stacks with Extra Attack).",
      },
    ],
    6: [
      {
        title: "Searing Arc Strike",
        detail:
          "After the Attack action, bonus action: spend 2+ ki to cast Burning Hands without a spell slot, its level rising by one per extra ki spent (max extra ki = half your monk level).",
      },
    ],
    11: [
      {
        title: "Searing Sunburst",
        detail:
          "Action: hurl an orb that bursts into a 20-foot-radius sphere; each creature inside makes a Constitution save or takes 2d6 radiant damage, half on a success. Spend up to 3 extra ki for +2d6 damage each.",
      },
    ],
    17: [
      {
        title: "Sun Shield",
        detail:
          "Shed bright light 30 feet and dim light another 30 feet, toggled with a bonus action. When hit by a melee attack, reaction to deal 5 + your Wisdom modifier radiant damage back to the attacker.",
      },
    ],
  },
};
