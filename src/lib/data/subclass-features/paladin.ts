import { SubclassFeatureTable } from "src/lib/data/subclass-features/types";

// Per-level features for each paladin subclass, keyed by subclass name then by
// class level. Mechanical facts with original paraphrased summaries only.
export const PALADIN_SUBCLASS_FEATURES: SubclassFeatureTable = {
  Ancients: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level Ensnaring Strike and speak with animals; 5th moonbeam and misty step; 9th plant growth and protection from energy; 13th ice storm and stoneskin; 17th commune with nature and tree stride.",
      },
      {
        title: "Nature's Wrath (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use to entangle one creature within 10 ft. in spectral vines; it fails a STR or DEX save (your Channel Divinity DC) or is restrained, repeating the save at the end of each of its turns.",
      },
      {
        title: "Turn the Faithless (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use so each fey or fiend within 30 ft. that fails a WIS save (your Channel Divinity DC) is turned for 1 minute or until it takes damage.",
      },
    ],
    7: [
      {
        title: "Aura of Warding",
        detail:
          "You and friendly creatures within 10 ft. (30 ft. at 18th level) have resistance to damage from spells.",
      },
    ],
    15: [
      {
        title: "Undying Sentinel",
        detail:
          "Once per long rest, when an effect would drop you to 0 hit points but not kill you outright, you drop to 1 hit point instead; you also stop visibly aging.",
      },
    ],
    20: [
      {
        title: "Elder Champion",
        detail:
          "Once per long rest, as an action, transform for 1 minute: regain 10 hit points at the start of each of your turns, cast your paladin spells as a bonus action, and enemies within 10 ft. have disadvantage on saves against your paladin spells and Channel Divinity options.",
      },
    ],
  },
  Conquest: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level Armor of Agathys and command; 5th hold person and spiritual weapon; 9th bestow curse and fear; 13th dominate beast and stoneskin; 17th cloudkill and dominate person.",
      },
      {
        title: "Conquering Presence (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use so each creature within 30 ft. that fails a WIS save (your Channel Divinity DC) is frightened for 1 minute, repeating the save at the end of each of its turns.",
      },
      {
        title: "Guided Strike (Channel Divinity)",
        detail:
          "After you make an attack roll but before the result is announced, spend a Channel Divinity use to add +10 to the roll.",
      },
    ],
    7: [
      {
        title: "Aura of Conquest",
        detail:
          "While you aren't incapacitated, emanate a 10-ft. aura (30 ft. at 18th level): frightened creatures inside have speed 0 and take psychic damage equal to half your paladin level at the start of each of their turns there.",
      },
    ],
    15: [
      {
        title: "Scornful Rebuke",
        detail:
          "When a creature hits you with an attack and you aren't incapacitated, it takes psychic damage equal to your CHA modifier (minimum 1).",
      },
    ],
    20: [
      {
        title: "Invincible Conqueror",
        detail:
          "Once per long rest, as an action, become an avatar of conquest for 1 minute: resistance to all damage, an extra attack whenever you take the Attack action, and your weapon attacks score a critical hit on a roll of 19 or 20.",
      },
    ],
  },
  Crown: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level command and Compelled Duel; 5th warding bond and zone of truth; 9th Aura of Vitality and spirit guardians; 13th banishment and guardian of faith; 17th Circle of Power and geas.",
      },
      {
        title: "Champion Challenge (Channel Divinity)",
        detail:
          "As a bonus action, spend a Channel Divinity use so each creature of your choice within 30 ft. that fails a WIS save (your Channel Divinity DC) can't willingly move more than 30 ft. away from you until the effect ends.",
      },
      {
        title: "Turn the Tide (Channel Divinity)",
        detail:
          "As a bonus action, spend a Channel Divinity use to let each creature of your choice within 30 ft. at or below half its hit point maximum regain 1d6 + your CHA modifier (minimum 1) hit points.",
      },
    ],
    7: [
      {
        title: "Divine Allegiance",
        detail:
          "As a reaction when a creature within 5 ft. of you takes damage, you can take that damage instead (it can't be reduced or prevented).",
      },
    ],
    15: [
      {
        title: "Unyielding Saint",
        detail:
          "You have advantage on saving throws to avoid becoming paralyzed or stunned.",
      },
    ],
    20: [
      {
        title: "Exalted Champion",
        detail:
          "Once per long rest, as an action, gain for 1 hour: resistance to nonmagical bludgeoning, piercing, and slashing damage; allies within 30 ft. who can see you gain advantage on death saving throws; and you and those allies have advantage on WIS saving throws.",
      },
    ],
  },
  Devotion: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level protection from evil and good and sanctuary; 5th lesser restoration and zone of truth; 9th beacon of hope and dispel magic; 13th freedom of movement and guardian of faith; 17th commune and flame strike.",
      },
    ],
    7: [
      {
        title: "Aura of Devotion",
        detail:
          "You and friendly creatures within 10 ft. (30 ft. at 18th level) can't be charmed while you're conscious.",
      },
    ],
    15: [
      {
        title: "Purity of Spirit",
        detail:
          "You constantly benefit from protection from evil and good without expending a spell slot or material component.",
      },
    ],
    20: [
      {
        title: "Holy Nimbus",
        detail:
          "Once per long rest, as an action, radiate sunlight in a 30-ft. radius for 1 minute: fiends and undead that start their turn in the bright light take 10 radiant damage, and you have advantage on saving throws against spells cast by fiends or undead.",
      },
    ],
  },
  Glory: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level guiding bolt and heroism; 5th enhance ability and magic weapon; 9th haste and protection from energy; 13th compulsion and freedom of movement; 17th commune and flame strike.",
      },
      {
        title: "Peerless Athlete (Channel Divinity)",
        detail:
          "As a bonus action, spend a Channel Divinity use for advantage on STR (Athletics) and DEX (Acrobatics) checks for 10 minutes; you can carry, push, drag, or lift double your usual amount, and your jump distance increases by 10 ft.",
      },
      {
        title: "Inspiring Smite (Channel Divinity)",
        detail:
          "Immediately after you use Divine Smite to hit a creature, spend a Channel Divinity use to distribute 2d8 + your paladin level in temporary hit points among creatures of your choice within 30 ft.",
      },
    ],
    7: [
      {
        title: "Aura of Alacrity",
        detail:
          "Your walking speed increases by 10 ft.; an ally who starts their turn within 5 ft. of you (10 ft. at 18th level) also gains 10 ft. of movement until the end of that turn.",
      },
    ],
    15: [
      {
        title: "Glorious Defense",
        detail:
          "A limited number of times per long rest (equal to your CHA modifier, minimum 1), use your reaction when you or an ally within 10 ft. is hit to add your CHA modifier (minimum +1) to the target's AC against that attack; if it still misses, you can make one weapon attack against the attacker.",
      },
    ],
    20: [
      {
        title: "Living Legend",
        detail:
          "Once per long rest (or by expending a 5th-level spell slot), as a bonus action, gain for 1 minute: advantage on all CHA checks, once per turn the ability to turn a missed weapon attack into a hit, and the ability to reroll one failed saving throw.",
      },
    ],
  },
  Oathbreaker: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level hellish rebuke and inflict wounds; 5th Crown of Madness and darkness; 9th animate dead and bestow curse; 13th blight and confusion; 17th contagion and dominate person.",
      },
      {
        title: "Control Undead (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use to target one undead within 30 ft. with a challenge rating below your paladin level: it fails a WIS save (your Channel Divinity DC) or obeys your commands for 24 hours or until you use this again.",
      },
      {
        title: "Dreadful Aspect (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use so each creature within 30 ft. who can see you and fails a WIS save (your Channel Divinity DC) is frightened for 1 minute, retrying the save if it ends its turn more than 30 ft. away from you.",
      },
    ],
    7: [
      {
        title: "Aura of Hate",
        detail:
          "You, and fiends or undead within 10 ft. of you (30 ft. at 18th level), add your CHA modifier (minimum +1) to melee weapon damage rolls.",
      },
    ],
    15: [
      {
        title: "Supernatural Resistance",
        detail:
          "You have resistance to nonmagical bludgeoning, piercing, and slashing damage.",
      },
    ],
    20: [
      {
        title: "Dread Lord",
        detail:
          "Once per long rest, as a bonus action, create a 30-ft. shadowy aura for 1 minute: frightened enemies inside take 4d10 psychic damage at the start of their turn, allies gain heavily obscured concealment, and once per turn you can spend a bonus action to make a melee spell attack for 3d10 + your CHA modifier necrotic damage.",
      },
    ],
  },
  Redemption: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level sanctuary and sleep; 5th calm emotions and hold person; 9th counterspell and hypnotic pattern; 13th resilient sphere and stoneskin; 17th hold monster and wall of force.",
      },
      {
        title: "Emissary of Peace (Channel Divinity)",
        detail:
          "As a bonus action, spend a Channel Divinity use for a +5 bonus to CHA (Persuasion) checks for the next 10 minutes.",
      },
      {
        title: "Rebuke the Violent (Channel Divinity)",
        detail:
          "As a reaction when a creature within 30 ft. damages another creature, spend a Channel Divinity use to force it to make a WIS save (your Channel Divinity DC) or take radiant damage equal to the damage it just dealt (half as much on a success).",
      },
    ],
    7: [
      {
        title: "Aura of the Guardian",
        detail:
          "As a reaction when a creature within 10 ft. (30 ft. at 18th level) takes damage, you can take that damage instead (it can't be reduced or prevented).",
      },
    ],
    15: [
      {
        title: "Protective Spirit",
        detail:
          "If you end your turn in combat below half your hit point maximum and aren't incapacitated, you regain 1d6 + half your paladin level hit points.",
      },
    ],
    20: [
      {
        title: "Emissary of Redemption",
        detail:
          "You constantly have resistance to all damage dealt by other creatures, and attackers who hit you take radiant damage equal to half the damage dealt; both benefits stop working against a creature you attack, damage, or cast a spell on until you finish a long rest.",
      },
    ],
  },
  Vengeance: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level bane and hunter's mark; 5th hold person and misty step; 9th haste and protection from energy; 13th banishment and dimension door; 17th hold monster and scrying.",
      },
    ],
    7: [
      {
        title: "Relentless Avenger",
        detail:
          "After you hit a creature with an opportunity attack, you can move up to half your speed as part of the same reaction, without provoking further opportunity attacks.",
      },
    ],
    15: [
      {
        title: "Soul of Vengeance",
        detail:
          "When a creature under the effect of your Vow of Enmity makes an attack, you can use your reaction to make one melee weapon attack against it if it's within your reach.",
      },
    ],
    20: [
      {
        title: "Avenging Angel",
        detail:
          "Once per long rest, as an action, transform for 1 hour: gain a 60-ft. flying speed and a 30-ft. frightening aura that frightens enemies who enter it (WIS save), and you have advantage on attack rolls against frightened creatures.",
      },
    ],
  },
  Watchers: {
    3: [
      {
        title: "Oath Spells",
        detail:
          "Always-prepared spells from your oath: 3rd level alarm and detect magic; 5th moonbeam and see invisibility; 9th counterspell and nondetection; 13th Aura of Purity and banishment; 17th hold monster and scrying.",
      },
      {
        title: "Watcher's Will (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use so you and up to a number of chosen creatures (equal to your CHA modifier, minimum 1) within 30 ft. have advantage on INT, WIS, and CHA saving throws for 1 minute.",
      },
      {
        title: "Abjure the Extraplanar (Channel Divinity)",
        detail:
          "As an action, spend a Channel Divinity use so each aberration, celestial, elemental, fey, or fiend within 30 ft. that fails a WIS save (your Channel Divinity DC) is turned for 1 minute or until it takes damage.",
      },
    ],
    7: [
      {
        title: "Aura of the Sentinel",
        detail:
          "You and chosen creatures within 10 ft. (30 ft. at 18th level) add your proficiency bonus to initiative rolls.",
      },
    ],
    15: [
      {
        title: "Vigilant Rebuke",
        detail:
          "When you or a creature within 30 ft. that you can see succeeds on an INT, WIS, or CHA saving throw, you can use your reaction to deal 2d8 + your CHA modifier force damage to the creature that triggered the save.",
      },
    ],
    20: [
      {
        title: "Mortal Bulwark",
        detail:
          "Once per long rest (or by expending a 5th-level spell slot), as a bonus action, gain for 1 minute: truesight out to 120 ft., advantage on saving throws against attacks by extraplanar creatures, and hitting an extraplanar creature forces it to make a CHA save or be banished.",
      },
    ],
  },
};
