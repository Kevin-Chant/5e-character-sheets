import {
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { DieDefinition, DieExpression, LimitedUseAbility } from "src/lib/types";
import { AbilityAction, ActionCost, FeatureMechanics } from "./types";

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

// Build one "spend a use, optionally roll for display, then remind" action —
// the shape behind most limited-use features. Callers bake structural scaling
// (the dice `count`/`die`) from a level; modifiers stay formulas resolved at
// roll time, so they aren't passed here. Shared by the catalog below and the
// builder's pool grants (`class-pools.ts`).
export const spendRollRemind = (opts: {
  id: string;
  name: string;
  cost: ActionCost;
  costNote?: string;
  // Omit for a roll-less action (a pure trigger/reminder).
  roll?: { label: string; count?: number; die: DieDefinition };
  note: string;
}): AbilityAction => ({
  id: opts.id,
  name: opts.name,
  cost: opts.cost,
  ...(opts.costNote ? { costNote: opts.costNote } : {}),
  effects: [
    spendOneUse,
    ...(opts.roll
      ? [
          {
            effect: "roll" as const,
            label: opts.roll.label,
            amount: {
              fixed: [
                opts.roll.count ?? 1,
                opts.roll.die,
                DieOperation.roll,
              ] as DieExpression,
            },
          },
        ]
      : []),
    { effect: "remind", note: opts.note },
  ],
});

// A superiority-die pool: spend one, roll it, apply the maneuver. Sized per
// source (battle master d8, Martial Adept d6).
export const SUPERIORITY = (die: StandardDie): FeatureMechanics => ({
  actions: [
    spendRollRemind({
      id: "superiority-die",
      name: "Spend superiority die",
      cost: "special",
      costNote: "usually part of an attack (maneuver)",
      roll: { label: "Superiority die", die },
      note: "Apply your chosen maneuver's effect.",
    }),
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

  // Reckless Attack (barbarian 2): advisory, since it applies only to melee
  // Strength attacks and hands attackers advantage against you in return —
  // conditions the roll dialog can't see, so it's surfaced as a note.
  "reckless attack": {
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "Advantage on melee Strength attacks this turn — but attack rolls against you have advantage until your next turn.",
        },
      },
    ],
  },

  // Danger Sense (barbarian 2): advantage on Dexterity saves against effects
  // you can see (traps, spells). Advisory — the dialog can't tell which save.
  "danger sense": {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Advantage on Dexterity saving throws against effects you can see (not while blinded, deafened, or incapacitated).",
        },
      },
    ],
  },

  // Feral Instinct (barbarian 7): advantage on initiative. Advisory — the
  // dialog can't tell an initiative check from any other.
  "feral instinct": {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Advantage on initiative rolls.",
        },
      },
    ],
  },

  // Stroke of Luck (rogue 20): once per short/long rest, turn a miss into a hit
  // or a failed ability check into a natural 20.
  "stroke of luck": {
    actions: [
      spendRollRemind({
        id: "stroke-of-luck",
        name: "Stroke of Luck",
        cost: "special",
        costNote: "after a missed attack or failed check",
        note: "Turn a missed attack into a hit, or treat a failed d20 ability check as a 20.",
      }),
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
      spendRollRemind({
        id: "action-surge",
        name: "Action Surge",
        cost: "free",
        costNote: "on your turn",
        note: "Take one additional action this turn.",
      }),
    ],
  },

  // Rage (barbarian): the ongoing state (damage bonus, resistances) is a table
  // condition, not sheet automation. The advantage is advisory — it applies
  // only to Strength checks/saves and only while raging, neither of which the
  // roll dialog can see.
  rage: {
    riders: [
      {
        appliesTo: ["check"],
        rider: {
          rider: "advantage",
          note: "Advantage on Strength checks and Strength saving throws while raging.",
        },
      },
    ],
    actions: [
      spendRollRemind({
        id: "rage",
        name: "Enter Rage",
        cost: "bonusAction",
        note: "Raging: bonus to melee damage with STR weapons, resistance to bludgeoning/piercing/slashing, advantage on STR checks and saves. Ends early if you don't attack or take damage.",
      }),
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

  // Bardic Inspiration: this static entry only reminds; the builder-granted
  // pool overrides it with a level-scaled die roll (d6→d12) — see
  // class-pools.ts.
  "bardic inspiration": {
    actions: [
      spendRollRemind({
        id: "bardic-inspiration",
        name: "Inspire",
        cost: "bonusAction",
        note: "Give one creature other than you within 60 ft. an inspiration die to add to one d20 roll in the next 10 minutes.",
      }),
    ],
  },

  // Ki (monk): the baseline spends plus Stunning Strike. The stunning-strike DC
  // is your ki save DC (8 + PB + WIS) — a value the sheet doesn't compute yet,
  // so it's named in the reminder rather than shown.
  ki: {
    actions: [
      spendRollRemind({
        id: "flurry",
        name: "Flurry of Blows",
        cost: "bonusAction",
        costNote: "after the Attack action",
        note: "Make two unarmed strikes.",
      }),
      spendRollRemind({
        id: "patient-defense",
        name: "Patient Defense",
        cost: "bonusAction",
        note: "Take the Dodge action.",
      }),
      spendRollRemind({
        id: "step-of-the-wind",
        name: "Step of the Wind",
        cost: "bonusAction",
        note: "Disengage or Dash; your jump distance is doubled this turn.",
      }),
      spendRollRemind({
        id: "stunning-strike",
        name: "Stunning Strike",
        cost: "special",
        costNote: "when you hit with a melee weapon attack",
        note: "Target must succeed on a Constitution save (your ki save DC, 8 + PB + WIS) or be stunned until the end of your next turn.",
      }),
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
      spendRollRemind({
        id: "relentless-endurance",
        name: "Relentless Endurance",
        cost: "special",
        costNote: "when reduced to 0 HP",
        note: "Drop to 1 hit point instead of 0.",
      }),
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
      spendRollRemind({
        id: "indomitable",
        name: "Indomitable",
        cost: "special",
        costNote: "when you fail a saving throw",
        note: "Reroll the failed saving throw; you must use the new roll.",
      }),
    ],
  },

  // Hexblade's Curse (hexblade warlock): the ongoing marks are table state.
  "hexblade's curse": {
    actions: [
      spendRollRemind({
        id: "hexblade-curse",
        name: "Curse a target",
        cost: "bonusAction",
        note: "Curse one creature within 30 ft. for 1 minute: +PB to damage against it, crits on 19–20, and regain CHA mod + warlock level HP if it dies.",
      }),
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
      spendRollRemind({
        id: "channel-divinity",
        name: "Channel Divinity",
        cost: "action",
        costNote: "some options use a different action",
        note: "Use one of your Channel Divinity options.",
      }),
    ],
  },

  // Divine Sense (paladin).
  "divine sense": {
    actions: [
      spendRollRemind({
        id: "divine-sense",
        name: "Divine Sense",
        cost: "action",
        note: "Until the end of your next turn, sense the location of celestials, fiends, and undead within 60 ft. that aren't behind total cover.",
      }),
    ],
  },

  // Wild Shape (druid): the beast form itself is a table state.
  "wild shape": {
    actions: [
      spendRollRemind({
        id: "wild-shape",
        name: "Wild Shape",
        cost: "action",
        note: "Transform into a beast you've seen; max CR and movement limits depend on druid level. Lasts half your druid level in hours.",
      }),
    ],
  },

  // Breath Weapon (dragonborn): damage type/shape follow the ancestry. This
  // static entry is a level-unaware fallback; the builder-granted racial pool
  // overrides it with dice scaled to total character level — see class-pools.ts
  // (syncRacePools re-derives it on level-up).
  "breath weapon": {
    actions: [
      spendRollRemind({
        id: "breath-weapon",
        name: "Breath Weapon",
        cost: "action",
        note: "Exhale your ancestry's breath: DC 8 + CON mod + PB, 2d6 damage (3d6 at 6th, 4d6 at 11th, 5d6 at 16th level), half on a successful save.",
      }),
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

  // Fighting Spirit (samurai fighter): temp HP + advantage this turn. This
  // static entry grants the base 5; the builder-granted pool overrides it with
  // level-scaled mechanics (10 at samurai 10, 15 at 15) — see class-pools.ts.
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

  // Combat Superiority (battle master fighter): d8 superiority dice. This
  // static entry pins d8; the builder-granted Battle Master pool overrides it
  // with a level-scaled die (d10 at 10, d12 at 18) — see class-pools.ts. The
  // Martial Adept feat's d6 pool is keyed separately below (its grant is
  // titled "Superiority Die").
  "superiority dice": SUPERIORITY(StandardDie.d8),
  "combat superiority": SUPERIORITY(StandardDie.d8),
  "superiority die": SUPERIORITY(StandardDie.d6),

  // Luck Points (the Lucky feat's pool — keyed to the grant name; the feat
  // title itself collides with the halfling trait).
  "luck points": {
    actions: [
      spendRollRemind({
        id: "luck-point",
        name: "Spend Luck",
        cost: "special",
        costNote: "after a d20 is rolled",
        note: "Roll an extra d20 (for your roll, or an attack roll against you) and choose which result counts.",
      }),
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
      spendRollRemind({
        id: "divine-intervention",
        name: "Divine Intervention",
        cost: "action",
        roll: { label: "d100", die: { numFaces: 100 } },
        note: "Success if the roll is at or under your cleric level; on success, recharge after 7 days instead of a long rest.",
      }),
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
