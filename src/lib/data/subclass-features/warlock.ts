import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each warlock subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const WARLOCK_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Archfey: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Faerie Fire and Sleep, 2nd Calm Emotions and Phantasmal Force, 3rd Blink and Plant Growth, 4th Dominate Beast and Greater Invisibility, 5th Dominate Person and Seeming.",
      },
    ],
    6: [
      {
        title: "Misty Escape",
        detail:
          "When you take damage, you can use your reaction to turn invisible and teleport up to 60 feet to an unoccupied space you can see; invisibility ends early if you attack or cast a spell. Once per short or long rest.",
      },
    ],
    10: [
      {
        title: "Beguiling Defenses",
        detail:
          "You're immune to being charmed, and when another creature tries to charm you, you can use your reaction to attempt to turn the charm back on it (Wisdom save or it's charmed by you for 1 minute).",
      },
    ],
    14: [
      {
        title: "Dark Delirium",
        detail:
          "As an action, one creature within 60 feet makes a Wisdom save or is charmed or frightened for 1 minute, perceiving only you and a misty realm; the effect ends early if you lose concentration (as if concentrating on a spell) or the creature takes damage. Once per short or long rest.",
      },
    ],
  },
  Celestial: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Cure Wounds and Guiding Bolt, 2nd Flaming Sphere and Lesser Restoration, 3rd Daylight and Revivify, 4th Guardian of Faith and Wall of Fire, 5th Flame Strike and Greater Restoration.",
      },
    ],
    6: [
      {
        title: "Radiant Soul",
        detail:
          "You have resistance to radiant damage, and once per turn when you cast a spell that deals radiant or fire damage, you can add your Charisma modifier to one damage roll of that spell.",
      },
    ],
    10: [
      {
        title: "Celestial Resistance",
        detail:
          "Whenever you finish a short or long rest, you gain temporary hit points equal to your warlock level plus your Charisma modifier, and you can grant temporary hit points equal to half that total to up to five other creatures of your choice.",
      },
    ],
    14: [
      {
        title: "Searing Vengeance",
        detail:
          "Instead of failing a death saving throw, you can regain half your maximum hit points, stand up, and deal 2d8 plus your Charisma modifier radiant damage (target blinded until the end of its turn) to each creature you choose within 30 feet. Once per long rest.",
      },
    ],
  },
  Fathomless: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Create or Destroy Water and Thunderwave, 2nd Gust of Wind and Silence, 3rd Lightning Bolt and Sleet Storm, 4th Control Water and Summon Elemental (water only), 5th Cone of Cold and Bigby's Hand.",
      },
    ],
    6: [
      {
        title: "Oceanic Soul",
        detail:
          "You have resistance to cold damage, and you and creatures submerged alongside you can understand each other while submerged.",
      },
      {
        title: "Guardian Coil",
        detail:
          "When you or a creature within 10 feet of your summoned tentacle takes damage, you can use your reaction to reduce that damage by 1d8 (2d8 at 10th level).",
      },
    ],
    10: [
      {
        title: "Grasping Tentacles",
        detail:
          "You can cast Black Tentacles once without a spell slot, regaining the ability after a long rest; when you do, you gain temporary hit points equal to your warlock level and can't lose concentration on it from taking damage.",
      },
    ],
    14: [
      {
        title: "Fathomless Plunge",
        detail:
          "As an action, you and up to 5 willing creatures within 30 feet teleport to a body of water you've seen, up to 1 mile away. Once per short or long rest.",
      },
    ],
  },
  Fiend: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Burning Hands and Command, 2nd Blindness/Deafness and Scorching Ray, 3rd Fireball and Stinking Cloud, 4th Fire Shield and Wall of Fire, 5th Flame Strike and Hallow.",
      },
    ],
    6: [
      {
        title: "Dark One's Own Luck",
        detail:
          "You can add a d10 to one ability check or saving throw after seeing the roll but before the outcome is decided. Once per short or long rest.",
      },
    ],
    10: [
      {
        title: "Fiendish Resilience",
        detail:
          "After finishing a short or long rest, you can choose a damage type to resist until you choose a different one with this feature again; damage from magical or silvered weapons ignores this resistance.",
      },
    ],
    14: [
      {
        title: "Hurl Through Hell",
        detail:
          "On a hit, you can banish the target through the lower planes until the end of your next turn; unless it's a fiend, it takes 10d10 psychic damage when it returns. Once per long rest.",
      },
    ],
  },
  Genie: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell. Every genie kind shares 1st level Detect Evil and Good, 2nd Phantasmal Force, 3rd Create Food and Water, 4th Phantasmal Killer, 5th Creation, and 9th Wish, plus one more spell per level 1-5 tied to your vessel's kind: Dao gains Sanctuary, Spike Growth, Meld into Stone, Stone Shape, and Wall of Stone; Djinni gains Thunderwave, Gust of Wind, Wind Wall, Greater Invisibility, and Seeming; Efreeti gains Burning Hands, Scorching Ray, Fireball, Fire Shield, and Flame Strike; Marid gains Fog Cloud, Blur, Sleet Storm, Control Water, and Cone of Cold.",
      },
    ],
    6: [
      {
        title: "Elemental Gift",
        detail:
          "As a bonus action, you can fly at a speed of 30 feet for 10 minutes, a number of times equal to your proficiency bonus (recharging on a long rest); you also gain resistance to a damage type set by your vessel's genie kind (bludgeoning for dao, thunder for djinni, fire for efreeti, cold for marid).",
      },
    ],
    10: [
      {
        title: "Sanctuary Vessel",
        detail:
          "When you retreat into your vessel with Bottled Respite, you and up to 5 other willing creatures you bring inside also gain the benefits of a short rest.",
      },
    ],
    14: [
      {
        title: "Limited Wish",
        detail:
          "Once every 1d4 long rests, you can cast any spell of 6th level or lower that has a casting time of 1 action, without expending a spell slot or material components.",
      },
    ],
  },
  "Great Old One": {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Dissonant Whispers and Hideous Laughter, 2nd Detect Thoughts and Phantasmal Force, 3rd Clairvoyance and Sending, 4th Dominate Beast and Black Tentacles, 5th Dominate Person and Telekinesis.",
      },
    ],
    6: [
      {
        title: "Entropic Ward",
        detail:
          "When a creature attacks you, you can use your reaction to impose disadvantage on that roll; if it misses, your next attack against that creature has advantage before the end of your next turn. Once per short or long rest.",
      },
    ],
    10: [
      {
        title: "Thought Shield",
        detail:
          "Your thoughts can't be read by any means you don't allow, you have resistance to psychic damage, and whenever you take psychic damage, the attacker takes the same amount of psychic damage back.",
      },
    ],
    14: [
      {
        title: "Create Thrall",
        detail:
          "You can touch an incapacitated humanoid to charm it indefinitely (until a remove curse or similar effect), and while it's charmed this way you have telepathic contact with it as long as you're on the same plane.",
      },
    ],
  },
  Hexblade: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Shield and Wrathful Smite, 2nd Blur and Branding Smite, 3rd Blink and Elemental Weapon, 4th Phantasmal Killer and Staggering Smite, 5th Banishing Smite and Cone of Cold.",
      },
    ],
    6: [
      {
        title: "Accursed Specter",
        detail:
          "When you slay a humanoid, you can animate its corpse as a specter that fights for you until your next long rest, with temporary hit points equal to half your warlock level and an attack bonus equal to your Charisma modifier.",
      },
    ],
    10: [
      {
        title: "Armor of Hexes",
        detail:
          "When the creature cursed by your Hexblade's Curse hits you with an attack, you can use your reaction to roll a d6; on a 4 or higher the attack instead misses you entirely.",
      },
    ],
    14: [
      {
        title: "Master of Hexes",
        detail:
          "When the creature cursed by your Hexblade's Curse dies, you can move the curse to a new creature within 30 feet without a bonus action, though you don't regain hit points from the old target this time.",
      },
    ],
  },
  Undead: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level Bane and False Life, 2nd Blindness/Deafness and Phantasmal Force, 3rd Phantom Steed and Speak with Dead, 4th Death Ward and Greater Invisibility, 5th Antilife Shell and Cloudkill.",
      },
    ],
    6: [
      {
        title: "Grave Touched",
        detail:
          "You no longer need to eat, drink, or breathe, and once per turn on a hit you can replace that attack's damage with necrotic damage instead; while transformed by Form of Dread, that necrotic damage also gains one extra damage die.",
      },
    ],
    10: [
      {
        title: "Necrotic Husk",
        detail:
          "You have resistance to necrotic damage (immunity while transformed by Form of Dread); when reduced to 0 hit points, you can use your reaction to drop to 1 hit point instead and deal 2d10 plus your warlock level necrotic damage to creatures within 30 feet, then gain a level of exhaustion. Usable once every 1d4 long rests.",
      },
    ],
    14: [
      {
        title: "Spirit Projection",
        detail:
          "As an action, you project your spirit from your body (which is left unconscious) for up to 1 hour or until your concentration breaks; while projected you have resistance to bludgeoning, piercing, and slashing damage regardless of whether it's magical, cast conjuration and necromancy spells without needing verbal, somatic, or cheap material components, fly at your walking speed with the ability to hover, and move through objects and creatures as difficult terrain (taking 1d10 force damage if you end your turn inside one). While transformed by Form of Dread, you also regain hit points equal to half the necrotic damage you deal each turn.",
      },
    ],
  },
  Undying: {
    1: [
      {
        title: "Expanded Spell List",
        detail:
          "Your patron lets you choose from extra spells when you learn a warlock spell: 1st level False Life and Ray of Sickness, 2nd Blindness/Deafness and Silence, 3rd Feign Death and Speak with Dead, 4th Aura of Life and Death Ward, 5th Contagion and Legend Lore.",
      },
    ],
    6: [
      {
        title: "Defy Death",
        detail:
          "You regain 1d8 plus your Constitution modifier (minimum 1) hit points whenever you succeed on a death saving throw or use Spare the Dying to stabilize a creature. Once per long rest.",
      },
    ],
    10: [
      {
        title: "Undying Nature",
        detail:
          "You no longer need to eat, drink, or sleep (though you can still choose to), you age at one-tenth the normal rate, and you're immune to magical aging effects.",
      },
    ],
    14: [
      {
        title: "Indestructible Life",
        detail:
          "As a bonus action, you regain 1d8 plus your warlock level hit points, which can reattach a severed body part if used for that purpose. Once per short or long rest.",
      },
    ],
  },
};
