import {
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { LimitedUseAbility } from "src/lib/types";
import { FeatureMechanics } from "./types";

// Mechanics for well-known features, keyed by normalized feature / ability
// title (the same identity bridge the builder and Durable detection already
// use — a structured mechanics field on the character model can replace the
// title lookup later without touching the interpreters).
//
// As with the non-SRD content files: entries store only mechanical facts with
// original summaries — never published prose. Reminder notes are paraphrases.
//
// Fidelity gaps are deliberate and commented — conditions the sheet can't see
// (wielding style, proficiency of a given check) are approximated and noted,
// because a wrong-but-visible rider beats silent absence at the table.

const SLOT_CREATION_COSTS: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 7,
};
export { SLOT_CREATION_COSTS };

// Font of Magic (PHB sorcerer): both directions are bonus actions. Creating a
// slot costs points per the table above (nothing above 5th); converting an
// unspent slot yields points equal to its level.
const FONT_OF_MAGIC: FeatureMechanics = {
  actions: [
    {
      id: "create-slot",
      name: "Create spell slot",
      cost: "bonusAction",
      choose: { slotLevel: "toRestore", slotLevelMax: 5 },
      effects: [
        { effect: "spendUses", amount: { byChosenLevel: SLOT_CREATION_COSTS } },
        { effect: "restoreSlot" },
      ],
    },
    {
      id: "convert-slot",
      name: "Convert slot to points",
      cost: "bonusAction",
      choose: { slotLevel: "toExpend" },
      effects: [
        { effect: "expendSlot" },
        { effect: "restoreUses", amount: { chosenLevel: true } },
      ],
    },
  ],
};

const spendOneUse = {
  effect: "spendUses",
  amount: { fixed: 1 },
} as const;

// A superiority-die pool: spend one, roll it, apply the maneuver. Sized per
// source (battle master d8, Martial Adept d6).
const SUPERIORITY = (die: StandardDie): FeatureMechanics => ({
  actions: [
    {
      id: "superiority-die",
      name: "Spend superiority die",
      cost: "special",
      costNote: "usually part of an attack (maneuver)",
      effects: [
        spendOneUse,
        {
          effect: "roll",
          label: "Superiority die",
          amount: { fixed: [1, die, DieOperation.roll] },
        },
        { effect: "remind", note: "Apply your chosen maneuver's effect." },
      ],
    },
  ],
});

const SLOT_RECOVERY: FeatureMechanics = {
  actions: [
    {
      id: "recover-slot",
      name: "Recover slot",
      cost: "special",
      costNote: "during a short rest",
      choose: { slotLevel: "toRestore", slotLevelMax: 5 },
      effects: [spendOneUse, { effect: "restoreSlot" }],
    },
  ],
};

export const FEATURE_MECHANICS: Record<string, FeatureMechanics> = {
  // ---- Riders (feats, fighting styles, class features) ----

  // Durable: hit-die healing has a floor of twice the CON modifier, itself at
  // least 2 — expressible as one max() formula now that the engine has it.
  durable: {
    riders: [
      {
        appliesTo: ["hitDie"],
        rider: {
          rider: "minimumTotal",
          value: {
            operation: Operation.maximum,
            operands: [
              2,
              {
                operation: Operation.multiplication,
                operands: [2, StatKey.con],
              },
            ],
          },
        },
      },
    ],
  },

  // Reliable Talent (rogue 11): d20s of 9 or lower count as 10. Fidelity gap:
  // RAW applies only to proficient ability checks; the sheet applies it to all
  // non-attack d20s since the roll dialog doesn't know the source skill.
  "reliable talent": {
    riders: [
      { appliesTo: ["check"], rider: { rider: "minimumDie", value: 10 } },
    ],
  },

  // Great Weapon Fighting style: reroll 1s and 2s on damage dice once, keeping
  // the new roll. Fidelity gap: RAW requires a two-handed/versatile melee
  // weapon; the sheet applies it to all damage rolls.
  "great weapon fighting": {
    riders: [
      { appliesTo: ["damage"], rider: { rider: "rerollBelow", threshold: 2 } },
    ],
  },

  // Champion fighter's expanded crit ranges.
  "improved critical": {
    riders: [
      { appliesTo: ["attack"], rider: { rider: "critRange", value: 19 } },
    ],
  },
  "superior critical": {
    riders: [
      { appliesTo: ["attack"], rider: { rider: "critRange", value: 18 } },
    ],
  },

  // ---- Actions on limited-use pools ----

  // Common titles for the sorcery-point pool all route to Font of Magic.
  "sorcery points": FONT_OF_MAGIC,
  "font of magic": FONT_OF_MAGIC,
  "flexible casting": FONT_OF_MAGIC,

  // Second Wind (fighter): bonus action, regain 1d10 + fighter level HP.
  "second wind": {
    actions: [
      {
        id: "second-wind",
        name: "Second Wind",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          {
            effect: "heal",
            amount: {
              fixed: [1, StandardDie.d10, DieOperation.roll],
              plusLevelOf: OfficialClass.Fighter,
            },
          },
        ],
      },
    ],
  },

  // Action Surge (fighter): no action cost — grants an extra action on your
  // turn. The extra action itself is a table fact, so it's a reminder.
  "action surge": {
    actions: [
      {
        id: "action-surge",
        name: "Action Surge",
        cost: "free",
        costNote: "on your turn",
        effects: [
          spendOneUse,
          { effect: "remind", note: "Take one additional action this turn." },
        ],
      },
    ],
  },

  // Rage (barbarian): the ongoing state (damage bonus, resistances) is a table
  // condition, not sheet automation.
  rage: {
    actions: [
      {
        id: "rage",
        name: "Enter Rage",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Raging: bonus to melee damage with STR weapons, resistance to bludgeoning/piercing/slashing, advantage on STR checks and saves. Ends early if you don't attack or take damage.",
          },
        ],
      },
    ],
  },

  // Lay on Hands (paladin): a pool of points; spend any number to heal that
  // much. The 5-points-per-disease/poison option stays a table call.
  "lay on hands": {
    actions: [
      {
        id: "lay-on-hands",
        name: "Lay on Hands",
        cost: "action",
        choose: { amount: "uses" },
        effects: [
          { effect: "spendUses", amount: { chosenAmount: true } },
          { effect: "heal", amount: { chosenAmount: true } },
        ],
      },
    ],
  },

  // Bardic Inspiration: the die goes to an ally, so the grant is a reminder.
  "bardic inspiration": {
    actions: [
      {
        id: "bardic-inspiration",
        name: "Inspire",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Give one creature other than you within 60 ft. an inspiration die to add to one d20 roll in the next 10 minutes.",
          },
        ],
      },
    ],
  },

  // Ki (monk): the three baseline spends.
  ki: {
    actions: [
      {
        id: "flurry",
        name: "Flurry of Blows",
        cost: "bonusAction",
        costNote: "after the Attack action",
        effects: [
          spendOneUse,
          { effect: "remind", note: "Make two unarmed strikes." },
        ],
      },
      {
        id: "patient-defense",
        name: "Patient Defense",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          { effect: "remind", note: "Take the Dodge action." },
        ],
      },
      {
        id: "step-of-the-wind",
        name: "Step of the Wind",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Disengage or Dash; your jump distance is doubled this turn.",
          },
        ],
      },
    ],
  },

  // Arcane Recovery (wizard) / Natural Recovery (land druid): once per day on
  // a short rest. Fidelity gap: RAW allows several slots with combined levels
  // up to half class level; the sheet restores one slot per use of the pool
  // (≤ 5th), which covers the common case — expand once multi-pick UI exists.
  "arcane recovery": SLOT_RECOVERY,
  "natural recovery": SLOT_RECOVERY,

  // Relentless Endurance (half-orc): a trigger, not an action.
  "relentless endurance": {
    actions: [
      {
        id: "relentless-endurance",
        name: "Relentless Endurance",
        cost: "special",
        costNote: "when reduced to 0 HP",
        effects: [
          spendOneUse,
          { effect: "remind", note: "Drop to 1 hit point instead of 0." },
        ],
      },
    ],
  },

  // Stone's Endurance (goliath): reaction; the reduction roll is display-only
  // since incoming damage isn't a sheet quantity.
  "stone's endurance": {
    actions: [
      {
        id: "stones-endurance",
        name: "Stone's Endurance",
        cost: "reaction",
        costNote: "when you take damage",
        effects: [
          spendOneUse,
          {
            effect: "roll",
            label: "Damage reduced by",
            amount: {
              fixed: {
                operation: Operation.addition,
                operands: [
                  [1, StandardDie.d12, DieOperation.roll],
                  StatKey.con,
                ],
              },
            },
          },
        ],
      },
    ],
  },

  // Indomitable (fighter 9): reroll a failed save.
  indomitable: {
    actions: [
      {
        id: "indomitable",
        name: "Indomitable",
        cost: "special",
        costNote: "when you fail a saving throw",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Reroll the failed saving throw; you must use the new roll.",
          },
        ],
      },
    ],
  },

  // Hexblade's Curse (hexblade warlock): the ongoing marks are table state.
  "hexblade's curse": {
    actions: [
      {
        id: "hexblade-curse",
        name: "Curse a target",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Curse one creature within 30 ft. for 1 minute: +PB to damage against it, crits on 19–20, and regain CHA mod + warlock level HP if it dies.",
          },
        ],
      },
    ],
  },

  // Healing Light (celestial warlock): a pool of d6s — spend n, heal the
  // rolled total. Fidelity gap: RAW caps a single use at CHA mod + 1 dice;
  // the sheet caps at the pool's remaining dice.
  "healing light": {
    actions: [
      {
        id: "healing-light",
        name: "Healing Light",
        cost: "bonusAction",
        choose: { amount: "uses" },
        effects: [
          { effect: "spendUses", amount: { chosenAmount: true } },
          { effect: "heal", amount: { chosenAmountDice: StandardDie.d6 } },
        ],
      },
    ],
  },

  // Elemental Adept (feat): damage dice of 1 count as 2. Fidelity gap: RAW
  // applies only to spells of the feat's chosen damage type; the sheet applies
  // it to all damage rolls.
  "elemental adept": {
    riders: [
      { appliesTo: ["damage"], rider: { rider: "minimumDie", value: 2 } },
    ],
  },

  // Channel Divinity (cleric/paladin): the shared pool; what each option does
  // (Turn Undead, Sacred Weapon, subclass options) is a table fact.
  "channel divinity": {
    actions: [
      {
        id: "channel-divinity",
        name: "Channel Divinity",
        cost: "action",
        costNote: "some options use a different action",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Use one of your Channel Divinity options.",
          },
        ],
      },
    ],
  },

  // Divine Sense (paladin).
  "divine sense": {
    actions: [
      {
        id: "divine-sense",
        name: "Divine Sense",
        cost: "action",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Until the end of your next turn, sense the location of celestials, fiends, and undead within 60 ft. that aren't behind total cover.",
          },
        ],
      },
    ],
  },

  // Wild Shape (druid): the beast form itself is a table state.
  "wild shape": {
    actions: [
      {
        id: "wild-shape",
        name: "Wild Shape",
        cost: "action",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Transform into a beast you've seen; max CR and movement limits depend on druid level. Lasts half your druid level in hours.",
          },
        ],
      },
    ],
  },

  // Breath Weapon (dragonborn): damage type/shape follow the ancestry and the
  // dice scale with character level, neither of which the sheet can see here.
  "breath weapon": {
    actions: [
      {
        id: "breath-weapon",
        name: "Breath Weapon",
        cost: "action",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Exhale your ancestry's breath: DC 8 + CON mod + PB, 2d6 damage (3d6 at 6th, 4d6 at 11th, 5d6 at 16th level), half on a successful save.",
          },
        ],
      },
    ],
  },

  // Wholeness of Body (monk 6): once per long rest, regain 3 × monk level HP.
  "wholeness of body": {
    actions: [
      {
        id: "wholeness-of-body",
        name: "Wholeness of Body",
        cost: "action",
        effects: [
          spendOneUse,
          {
            effect: "heal",
            amount: {
              fixed: 0,
              plusLevelOf: OfficialClass.Monk,
              levelMultiplier: 3,
            },
          },
        ],
      },
    ],
  },

  // Fighting Spirit (samurai fighter): temp HP + advantage this turn.
  // Fidelity gap: the temp HP scale to 10 at samurai 10 and 15 at 15; the
  // sheet grants the base 5.
  "fighting spirit": {
    actions: [
      {
        id: "fighting-spirit",
        name: "Fighting Spirit",
        cost: "bonusAction",
        effects: [
          spendOneUse,
          { effect: "gainTempHp", amount: { fixed: 5 } },
          {
            effect: "remind",
            note: "Advantage on all weapon attack rolls until the end of this turn.",
          },
        ],
      },
    ],
  },

  // Combat Superiority (battle master fighter): d8 superiority dice.
  // Fidelity gap: the die grows to d10 at fighter 10 and d12 at 18. The
  // Martial Adept feat's d6 pool is keyed separately below (its grant is
  // titled "Superiority Die").
  "superiority dice": SUPERIORITY(StandardDie.d8),
  "combat superiority": SUPERIORITY(StandardDie.d8),
  "superiority die": SUPERIORITY(StandardDie.d6),

  // Luck Points (the Lucky feat's pool — keyed to the grant name; the feat
  // title itself collides with the halfling trait).
  "luck points": {
    actions: [
      {
        id: "luck-point",
        name: "Spend Luck",
        cost: "special",
        costNote: "after a d20 is rolled",
        effects: [
          spendOneUse,
          {
            effect: "remind",
            note: "Roll an extra d20 (for your roll, or an attack roll against you) and choose which result counts.",
          },
        ],
      },
    ],
  },

  // Chef's Treats (Chef feat): eat one as a bonus action for temp HP equal to
  // your proficiency bonus.
  "chef's treats": {
    actions: [
      {
        id: "eat-treat",
        name: "Eat a treat",
        cost: "bonusAction",
        effects: [spendOneUse, { effect: "gainTempHp", amount: { fixed: PB } }],
      },
    ],
  },

  // Divine Intervention (cleric 10): percentile roll under cleric level.
  "divine intervention": {
    actions: [
      {
        id: "divine-intervention",
        name: "Divine Intervention",
        cost: "action",
        effects: [
          spendOneUse,
          {
            effect: "roll",
            label: "d100",
            amount: { fixed: [1, { numFaces: 100 }, DieOperation.roll] },
          },
          {
            effect: "remind",
            note: "Success if the roll is at or under your cleric level; on success, recharge after 7 days instead of a long rest.",
          },
        ],
      },
    ],
  },
};

// Race-keyed riders (substring match on the race name), for traits whose
// feature titles are too generic to key safely — the halfling's "Lucky" trait
// would collide with the Lucky feat.
export const RACE_MECHANICS: Record<string, FeatureMechanics> = {
  // Halfling Luck (reroll natural 1s, keeping the new roll) + Brave.
  halfling: {
    riders: [
      {
        appliesTo: ["check", "attack"],
        rider: { rider: "rerollBelow", threshold: 1 },
      },
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Brave: advantage on saves against being frightened.",
        },
      },
    ],
  },
  // Dwarven Resilience. Advisory — the sheet can't see the save's source.
  dwarf: {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Dwarven Resilience: advantage on saves against poison.",
        },
      },
    ],
  },
  // Fey Ancestry — the substring also catches half-elves.
  elf: {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Fey Ancestry: advantage on saves against being charmed.",
        },
      },
    ],
  },
  // Gnome Cunning.
  gnome: {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Gnome Cunning: advantage on INT/WIS/CHA saves against magic.",
        },
      },
    ],
  },
};

export const normalizeTitle = (title: string): string =>
  title.trim().toLowerCase();

// The catalog mechanics for a feature/ability title, if any.
export function mechanicsForTitle(title: string): FeatureMechanics | undefined {
  return FEATURE_MECHANICS[normalizeTitle(title)];
}

// The mechanics in play for a limited-use ability: an authored `mechanics`
// field wins (homebrew), the bundled catalog answers by title otherwise.
export function mechanicsForAbility(
  ability: LimitedUseAbility,
): FeatureMechanics | undefined {
  return ability.mechanics ?? mechanicsForTitle(ability.info.title);
}
