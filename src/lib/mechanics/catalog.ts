import {
  DamageType,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormula,
  DieDefinition,
  DieExpression,
  LimitedUseAbility,
} from "src/lib/types";
import {
  AbilityAction,
  ActionCost,
  ActiveRider,
  FeatureMechanics,
} from "./types";

// Mechanics for well-known features, keyed by normalized feature/ability title.
// Entries store only mechanical facts with original summaries, never published
// prose. Fidelity gaps (conditions the sheet can't see) are noted inline.

const SLOT_CREATION_COSTS: Record<number, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 6,
  5: 7,
};
export { SLOT_CREATION_COSTS };

// Font of Magic (PHB sorcerer): create/convert are both bonus actions.
// Creating costs points per the table above; converting yields the slot's level.
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

// Exported for the builder's pool grants that compose their own actions
// (e.g. a temp-HP grant) rather than using `spendRollRemind`.
export const spendOneUse = {
  effect: "spendUses",
  amount: { fixed: 1 },
} as const;

// Builds a "spend a use, optionally roll for display, then remind" action —
// the shape behind most limited-use features. Callers bake dice scaling
// (`count`/`die`) from a level; formula modifiers resolve at roll time.
// Shared with the builder's pool grants (`class-pools.ts`).
export const spendRollRemind = (opts: {
  id: string;
  name: string;
  cost: ActionCost;
  costNote?: string;
  // Omit for a roll-less action (a pure trigger/reminder).
  roll?: { label: string; count?: number; die: DieDefinition };
  note: string;
  // The condition this use puts on a chosen target (see `AbilityAction`).
  applies?: AbilityAction["applies"];
}): AbilityAction => ({
  id: opts.id,
  name: opts.name,
  cost: opts.cost,
  ...(opts.costNote ? { costNote: opts.costNote } : {}),
  ...(opts.applies ? { applies: opts.applies } : {}),
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

// A pool-less "action host": a feature that spends a *shared* resource owned by
// a different ability (Cutting Words draining Bardic Inspiration, a monk
// discipline draining Ki). The host has `maxUses: 0`; `spendUses.pool` names
// the resource to drain by title. Optionally rolls a die for display first.
export const spendsSharedPool = (opts: {
  id: string;
  name: string;
  cost: ActionCost;
  costNote?: string;
  // The pool ability's title to drain (e.g. "Bardic Inspiration", "Ki"). Omit
  // for an at-will feature with no pool of its own (Halo of Spores, Song of
  // Rest, Deflect Missiles).
  pool?: string;
  // Uses to spend (default 1). `"choose"` offers a free-typed amount instead,
  // capped at the pool's remaining uses (e.g. Twinned Spell costs the spell's
  // level, which the sheet can't know).
  amount?: number | "choose";
  roll?: { label: string; count?: number; die: DieDefinition };
  note: string;
  // The condition this use puts on a chosen target (see `AbilityAction`).
  applies?: AbilityAction["applies"];
}): FeatureMechanics => ({
  actions: [
    {
      id: opts.id,
      name: opts.name,
      cost: opts.cost,
      ...(opts.costNote ? { costNote: opts.costNote } : {}),
      ...(opts.applies ? { applies: opts.applies } : {}),
      ...(opts.amount === "choose"
        ? { choose: { amount: "uses" as const } }
        : {}),
      effects: [
        ...(opts.pool
          ? [
              {
                effect: "spendUses" as const,
                amount:
                  opts.amount === "choose"
                    ? { chosenAmount: true as const }
                    : { fixed: opts.amount ?? 1 },
                pool: opts.pool,
              },
            ]
          : []),
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
        { effect: "remind" as const, note: opts.note },
      ],
    },
  ],
});

// An at-will feature that costs no resource and just rolls its die: Halo of
// Spores, Song of Rest, Deflect Missiles.
export const atWillAction = (opts: {
  id: string;
  name: string;
  cost: ActionCost;
  costNote?: string;
  roll?: { label: string; count?: number; die: DieDefinition };
  note: string;
}): FeatureMechanics => spendsSharedPool(opts);

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

  // Durable: hit-die healing floors at twice the CON modifier, minimum 2.
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
  // RAW is proficient checks only; the sheet applies it to every check.
  "reliable talent": {
    riders: [
      { appliesTo: ["check"], rider: { rider: "minimumDie", value: 10 } },
    ],
  },

  // Great Weapon Fighting: reroll 1s and 2s on damage dice once. Requires the
  // two-handed tag (`buildAttackFromPreset` only tags versatile weapons' 2H variant).
  "great weapon fighting": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "rerollBelow",
          threshold: 2,
          requires: { tags: ["melee", "two-handed"] },
        },
      },
    ],
  },

  // Archery style: +2 to attack rolls with ranged weapons. A thrown melee
  // weapon is tagged `melee`+`thrown`, so `ranged` correctly excludes it.
  archery: {
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "bonus",
          value: 2,
          note: "ranged weapons only",
          requires: { tags: ["ranged"] },
        },
      },
    ],
  },

  // Dueling style: +2 damage with a one-handed melee weapon, no other weapon
  // held (the latter isn't sheet-visible, hence `optional`).
  dueling: {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: 2,
          declareAt: "on-hit",
          optional: true,
          note: "one-handed melee weapon, no other weapon held",
          requires: { tags: ["melee"], without: ["two-handed"] },
        },
      },
    ],
  },

  // Foe Slayer (ranger 20): once per turn, add WIS mod to either the attack
  // or the damage roll against a favored enemy — "not both" is noted, not enforced.
  "foe slayer": {
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "bonus",
          value: StatKey.wis,
          optional: true,
          note: "against a favored enemy, once per turn — or add it to the damage instead",
        },
      },
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: StatKey.wis,
          declareAt: "on-hit",
          optional: true,
          oncePerTurn: true,
          note: "Against a favored enemy. Add to the attack roll or the damage roll — not both.",
        },
      },
    ],
  },

  // Eldritch invocations: only the three with arithmetic are here — the rest
  // grant at-will spells or movement with nothing for the engine to add.

  // Agonizing Blast: +CHA to Eldritch Blast's damage. Opt-in because it
  // applies to one specific cantrip, and `spellDamage` scopes by
  // cantrip-vs-leveled rather than by which spell was cast.
  "agonizing blast": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: StatKey.cha,
          scope: "cantrip",
          optional: true,
          note: "Eldritch Blast only — add to each beam that hits.",
        },
      },
    ],
  },

  // Lifedrinker: +CHA necrotic on a pact weapon hit.
  lifedrinker: {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: StatKey.cha,
          damageType: DamageType.Necrotic,
          declareAt: "on-hit",
          optional: true,
          note: "On a hit with your pact weapon.",
        },
      },
    ],
  },

  // Eldritch Smite: the warlock's Divine Smite — expend a slot on a pact
  // weapon hit for 1d8 force per slot level, plus 1d8. Pact Magic tops out at
  // 5th level, so the ceiling is 6d8 rather than the paladin's 5d8.
  "eldritch smite": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "extraDamage",
          amount: [2, StandardDie.d8, DieOperation.roll], // placeholder before a slot is picked
          damageType: DamageType.Force,
          declareAt: "on-hit",
          optional: true,
          note: "On a hit with your pact weapon. Expends a warlock spell slot, and knocks a Huge or smaller target prone.",
          // No save and no duration — prone until it stands, so no rounds.
          applies: { name: "Prone", note: "if the target is Huge or smaller" },
          requires: { tags: ["melee"] },
          slot: { minLevel: 1, die: StandardDie.d8, diceAtMin: 2, maxDice: 6 },
        },
      },
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

  // Spell-damage riders (`spellDamage` kind). `appliesTo` is convention only —
  // the `spellDamageRiders` collector keys off the rider kind instead.

  // Potent Spellcasting (cleric domains without Divine Strike, druid Land 14):
  // +WIS to the damage of any cantrip. Unconditional, so auto-applied.
  "potent spellcasting": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: { rider: "spellDamage", value: StatKey.wis, scope: "cantrip" },
      },
    ],
  },

  // Empowered Evocation (wizard 10): +INT to one damage roll of a wizard
  // evocation spell. The sheet can't see a spell's school, so it opts in.
  "empowered evocation": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: StatKey.int,
          scope: "any",
          optional: true,
          note: "A wizard evocation spell.",
        },
      },
    ],
  },

  // Radiant Soul (Celestial warlock 6): once per turn, +CHA to one spell that
  // deals radiant or fire damage. Type + once-per-turn are the player's to
  // confirm, so it opts in.
  "radiant soul": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: StatKey.cha,
          scope: "any",
          optional: true,
          note: "Once per turn, to a spell that deals radiant or fire damage.",
        },
      },
    ],
  },

  // Elemental Affinity (draconic sorcerer 6): +CHA to one damage roll of a spell
  // that deals your draconic type. The type is the player's to confirm.
  "elemental affinity": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: StatKey.cha,
          scope: "any",
          optional: true,
          note: "To a spell that deals your draconic ancestry's damage type.",
        },
      },
    ],
  },

  // Alchemical Savant (artificer 5): +INT to one roll of a spell cast with
  // alchemist's supplies that deals acid/fire/necrotic/poison. Only the
  // damage half is modelled; the healing half the sheet can't scope.
  "alchemical savant": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: StatKey.int,
          scope: "any",
          optional: true,
          note: "Cast with alchemist's supplies, dealing acid, fire, necrotic, or poison damage.",
        },
      },
    ],
  },

  // Arcane Firearm (artillerist 5): +1d8 to one damage roll of an artificer
  // spell channelled through the firearm.
  "arcane firearm": {
    riders: [
      {
        appliesTo: ["damage"],
        rider: {
          rider: "spellDamage",
          value: [1, StandardDie.d8, DieOperation.roll],
          scope: "any",
          optional: true,
          note: "An artificer spell channelled through your Arcane Firearm.",
        },
      },
    ],
  },

  // Reckless Attack (barbarian 2): advisory — grants attackers advantage
  // against you in return, so it must be a player choice, not auto-applied.
  "reckless attack": {
    riders: [
      {
        appliesTo: ["attack"],
        rider: {
          rider: "advantage",
          note: "Advantage on melee Strength attacks this turn — but attack rolls against you have advantage until your next turn.",
          requires: { tags: ["melee"], ability: [StatKey.str] },
        },
      },
    ],
  },

  // Danger Sense (barbarian 2): advantage on Dexterity saves against effects
  // you can see (traps, spells). Advisory — the dialog can't tell which save.
  "danger sense": {
    riders: [
      {
        appliesTo: ["save"],
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

  // Action Surge (fighter): free, grants an extra action this turn.
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
  // condition. The advantage is advisory — applies only while raging, which
  // the roll dialog can't see.
  rage: {
    riders: [
      {
        appliesTo: ["check", "save"],
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
  // pool overrides it with a level-scaled die roll (d6→d12), see class-pools.ts.
  "bardic inspiration": {
    actions: [
      spendRollRemind({
        id: "bardic-inspiration",
        name: "Inspire",
        cost: "bonusAction",
        note: "Give one creature other than you within 60 ft. an inspiration die to add to one d20 roll in the next 10 minutes.",
        applies: { name: "Bardic Inspiration", rounds: 100 },
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
        applies: {
          name: "Stunned",
          rounds: 1,
          note: "on a failed CON save against your ki save DC",
        },
      }),
    ],
  },

  // Arcane Recovery (wizard) / Natural Recovery (land druid): once per day on
  // a short rest. Fidelity gap: RAW allows several slots with combined levels
  // up to half class level; the sheet restores one slot per use (≤ 5th).
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

  // Hexblade's Curse: the mark rides the condition system — its `against`
  // riders in CONDITION_MECHANICS pay only the curser the +PB damage and
  // widened crit range.
  "hexblade's curse": {
    actions: [
      spendRollRemind({
        id: "hexblade-curse",
        name: "Curse a target",
        cost: "bonusAction",
        note: "Curse one creature within 30 ft. for 1 minute: +PB to damage against it, crits on 19–20, and regain CHA mod + warlock level HP if it dies.",
        applies: { name: "Hexblade's Curse", rounds: 10 },
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

  // Cleansing Touch (paladin 14): CHA-mod uses per long rest.
  "cleansing touch": {
    actions: [
      spendRollRemind({
        id: "cleansing-touch",
        name: "Cleansing Touch",
        cost: "action",
        note: "End one spell on yourself or on a willing creature you touch.",
      }),
    ],
  },

  // Psionic Energy (Psi Warrior fighter 3): a pool of Psionic Energy dice.
  "psionic energy": {
    actions: [
      spendRollRemind({
        id: "psionic-energy",
        name: "Psionic Energy",
        cost: "special",
        costNote: "the feature you spend the die on sets the action cost",
        note: "Spend a Psionic Energy die on Protective Field (reaction, reduce damage), Psionic Strike (extra force damage once per turn), or Telekinetic Movement.",
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
  // overrides it with dice scaled to character level, see class-pools.ts.
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
  // static entry grants the base 5; the builder-granted pool scales it
  // (10 at samurai 10, 15 at 15), see class-pools.ts.
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

  // Combat Superiority (battle master fighter): this static entry pins d8;
  // the builder-granted pool scales the die (d10 at 10, d12 at 18), see
  // class-pools.ts. Martial Adept's d6 pool is keyed separately below.
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
        appliesTo: ["check", "attack", "save"],
        rider: { rider: "rerollBelow", threshold: 1 },
      },
      {
        appliesTo: ["save"],
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
        appliesTo: ["save"],
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
        appliesTo: ["save"],
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
        appliesTo: ["save"],
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

// Divine Strike's damage type, by cleric domain. `type: null` means untyped
// from the sheet's point of view: War matches the weapon's own type, Nature
// is the player's per-attack choice.
//
// Domains absent from this map get Potent Spellcasting at 8th instead of
// Divine Strike (Knowledge, Light, Grave, Peace, Arcana). Only Life is SRD;
// the rest are mechanical facts with original wording.
const DIVINE_STRIKE_TYPES: Record<
  string,
  { type: DamageType | null; note?: string }
> = {
  Life: { type: DamageType.Radiant },
  Death: { type: DamageType.Necrotic },
  Forge: { type: DamageType.Fire },
  Order: { type: DamageType.Psychic },
  Tempest: { type: DamageType.Thunder },
  Trickery: { type: DamageType.Poison },
  Twilight: { type: DamageType.Radiant },
  War: {
    type: null,
    note: "On a weapon hit — the extra damage is the weapon's own type.",
  },
  Nature: {
    type: null,
    note: "On a weapon hit — choose cold, fire, or lightning for each attack.",
  },
};

// Level-scaled `extraDamage` riders derived from the character's class levels.
// These can't live in the static title-keyed map: die count scales with class
// level, and the engine's die count is a literal a formula can't drive, so it
// must be baked from an integer level at roll time (no storage on the
// character). `extraDamageRiders` in `riders.ts` merges these with any
// authored `extraDamage` riders.
export function classDamageRiders(character: Character): ActiveRider[] {
  const out: ActiveRider[] = [];
  const levelOf = (name: OfficialClass) =>
    character.class.find((k) => k.name === name)?.level ?? 0;
  const d6 = (count: number): CustomFormula => [
    count,
    StandardDie.d6,
    DieOperation.roll,
  ];

  // Sneak Attack (rogue): ceil(level/2) d6 of the weapon's damage type, once
  // per turn. Opt-in because advantage/adjacent-ally isn't visible to the
  // sheet; `requires` only hides it on a weapon that could never qualify.
  const rogue = levelOf(OfficialClass.Rogue);
  if (rogue > 0)
    out.push({
      source: "Sneak Attack",
      rider: {
        rider: "extraDamage",
        amount: d6(Math.ceil(rogue / 2)),
        declareAt: "on-hit",
        optional: true,
        oncePerTurn: true,
        note: "Finesse or ranged weapon, with advantage on the attack or an ally within 5 ft of the target (and not disadvantage).",
        requires: { anyTags: ["finesse", "ranged"] },
      },
    });

  // Rage damage (barbarian): +2/+3/+4 by level. Whether you're raging is a
  // spent resource, not visible sheet state, so it stays `optional`.
  const barb = levelOf(OfficialClass.Barbarian);
  if (barb > 0)
    out.push({
      source: "Rage",
      rider: {
        rider: "extraDamage",
        amount: barb >= 16 ? 4 : barb >= 9 ? 3 : 2,
        declareAt: "on-hit",
        optional: true,
        note: "While raging.",
        // A handaxe is tagged melee+thrown (it *can* be thrown); the opt-in
        // tick is what settles which use this swing was.
        requires: { tags: ["melee"], ability: [StatKey.str] },
      },
    });

  // Divine Smite (paladin 2+): expend a spell slot on a melee weapon hit for
  // 2d8 radiant, +1d8 per slot level above 1st (max 5d8), +1d8 vs undead or
  // fiends.
  const paladin = levelOf(OfficialClass.Paladin);
  if (paladin >= 2)
    out.push({
      source: "Divine Smite",
      rider: {
        rider: "extraDamage",
        amount: [2, StandardDie.d8, DieOperation.roll], // placeholder before a slot is chosen
        damageType: DamageType.Radiant,
        declareAt: "on-hit",
        optional: true,
        note: "On a melee weapon hit. Expends a spell slot.",
        requires: { tags: ["melee"] },
        slot: {
          minLevel: 1,
          die: StandardDie.d8,
          diceAtMin: 2,
          maxDice: 5,
          bonus: { dice: 1, label: "Target is an undead or fiend (+1d8)" },
        },
      },
    });

  // Improved Divine Smite (paladin 11+): every melee weapon hit carries an
  // extra 1d8 radiant automatically, with no slot and no once-per-turn limit.
  if (paladin >= 11)
    out.push({
      source: "Improved Divine Smite",
      rider: {
        rider: "extraDamage",
        amount: [1, StandardDie.d8, DieOperation.roll],
        damageType: DamageType.Radiant,
        declareAt: "on-hit",
        note: "On every melee weapon hit.",
        requires: { tags: ["melee"] },
      },
    });

  // Divine Strike (cleric 8+): once per turn, a weapon hit deals an extra 1d8
  // (2d8 at 14th) of the domain's damage type — see DIVINE_STRIKE_TYPES.
  const cleric = levelOf(OfficialClass.Cleric);
  const domain = character.class.find(
    (k) => k.name === OfficialClass.Cleric,
  )?.subclass;
  const strike = domain ? DIVINE_STRIKE_TYPES[domain] : undefined;
  if (cleric >= 8 && strike)
    out.push({
      source: "Divine Strike",
      rider: {
        rider: "extraDamage",
        amount: [cleric >= 14 ? 2 : 1, StandardDie.d8, DieOperation.roll],
        // `null` (War/Nature) means untyped, i.e. omit `damageType`.
        ...(strike.type ? { damageType: strike.type } : {}),
        declareAt: "on-hit",
        oncePerTurn: true,
        note: strike.note ?? "On a weapon hit.",
      },
    });

  // Ranger archetype strikes: all three scale on ranger level at 11th and are
  // subclass-gated, so they can't live in the static title-keyed map.
  const ranger = levelOf(OfficialClass.Ranger);
  const conclave = character.class.find(
    (k) => k.name === OfficialClass.Ranger,
  )?.subclass;
  const strikeOf = conclave ? RANGER_ARCHETYPE_STRIKES[conclave] : undefined;
  if (ranger >= 3 && strikeOf) {
    const stepped = ranger >= 11;
    out.push({
      source: strikeOf.source,
      rider: {
        rider: "extraDamage",
        amount: [
          stepped ? (strikeOf.at11.dice ?? 1) : 1,
          stepped ? (strikeOf.at11.die ?? strikeOf.die) : strikeOf.die,
          DieOperation.roll,
        ],
        damageType: strikeOf.type,
        declareAt: "on-hit",
        optional: true,
        oncePerTurn: true,
        note: strikeOf.note,
      },
    });
  }

  // Psychic Blades (College of Whispers bard 3+): once per turn on a weapon
  // hit, expend a use of Bardic Inspiration for level-scaled psychic damage.
  // Costs another feature's pool, hence `uses`. Can't live in the title-keyed
  // map: the Soulknife rogue has a feature by the same name.
  const bard = levelOf(OfficialClass.Bard);
  if (
    bard >= 3 &&
    character.class.find((k) => k.name === OfficialClass.Bard)?.subclass ===
      "Whispers"
  )
    out.push({
      source: "Psychic Blades",
      rider: {
        rider: "extraDamage",
        amount: d6(bard >= 15 ? 8 : bard >= 10 ? 5 : bard >= 5 ? 3 : 2),
        damageType: DamageType.Psychic,
        declareAt: "on-hit",
        optional: true,
        oncePerTurn: true,
        note: "On a weapon hit.",
        uses: { pool: "Bardic Inspiration" },
      },
    });

  return out;
}

// The three ranger archetypes whose signature strike is level-scaled extra
// damage, starting at one die at 3rd. They step differently at 11th — two grow
// the die (1d4→1d6, 1d6→1d8), one the count (1d8→2d8) — so `at11` names
// whichever half moves.
const RANGER_ARCHETYPE_STRIKES: Record<
  string,
  {
    source: string;
    die: StandardDie;
    at11: { die?: StandardDie; dice?: number };
    type: DamageType;
    note: string;
  }
> = {
  "Fey Wanderer": {
    source: "Dreadful Strikes",
    die: StandardDie.d4,
    at11: { die: StandardDie.d6 },
    type: DamageType.Psychic,
    note: "On a hit with a weapon, once per turn per creature.",
  },
  "Horizon Walker": {
    source: "Planar Warrior",
    die: StandardDie.d8,
    at11: { dice: 2 },
    type: DamageType.Force,
    note: "Bonus action to mark the target; the attack's damage becomes force.",
  },
  Swarmkeeper: {
    source: "Gathered Swarm",
    die: StandardDie.d6,
    at11: { die: StandardDie.d8 },
    type: DamageType.Piercing,
    note: "Once per turn, on a hit — if you chose the swarm's damage option rather than moving or shoving the target.",
  },
};
