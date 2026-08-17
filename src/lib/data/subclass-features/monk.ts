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
    ],
    11: [
      {
        title: "Breath of the Dragon (upgrade)",
        detail:
          "Breath of the Dragon's damage increases to 3 Martial Arts dice.",
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
    11: [
      {
        title: "Body of the Astral Self",
        detail:
          "No action required, needs Arms and Visage both active: reaction to reduce acid, cold, fire, force, lightning, or thunder damage by 1d10 + your Wisdom modifier (minimum 1). Once per turn, add a Martial Arts die of extra force damage on an Arms unarmed-strike hit.",
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
          "While prone, standing up costs only 5 feet of movement instead of half your speed.",
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
          "Kensei weapon attacks count as magical against resistance and immunity.",
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
  },
  Mercy: {
    3: [
      {
        title: "Implements of Mercy",
        detail:
          "Gain proficiency in Insight, Medicine, and the herbalism kit, plus a mask that hides your identity while worn.",
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
  },
  Shadow: {
    3: [
      {
        title: "Shadow Arts (Minor Illusion)",
        detail: "Learn the Minor Illusion cantrip.",
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
        title: "Radiant Sun Bolt (attack option)",
        detail:
          "Gain a new ranged spell attack option (30 feet, using Dexterity) usable as part of the Attack action, dealing your Martial Arts die of radiant damage on a hit.",
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
