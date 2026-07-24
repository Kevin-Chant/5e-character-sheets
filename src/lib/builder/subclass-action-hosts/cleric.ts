import { StandardDie } from "src/lib/data/data-definitions";
import { HostTable } from "./types";

// Shared-pool action hosts for cleric subclasses (see ./types). Mechanical facts
// with original wording only. Every entry here drains the base "Channel
// Divinity" pool (src/lib/builder/class-pools.ts) — that pool and the
// universal Turn Undead option live there, not here.
export const CLERIC_ACTION_HOSTS: HostTable = {
  Arcana: [
    {
      title: "Channel Divinity: Arcane Abjuration",
      detail:
        "Spend a Channel Divinity use to force a celestial, elemental, fey, or fiend within 30 ft. to make a WIS save; on a failure it is turned (must flee, no reactions) for 1 minute or until it takes damage. Against a low enough CR target at cleric level 5+, it is banished instead.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Target celestial, elemental, fey, or fiend within 30 ft. makes a WIS save (your spell save DC) or is turned for 1 minute or until it takes damage; at cleric level 5+, a target below the banishment CR threshold is banished instead of turned.",
    },
  ],
  Death: [
    {
      title: "Channel Divinity: Touch of Death",
      detail:
        "Spend a Channel Divinity use on a melee hit to deal extra necrotic damage equal to 5 plus twice your cleric level.",
      level: 2,
      cost: "special",
      costNote: "On a melee weapon hit",
      pool: "Channel Divinity",
      amount: 1,
      note: "Deal extra necrotic damage equal to 5 plus twice your cleric level.",
    },
  ],
  Forge: [
    {
      title: "Channel Divinity: Artisan's Blessing",
      detail:
        "Spend a Channel Divinity use and 1 hour to craft a nonmagical metal item worth up to 100 gp, consuming that much raw material.",
      level: 2,
      cost: "special",
      costNote: "1-hour ritual, not in combat",
      pool: "Channel Divinity",
      amount: 1,
      note: "Craft a nonmagical item that must include metal (weapon, armor, ammunition, tools, or similar) worth up to 100 gp, consuming that value of raw material.",
    },
  ],
  Grave: [
    {
      title: "Channel Divinity: Path to the Grave",
      detail:
        "Spend a Channel Divinity use to curse a creature within 30 ft.; the next attack against it before the start of your next turn treats it as if it had vulnerability to that damage, then the curse ends.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Curse one creature you can see within 30 ft. until the end of your next turn; the first attack against it by you or an ally gives it vulnerability to all of that attack's damage, then the curse ends.",
    },
  ],
  Knowledge: [
    {
      title: "Channel Divinity: Knowledge of the Ages",
      detail:
        "Spend a Channel Divinity use to gain proficiency with one skill or tool of your choice for 10 minutes.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Gain proficiency with one skill or tool of your choice for 10 minutes.",
    },
    {
      title: "Channel Divinity: Read Thoughts",
      detail:
        "Spend a Channel Divinity use to force a creature within 60 ft. to make a WIS save; on a failure you read its surface thoughts for 1 minute and can spend your action to cast Suggestion on it without using a spell slot, and it automatically fails the save.",
      level: 6,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Target within 60 ft. makes a WIS save (your spell save DC) or you read its surface thoughts for 1 minute while it stays in range; during that time you can use your action to cast Suggestion on it without a spell slot, and it automatically fails its save against that casting.",
    },
  ],
  Life: [
    {
      title: "Channel Divinity: Preserve Life",
      detail:
        "Spend a Channel Divinity use to restore hit points totalling five times your cleric level, split among creatures within 30 ft. (up to half each creature's HP maximum); can't target undead or constructs.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Restore hit points totalling five times your cleric level, divided as you choose among creatures within 30 ft. (none above half its HP maximum); can't affect undead or constructs.",
    },
  ],
  Light: [
    {
      title: "Channel Divinity: Radiance of the Dawn",
      detail:
        "Spend a Channel Divinity use to dispel magical darkness within 30 ft. and force a CON save from hostile creatures in the area, dealing 2d10 plus your cleric level radiant damage (half on a success).",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      roll: { label: "Radiant damage", die: StandardDie.d10, count: 2 },
      note: "Dispels magical darkness within 30 ft.; hostile creatures in the area without total cover make a CON save (your spell save DC), taking the rolled damage plus your cleric level radiant damage on a failure, half as much on a success.",
    },
  ],
  Nature: [
    {
      title: "Channel Divinity: Charm Animals and Plants",
      detail:
        "Spend a Channel Divinity use to force beasts and plant creatures within 30 ft. to make a WIS save or be charmed toward you for 1 minute (ends early if they take damage).",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Beasts and plant creatures within 30 ft. that can see you make a WIS save (your spell save DC) or are charmed toward you and creatures you designate for 1 minute (ends early if they take damage).",
    },
  ],
  Order: [
    {
      title: "Channel Divinity: Order's Demand",
      detail:
        "Spend a Channel Divinity use to force a WIS save from creatures within 30 ft.; failures are charmed until the end of your next turn (or until they take damage) and can be made to drop what they're holding.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Creatures you choose within 30 ft. that can see or hear you make a WIS save (your spell save DC) or are charmed until the end of your next turn or until they take damage; you may also make charmed failures drop what they're holding.",
    },
  ],
  Peace: [
    {
      title: "Channel Divinity: Balm of Peace",
      detail:
        "Spend a Channel Divinity use to move up to your speed without provoking opportunity attacks, healing 2d6 plus your Wisdom modifier hit points (minimum 1) to each creature you come within 5 ft. of along the way, once each.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      roll: { label: "Healing", die: StandardDie.d6, count: 2 },
      note: "Move up to your speed without provoking opportunity attacks; each creature you come within 5 ft. of during the move (once each) regains the rolled hit points plus your Wisdom modifier (minimum 1).",
    },
  ],
  Tempest: [
    {
      title: "Channel Divinity: Destructive Wrath",
      detail:
        "Spend a Channel Divinity use, when you roll lightning or thunder damage, to deal the maximum possible damage instead of rolling.",
      level: 2,
      cost: "special",
      costNote:
        "When you roll lightning or thunder damage, in place of rolling",
      pool: "Channel Divinity",
      amount: 1,
      note: "Deal the maximum possible damage for that lightning or thunder damage roll instead of rolling.",
    },
  ],
  Trickery: [
    {
      title: "Channel Divinity: Invoke Duplicity",
      detail:
        "Spend a Channel Divinity use to create an illusory duplicate of yourself within 30 ft. for up to 1 minute; you can cast spells as if from its space, and you gain advantage on attack rolls against a creature adjacent to both you and the duplicate.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Create an illusory duplicate of yourself in an unoccupied space within 30 ft.; you can cast spells as if from its space, move it up to 30 ft. as a bonus action (within 120 ft. of you), and gain advantage on attack rolls against a creature adjacent to both you and the duplicate. Lasts up to 1 minute or until dismissed as a bonus action.",
    },
    {
      title: "Channel Divinity: Cloak of Shadows",
      detail:
        "Spend a Channel Divinity use to become invisible until the end of your next turn (ends early if you attack or cast a spell).",
      level: 6,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      note: "Become invisible until the end of your next turn; ends early if you attack or cast a spell.",
    },
  ],
  Twilight: [
    {
      title: "Channel Divinity: Twilight Sanctuary",
      detail:
        "Spend a Channel Divinity use to create a 30 ft. radius dim-light sphere centered on you for 1 minute; creatures that end their turn inside choose either 1d6 plus your cleric level temporary hit points or to end one charmed or frightened effect on themselves.",
      level: 2,
      cost: "action",
      pool: "Channel Divinity",
      amount: 1,
      roll: { label: "Temporary hit points", die: StandardDie.d6 },
      note: "Create a 30 ft. radius dim-light sphere centered on you (moves with you) for 1 minute; a creature that ends its turn inside either gains the rolled temporary hit points plus your cleric level, or has one charmed or frightened effect on it ended — your choice.",
    },
  ],
  War: [
    {
      title: "Channel Divinity: Guided Strike",
      detail:
        "Spend a Channel Divinity use, after making an attack roll but before knowing the result, to add +10 to it.",
      level: 2,
      cost: "special",
      costNote:
        "On your own attack roll, after seeing the roll but before it's known to hit or miss",
      pool: "Channel Divinity",
      amount: 1,
      note: "Add +10 to the attack roll.",
    },
    {
      title: "Channel Divinity: War God's Blessing",
      detail:
        "Reaction: spend a Channel Divinity use to grant +10 to an ally's attack roll within 30 ft., before the result of that roll is known.",
      level: 6,
      cost: "reaction",
      pool: "Channel Divinity",
      amount: 1,
      note: "When a creature within 30 ft. makes an attack roll, add +10 to it before the result is known.",
    },
  ],
};
