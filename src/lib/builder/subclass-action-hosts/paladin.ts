import { HostTable } from "./types";

// Shared-pool action hosts for paladin subclasses (see ./types). Mechanical facts
// with original wording only.
//
export const PALADIN_ACTION_HOSTS: HostTable = {
  Devotion: [
    {
      title: "Channel Divinity: Sacred Weapon",
      detail:
        "Imbue one weapon you hold with positive energy for 1 minute; it sheds bright light.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Add your Charisma modifier (minimum +1) to attack rolls with that weapon, which counts as magical, for 1 minute.",
    },
    {
      title: "Channel Divinity: Turn the Unholy",
      detail: "Rebuke fiends and undead that can see or hear you within 30 ft.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Each fiend or undead within 30 ft. makes a WIS save against your Channel Divinity DC or is turned for 1 minute (flees, can't take reactions, breaks on damage).",
    },
  ],
  Vengeance: [
    {
      title: "Channel Divinity: Abjure Enemy",
      detail: "Utter a vengeful oath against one creature within 60 ft.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "The target makes a WIS save against your Channel Divinity DC (a fiend or undead has disadvantage): on a failure it is frightened and its speed drops to 0 for 1 minute; on a success its speed is halved for 1 minute.",
    },
    {
      title: "Channel Divinity: Vow of Enmity",
      detail: "Mark one creature within 10 ft. as your sworn enemy.",
      level: 3,
      cost: "bonusAction",
      pool: "Channel Divinity",
      note: "You have advantage on attack rolls against the target for 1 minute or until it drops to 0 HP or falls unconscious.",
      applies: { name: "Vow of Enmity", rounds: 10 },
    },
  ],
  Ancients: [
    {
      title: "Channel Divinity: Nature's Wrath",
      detail:
        "Spectral vines spring up and reach for one creature you can see within 10 ft.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "The target makes a STR or DEX save (its choice, against your Channel Divinity DC) or is restrained, repeating the save at the end of each of its turns to break free.",
    },
    {
      title: "Channel Divinity: Turn the Faithless",
      detail:
        "Each fey or fiend within 30 ft. that can hear you must resist being turned.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Each fey or fiend within 30 ft. that can hear you makes a WIS save (your Channel Divinity DC); on a failure it's turned for 1 minute or until it takes damage.",
    },
  ],
  Conquest: [
    {
      title: "Channel Divinity: Conquering Presence",
      detail:
        "Force chosen creatures you can see within 30 ft. to confront their fear of you.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Each creature of your choice within 30 ft. makes a WIS save (your Channel Divinity DC); on a failure it's frightened of you for 1 minute, repeating the save at the end of each of its turns.",
    },
    {
      title: "Channel Divinity: Guided Strike",
      detail: "Steady your blade with a moment of divine guidance.",
      level: 3,
      cost: "special",
      costNote: "after an attack roll, before the result is announced",
      pool: "Channel Divinity",
      note: "Add +10 to the attack roll.",
    },
  ],
  Crown: [
    {
      title: "Channel Divinity: Champion Challenge",
      detail: "Bind chosen foes' attention to you.",
      level: 3,
      cost: "bonusAction",
      pool: "Channel Divinity",
      note: "Each creature of your choice within 30 ft. makes a WIS save; on a failure it can't willingly move more than 30 ft. away from you until you're incapacitated, die, or it ends up more than 30 ft. away.",
    },
    {
      title: "Channel Divinity: Turn the Tide",
      detail: "Rally the wounded around you.",
      level: 3,
      cost: "bonusAction",
      pool: "Channel Divinity",
      note: "Each creature of your choice within 30 ft. that can hear you and is at or below half its hit point maximum regains 1d6 + your CHA modifier (minimum 1) hit points.",
    },
  ],
  Glory: [
    {
      title: "Channel Divinity: Peerless Athlete",
      detail: "Push your body past its limits for a short while.",
      level: 3,
      cost: "bonusAction",
      pool: "Channel Divinity",
      note: "For 10 minutes, gain advantage on STR (Athletics) and DEX (Acrobatics) checks, carry/push/drag/lift double the usual amount, and add 10 ft. to your jump distance.",
    },
    {
      title: "Channel Divinity: Inspiring Smite",
      detail: "Turn a smite's fury into shared vigor.",
      level: 3,
      cost: "special",
      costNote: "immediately after you deal damage with Divine Smite",
      pool: "Channel Divinity",
      note: "Distribute 2d8 + your paladin level in temporary hit points among creatures of your choice within 30 ft. (including yourself).",
    },
  ],
  Oathbreaker: [
    {
      title: "Channel Divinity: Control Undead",
      detail: "Bend a lesser undead to your will.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Target one undead within 30 ft. with a challenge rating below your paladin level; it makes a WIS save (your Channel Divinity DC) or obeys your commands for 24 hours or until you use this again. An undead with a challenge rating at or above your paladin level is immune.",
    },
    {
      title: "Channel Divinity: Dreadful Aspect",
      detail: "Show your true, terrible nature.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Each creature within 30 ft. who can see you makes a WIS save (your Channel Divinity DC); on a failure it's frightened of you for 1 minute, retrying the save if it ends its turn more than 30 ft. away from you.",
    },
  ],
  Redemption: [
    {
      title: "Channel Divinity: Emissary of Peace",
      detail: "Carry yourself with an aura of calm diplomacy.",
      level: 3,
      cost: "bonusAction",
      pool: "Channel Divinity",
      note: "Gain a +5 bonus to CHA (Persuasion) checks for the next 10 minutes.",
    },
    {
      title: "Channel Divinity: Rebuke the Violent",
      detail: "Turn an attacker's violence back on itself.",
      level: 3,
      cost: "reaction",
      costNote:
        "immediately after a creature within 30 ft. deals damage with an attack against someone other than you",
      pool: "Channel Divinity",
      note: "The attacker makes a WIS save (your Channel Divinity DC); on a failure it takes radiant damage equal to the damage it just dealt, or half as much on a success.",
    },
  ],
  Watchers: [
    {
      title: "Channel Divinity: Watcher's Will",
      detail: "Sharpen your allies' resistance to mind-affecting magic.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Choose creatures you can see within 30 ft., up to a number equal to your CHA modifier (minimum 1); you and they have advantage on INT, WIS, and CHA saving throws for 1 minute.",
    },
    {
      title: "Channel Divinity: Abjure the Extraplanar",
      detail: "Ward off creatures from beyond the material plane.",
      level: 3,
      cost: "action",
      pool: "Channel Divinity",
      note: "Each aberration, celestial, elemental, fey, or fiend within 30 ft. that can hear you makes a WIS save (your Channel Divinity DC); on a failure it's turned for 1 minute or until it takes damage.",
    },
  ],
};
