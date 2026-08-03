import { StandardDie } from "src/lib/data/data-definitions";
import { HostTable } from "./types";

// Shared-pool action hosts for monk subclasses (see ./types). Mechanical facts
// with original wording only.
//
// Only genuine Ki spenders are hosted here — a discrete action whose use
// always costs a fixed number of Ki. Features that are free to use and only
// optionally boosted by extra Ki (Breath of the Dragon, Aspect of the Wyrm,
// Searing Sunburst) are left as prose in subclass-features/monk.ts, since this
// shape can't represent "0 Ki, or more for a bigger effect." Same reasoning
// keeps all of Ascendant Dragon and Four Elements out of this file — their
// Ki-adjacent features are per-long-rest resources with Ki only as overflow,
// or (for Four Elements) a closed pick-list handled elsewhere. Passives with
// no cost, and Wholeness of Body (a once-per-long-rest self-heal, not a Ki
// spend), are likewise left as prose.
export const MONK_ACTION_HOSTS: HostTable = {
  "Astral Self": [
    {
      title: "Arms of the Astral Self",
      detail:
        "Bonus action, 1 ki, lasting 10 minutes: summon spectral arms. While they persist, use Wisdom in place of Strength for checks and saves, and make unarmed strikes with them (force damage, +5 ft. reach, Wisdom for the attack and damage rolls).",
      level: 3,
      cost: "bonusAction",
      pool: "Ki",
      note: "Each creature of your choice within 10 ft. makes a Dexterity save or takes 2 Martial Arts dice of force damage (all or nothing).",
    },
    {
      title: "Visage of the Astral Self",
      detail:
        "Bonus action, 1 ki, lasting 10 minutes (stacks with Arms): summon a spectral visage.",
      level: 6,
      cost: "bonusAction",
      pool: "Ki",
      note: "Gain darkvision 120 ft. (works even in magical darkness) and advantage on Wisdom (Insight) and Charisma (Intimidation) checks; speak telepathically to one creature within 60 ft., or project your voice up to 600 ft.",
    },
    {
      title: "Awakened Astral Self",
      detail:
        "Bonus action, 5 ki, lasting 10 minutes: summon the arms, visage, and body of your astral self together.",
      level: 17,
      cost: "bonusAction",
      pool: "Ki",
      amount: 5,
      note: "Gain +2 AC, and Extra Attack can make three unarmed strikes with the Arms instead of two.",
    },
  ],
  "Drunken Master": [
    {
      title: "Redirect Attack",
      detail:
        "Part of Tipsy Sway: reaction, 1 ki, when a melee attack misses you.",
      level: 6,
      cost: "reaction",
      costNote: "when a melee attack roll misses you",
      pool: "Ki",
      note: "Redirect the attack to hit another creature of your choice within 5 ft. of you (using the same roll).",
    },
    {
      title: "Drunkard's Luck",
      detail:
        "Spend 2 ki to shrug off the effects of misfortune on a roll you're about to make.",
      level: 11,
      cost: "special",
      costNote:
        "before an ability check, attack roll, or saving throw you'd make with disadvantage",
      pool: "Ki",
      amount: 2,
      note: "Remove the disadvantage on that roll.",
    },
  ],
  Kensei: [
    {
      title: "Deft Strike",
      detail:
        "Part of One with the Blade: on a kensei weapon hit, spend 1 ki (once per turn) for extra damage.",
      level: 6,
      cost: "special",
      costNote: "once per turn, on a kensei weapon hit",
      pool: "Ki",
      note: "Deal extra damage equal to your Martial Arts die.",
    },
    {
      title: "Sharpen the Blade",
      detail:
        "Bonus action, spend up to 3 ki: one kensei weapon you're holding gains a bonus to attack and damage rolls matching the ki spent, for 1 minute or until you repeat this.",
      level: 11,
      cost: "bonusAction",
      pool: "Ki",
      note: "Grants a +1 to +3 bonus to attack and damage rolls (matching total ki spent, up to 3) for 1 minute or until repeated. No effect on a weapon that already has a magic bonus to attack and damage rolls.",
    },
  ],
  "Long Death": [
    {
      title: "Mastery of Death",
      detail:
        "When you'd drop to 0 hit points, you may spend 1 ki (no action required) to drop to 1 hit point instead.",
      level: 11,
      cost: "free",
      costNote: "no action required, when you're reduced to 0 hit points",
      pool: "Ki",
      note: "You drop to 1 hit point instead of 0.",
    },
    {
      title: "Touch of the Long Death",
      detail:
        "Action, touch a creature within 5 ft. and spend 1-10 ki to unleash the power of death upon it.",
      level: 17,
      cost: "action",
      pool: "Ki",
      note: "The target makes a Constitution save, taking 2d10 necrotic damage per ki point spent (1-10) on a failure, half as much on a success.",
    },
  ],
  Mercy: [
    {
      title: "Hands of Healing",
      detail:
        "Action, spend 1 ki: touch a creature and restore hit points. Can replace one Flurry of Blows strike with this at no ki cost.",
      level: 3,
      cost: "action",
      pool: "Ki",
      note: "Restore hit points equal to a Martial Arts die + your Wisdom modifier.",
    },
    {
      title: "Hands of Harm",
      detail:
        "Once per turn, when you hit with an unarmed strike, spend 1 ki for extra necrotic damage.",
      level: 3,
      cost: "special",
      costNote: "once per turn, on an unarmed-strike hit",
      pool: "Ki",
      note: "Deal extra necrotic damage equal to a Martial Arts die + your Wisdom modifier.",
    },
    {
      title: "Hand of Ultimate Mercy",
      detail:
        "Once per long rest, as an action, spend 5 ki and touch a creature dead no longer than 24 hours to restore it to life.",
      level: 17,
      cost: "action",
      pool: "Ki",
      amount: 5,
      roll: { label: "Healing", die: StandardDie.d10, count: 4 },
      note: "The creature returns to life with the rolled hit points plus your Wisdom modifier, and is cured of one disease or one of blinded, deafened, paralyzed, poisoned, or stunned.",
    },
  ],
  "Open Hand": [
    {
      title: "Quivering Palm",
      detail:
        "On an unarmed-strike hit, spend 3 ki to set up lethal vibrations lasting a number of days equal to your monk level.",
      level: 17,
      cost: "special",
      costNote: "on an unarmed-strike hit",
      pool: "Ki",
      amount: 3,
      note: "At any point before the vibrations end, you may use a bonus action to end them, forcing a Constitution save: the target drops to 0 hit points on a failure, or takes 10d10 necrotic damage on a success. Only one target's vibrations can be active at a time.",
      // Days, not rounds — no rounds, so it never ticks away mid-fight.
      applies: { name: "Quivering Palm" },
    },
  ],
  Shadow: [
    {
      title: "Shadow Arts",
      detail:
        "Spend 2 ki to cast Darkness, Darkvision, Pass without Trace, or Silence, without material components. Also learn the Minor Illusion cantrip.",
      level: 3,
      cost: "action",
      pool: "Ki",
      amount: 2,
      note: "Cast Darkness, Darkvision, Pass without Trace, or Silence, without providing material components.",
    },
  ],
  "Sun Soul": [
    {
      title: "Radiant Sun Bolt",
      detail:
        "Ranged spell attack, 30 ft., using Dexterity, usable as part of the Attack action. Spend 1 ki to make the attack a second time as a bonus action (stacks with Extra Attack).",
      level: 3,
      cost: "bonusAction",
      costNote: "to make the attack again, in addition to the free attack",
      pool: "Ki",
      note: "Make a second Radiant Sun Bolt attack, dealing your Martial Arts die of radiant damage on a hit.",
    },
    {
      title: "Searing Arc Strike",
      detail:
        "After the Attack action, bonus action: spend 2+ ki to cast Burning Hands without a spell slot.",
      level: 6,
      cost: "bonusAction",
      costNote: "immediately after taking the Attack action on your turn",
      pool: "Ki",
      amount: 2,
      note: "Cast Burning Hands without expending a spell slot; its effective spell level rises by one for each ki point spent beyond the first 2 (up to half your monk level in extra ki).",
    },
  ],
};
