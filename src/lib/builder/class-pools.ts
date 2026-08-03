import {
  DamageType,
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  RestType,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  atWillAction,
  normalizeTitle,
  spendOneUse,
  spendRollRemind,
  spendsSharedPool,
  SUPERIORITY,
} from "src/lib/mechanics/catalog";
import {
  ActionCost,
  FeatureMechanics,
  RollKind,
} from "src/lib/mechanics/types";
import { SUBCLASS_ACTION_HOSTS } from "src/lib/builder/subclass-action-hosts";
import { saveDcFormula } from "src/lib/rules";
import {
  Character,
  CustomFormula,
  IClass,
  LimitedUseAbility,
  SaveEffect,
} from "src/lib/types";

// The limited-use pools each class's features carry, so the builder and the
// level-up wizard grant real, mechanics-backed pools (titles match the
// mechanics catalog, which lights up their actions) instead of prose-only
// features. `sync` semantics: pools are created when the class reaches the
// feature's level and their size/recharge is re-derived on every level-up —
// the table is authoritative for these class pools, so a hand-edited maximum
// on one of them is overwritten the next time that class levels. (Homebrew
// pools with other titles are never touched.)
//
// Numbers are the 2014 SRD progressions; summaries are original paraphrases.

export interface ClassPoolDef {
  title: string;
  detail: string;
  // Class level at which the pool appears.
  level: number;
  recharge: (level: number) => RestType;
  maxUses: (klass: IClass) => CustomFormula;
  // Level-computed mechanics attached to the granted pool. Needed for anything
  // that scales with level (a growing die, a growing amount), which the static
  // title-keyed catalog can't see — `mechanicsForAbility` prefers the pool's
  // own `mechanics`, so this wins over the catalog and is re-derived on every
  // level-up alongside `maxUses`.
  mechanics?: (klass: IClass) => FeatureMechanics;
  // The DC targets roll against for features this pool fuels (a monk's Ki save
  // DC, a Battle Master's maneuver DC). A formula, so it tracks PB and ability
  // changes; re-derived on level-up like `maxUses`.
  save?: SaveEffect;
  // Only granted to a character carrying this feature title — the Tasha's
  // optional features, whose pools belong to a class level the player may have
  // spent on the 2014 feature instead. Everything else in the table is granted
  // by the level alone.
  requiresFeature?: string;
}

// The value from a step table at a given level: the last entry whose threshold
// the level has reached. Works for die sizes (Bardic Inspiration, Superiority)
// and plain counts (Breath Weapon's dice) alike.
const atLevel = <T>(level: number, steps: [number, T][]): T => {
  let value = steps[0][1];
  for (const [at, v] of steps) if (level >= at) value = v;
  return value;
};

const short = () => RestType.shortRest;
const long = () => RestType.longRest;

// A die-roll expression as a formula (`count`d`die`), for riders/mechanics that
// bake a die size from the character's level (Giant's Might's extra damage).
const dieRoll = (count: number, die: StandardDie): CustomFormula => [
  count,
  die,
  DieOperation.roll,
];

// The Bardic Inspiration die by bard level (d6 → d8 → d10 → d12). Exported so
// the subclass features that *spend* a Bardic Inspiration die (Cutting Words,
// Combat Inspiration, …) roll the same size the pool grants.
export const bardicInspirationDie = (level: number): StandardDie =>
  atLevel(level, [
    [1, StandardDie.d6],
    [5, StandardDie.d8],
    [10, StandardDie.d10],
    [15, StandardDie.d12],
  ]);

// A bard-subclass action host that spends one Bardic Inspiration die, rolling
// the current die for display. Every College feature that drains the shared
// pool has this exact shape, so they share one builder.
const bardicSpender = (opts: {
  title: string;
  detail: string;
  level: number;
  cost: ActionCost;
  costNote?: string;
  note: string;
  // The condition this use puts on a chosen target (see `AbilityAction`).
  applies?: { name: string; rounds?: number; note?: string };
}): ClassPoolDef => ({
  title: opts.title,
  detail: opts.detail,
  level: opts.level,
  recharge: long,
  maxUses: () => 0,
  mechanics: (k) =>
    spendsSharedPool({
      id: slugId(opts.title),
      name: opts.title,
      cost: opts.cost,
      ...(opts.costNote ? { costNote: opts.costNote } : {}),
      pool: "Bardic Inspiration",
      roll: {
        label: "Bardic Inspiration die",
        die: bardicInspirationDie(k.level),
      },
      note: opts.note,
      ...(opts.applies ? { applies: opts.applies } : {}),
    }),
});

const slugId = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const classLevel = (klass: IClass): CustomFormula => ({
  classLevel: klass.id,
});
const atLeastOne = (formula: CustomFormula): CustomFormula => ({
  operation: Operation.maximum,
  operands: [1, formula],
});

// Mystic Arcanum (warlock 11/13/15/17): a single free casting of one known
// spell of levels 6–9, each recovered on a long rest — distinct from Pact
// Magic slots, so each is its own one-use pool with a cast reminder.
function mysticArcanumPools(): ClassPoolDef[] {
  const ordinals: Record<number, string> = {
    6: "6th",
    7: "7th",
    8: "8th",
    9: "9th",
  };
  return [
    [6, 11],
    [7, 13],
    [8, 15],
    [9, 17],
  ].map(([spellLevel, classLevel]) => ({
    title: `Mystic Arcanum (${ordinals[spellLevel]} Level)`,
    detail: `Once per long rest, cast one ${ordinals[spellLevel]}-level warlock spell you've chosen as a Mystic Arcanum without expending a spell slot.`,
    level: classLevel,
    recharge: long,
    maxUses: () => 1,
    mechanics: () => ({
      actions: [
        {
          id: `mystic-arcanum-${spellLevel}`,
          name: "Cast",
          cost: "action",
          effects: [
            { effect: "spendUses", amount: { fixed: 1 } },
            {
              effect: "remind",
              note: `Cast your chosen ${ordinals[spellLevel]}-level Mystic Arcanum spell without a slot.`,
            },
          ],
        },
      ],
    }),
  }));
}

export const CLASS_POOLS: Partial<Record<OfficialClass, ClassPoolDef[]>> = {
  [OfficialClass.Barbarian]: [
    {
      title: "Rage",
      detail:
        "Enter a battle fury as a bonus action: bonus melee damage with STR weapons, resistance to bludgeoning/piercing/slashing, advantage on STR checks and saves.",
      level: 1,
      recharge: long,
      // 2 → 3 (3rd) → 4 (6th) → 5 (12th) → 6 (17th); unlimited at 20 isn't
      // representable as a pool, so it stays 6.
      maxUses: (k) =>
        k.level >= 17
          ? 6
          : k.level >= 12
            ? 5
            : k.level >= 6
              ? 4
              : k.level >= 3
                ? 3
                : 2,
    },
  ],
  [OfficialClass.Bard]: [
    {
      title: "Bardic Inspiration",
      detail:
        "As a bonus action, give a creature other than you within 60 ft. an inspiration die to add to one d20 roll within 10 minutes.",
      level: 1,
      // Font of Inspiration (5th) moves the refresh to short rests.
      recharge: (level) =>
        level >= 5 ? RestType.shortRest : RestType.longRest,
      maxUses: () => atLeastOne(StatKey.cha),
      // The die grows d6 → d8 (5th) → d10 (10th) → d12 (15th).
      mechanics: (k) => ({
        actions: [
          spendRollRemind({
            id: "bardic-inspiration",
            name: "Inspire",
            cost: "bonusAction",
            roll: {
              label: "Bardic Inspiration die",
              die: bardicInspirationDie(k.level),
            },
            note: "Give one creature other than you within 60 ft. the die to add to one d20 roll in the next 10 minutes.",
            applies: { name: "Bardic Inspiration", rounds: 100 },
          }),
        ],
      }),
    },
    // Song of Rest owns no resource and drains none — it's an at-will die that
    // happens to scale. `maxUses: 0` renders it as its action alone (see the
    // action-host pattern), which is the only reason it can live here at all.
    {
      title: "Song of Rest",
      detail:
        "Allies who hear you perform during a short rest regain extra hit points.",
      level: 2,
      recharge: short,
      maxUses: () => 0,
      // d6 → d8 (9th) → d10 (13th) → d12 (17th).
      mechanics: (k) =>
        atWillAction({
          id: "song-of-rest",
          name: "Perform",
          cost: "special",
          costNote: "during a short rest",
          roll: {
            label: "Song of Rest die",
            die: atLevel(k.level, [
              [2, StandardDie.d6],
              [9, StandardDie.d8],
              [13, StandardDie.d10],
              [17, StandardDie.d12],
            ]),
          },
          note: "Each ally who hears the performance and spends at least one hit die to regain HP recovers this much extra.",
        }),
    },
  ],
  [OfficialClass.Cleric]: [
    {
      title: "Channel Divinity",
      detail:
        "Channel divine energy to fuel Turn Undead or your domain's option.",
      level: 2,
      recharge: short,
      maxUses: (k) => (k.level >= 18 ? 3 : k.level >= 6 ? 2 : 1),
    },
    {
      title: "Divine Intervention",
      detail:
        "Implore your deity to intervene: succeed on a d100 roll at or under your cleric level (automatic at 20th).",
      level: 10,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  [OfficialClass.Druid]: [
    {
      title: "Wild Shape",
      detail:
        "Transform into a beast you've seen; max CR and movement limits scale with druid level.",
      level: 2,
      recharge: short,
      maxUses: () => 2,
    },
  ],
  [OfficialClass.Fighter]: [
    {
      title: "Second Wind",
      detail: "As a bonus action, regain 1d10 + fighter level hit points.",
      level: 1,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Action Surge",
      detail: "Take one additional action on your turn.",
      level: 2,
      recharge: short,
      maxUses: (k) => (k.level >= 17 ? 2 : 1),
    },
    {
      title: "Indomitable",
      detail: "Reroll a failed saving throw; you must use the new roll.",
      level: 9,
      recharge: long,
      maxUses: (k) => (k.level >= 17 ? 3 : k.level >= 13 ? 2 : 1),
    },
  ],
  [OfficialClass.Monk]: [
    {
      title: "Ki",
      detail:
        "Points fueling Flurry of Blows, Patient Defense, Step of the Wind, and higher monk features.",
      level: 2,
      recharge: short,
      maxUses: classLevel,
      // Ki save DC = 8 + PB + WIS. No fixed ability: the DC is one number, but
      // each ki feature names its own save (Stunning Strike is CON).
      save: {
        dc: saveDcFormula(StatKey.wis),
        note: "Ki save DC. Stunning Strike calls for a CON save.",
      },
    },
    // Deflect Missiles: the reaction itself is free (spending 1 ki to throw the
    // missile back is a separate choice the prompt names), so it's an at-will
    // host rather than a Ki spender.
    {
      title: "Deflect Missiles",
      detail:
        "As a reaction, reduce the damage of a ranged weapon attack that hits you.",
      level: 3,
      recharge: short,
      maxUses: () => 0,
      mechanics: (k) => ({
        actions: [
          {
            id: "deflect-missiles",
            name: "Deflect",
            cost: "reaction",
            effects: [
              {
                effect: "roll",
                label: "Damage reduction",
                amount: {
                  fixed: {
                    operation: Operation.addition,
                    operands: [
                      [1, StandardDie.d10, DieOperation.roll],
                      StatKey.dex,
                      k.level,
                    ],
                  },
                },
              },
              {
                effect: "remind",
                note: "Reduce the damage by this much. If it drops to 0 you can catch the missile, and may spend 1 ki to throw it back as a ranged attack (20/60) with a monk weapon's damage die.",
              },
            ],
          },
        ],
      }),
    },
  ],
  [OfficialClass.Paladin]: [
    {
      title: "Divine Sense",
      detail:
        "As an action, sense celestials, fiends, and undead within 60 ft. until the end of your next turn.",
      level: 1,
      recharge: long,
      maxUses: () => ({
        operation: Operation.maximum,
        operands: [
          1,
          { operation: Operation.addition, operands: [1, StatKey.cha] },
        ],
      }),
    },
    {
      title: "Lay on Hands",
      detail:
        "A pool of healing points: as an action, restore hit points from the pool (or spend 5 to cure a disease or poison).",
      level: 1,
      recharge: long,
      maxUses: (k) => ({
        operation: Operation.multiplication,
        operands: [5, classLevel(k)],
      }),
    },
    {
      title: "Channel Divinity",
      detail: "Channel divine energy to fuel your oath's options.",
      level: 3,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Cleansing Touch",
      detail:
        "As an action, end one spell on yourself or on a willing creature you touch.",
      level: 14,
      recharge: long,
      maxUses: () => ({
        operation: Operation.maximum,
        operands: [1, StatKey.cha],
      }),
    },
  ],
  // Every ranger pool is a Tasha's optional feature: the 2014 ranger has no
  // limited-use resource at all, which is half of why these swaps exist.
  [OfficialClass.Ranger]: [
    {
      title: "Favored Foe",
      detail:
        "Mark a creature you hit as your favored foe for 1 minute, while you keep concentration.",
      level: 1,
      recharge: long,
      maxUses: () => PB,
      requiresFeature: "Favored Foe",
      // The die grows 1d4 → 1d6 (6th) → 1d8 (14th). Its damage lands on a hit,
      // so it rides the attack's damage roll. The *spend* belongs to the mark,
      // not the damage: the "Mark a foe" action takes the use and puts the
      // condition on the target (which is what carries the mark to the table),
      // and the rider's ticks on later turns cost nothing — RAW, only marking
      // spends. The rider used to own the spend, which double-charged anyone
      // who ticked it on turn two.
      mechanics: (k) => ({
        actions: [
          {
            id: "favored-foe-mark",
            name: "Mark a foe",
            cost: "special",
            costNote: "when you hit a creature with an attack roll",
            applies: { name: "Favored Foe", rounds: 10 },
            effects: [
              spendOneUse,
              {
                effect: "remind",
                note: "The mark lasts 1 minute and needs your concentration. Your first hit against it each turn deals your Favored Foe die extra.",
              },
            ],
          },
        ],
        riders: [
          {
            appliesTo: ["damage"],
            rider: {
              rider: "extraDamage",
              amount: dieRoll(
                1,
                atLevel(k.level, [
                  [1, StandardDie.d4],
                  [6, StandardDie.d6],
                  [14, StandardDie.d8],
                ]),
              ),
              declareAt: "on-hit",
              optional: true,
              oncePerTurn: true,
              note: "The first time you hit your marked foe on each of your turns.",
            },
          },
        ],
      }),
    },
    {
      title: "Tireless",
      detail:
        "As an action, grant yourself temporary hit points equal to 1d8 + your Wisdom modifier.",
      level: 10,
      recharge: long,
      maxUses: () => PB,
      requiresFeature: "Deft Explorer",
      mechanics: () => ({
        actions: [
          {
            id: "tireless",
            name: "Tireless",
            cost: "action",
            effects: [
              spendOneUse,
              {
                effect: "gainTempHp",
                amount: {
                  fixed: {
                    operation: Operation.addition,
                    operands: [
                      [1, StandardDie.d8, DieOperation.roll],
                      StatKey.wis,
                    ],
                  },
                },
              },
            ],
          },
        ],
      }),
    },
    {
      title: "Nature's Veil",
      detail:
        "As a bonus action, become invisible — with whatever you wear and carry — until the end of your next turn.",
      level: 10,
      recharge: long,
      maxUses: () => PB,
      requiresFeature: "Nature's Veil",
      mechanics: () => ({
        actions: [
          spendRollRemind({
            id: "natures-veil",
            name: "Nature's Veil",
            cost: "bonusAction",
            note: "You are invisible until the end of your next turn.",
          }),
        ],
      }),
    },
  ],
  [OfficialClass.Rogue]: [
    {
      title: "Stroke of Luck",
      detail:
        "Once per short or long rest, turn a missed attack into a hit or a failed ability check into a natural 20.",
      level: 20,
      recharge: short,
      maxUses: () => 1,
    },
  ],
  [OfficialClass.Sorcerer]: [
    {
      title: "Sorcery Points",
      detail:
        "Points fueling Flexible Casting (trade points for spell slots and back) and metamagic.",
      level: 2,
      recharge: long,
      maxUses: classLevel,
    },
  ],
  [OfficialClass.Warlock]: mysticArcanumPools(),
  [OfficialClass.Wizard]: [
    {
      title: "Arcane Recovery",
      detail:
        "Once per day on a short rest, recover expended spell slots with combined levels up to half your wizard level (none 6th or higher).",
      level: 1,
      recharge: long,
      maxUses: () => 1,
    },
  ],
};

// Rune Knight (fighter, Tasha's). Giant's Might and Runic Shield are always
// granted at their level (PB uses per long rest); each rune is a separate
// once-per-short-rest invocation, gated by the chosen rune landing as a feature
// (`requiresFeature`) so only runes you know get a pool. Master of Runes (15th)
// grants a second invocation of each rune. The passive check advantages ride on
// each rune's pool as an advisory note — advantage is never auto-applied (see
// Rage) — so they surface as a reminder when you roll the relevant check.
function runeKnightPools(): ClassPoolDef[] {
  // One rune's once-per-rest invocation pool. `checkNote` is the passive
  // advantage reminder (omitted for a rune whose passive isn't a check
  // advantage — Fire's tool bonus); `save` appears on runes that force one.
  //
  // How the invocation is offered is a union, because it's a real fork: most
  // runes are invoked on their own (an action/reaction, so a button on the pool),
  // but a rune invoked **on a weapon hit** belongs in the attack's roll dialog as
  // an `onHit` rider that spends the use — rolling its damage in the abilities
  // panel would divorce it from the attack that caused it.
  const rune = (
    opts: {
      name: string; // e.g. "Cloud" — the pool/feature title is `${name} Rune`
      level: number; // 3, or 7 for Hill/Storm
      detail: string;
      checkNote?: string;
      // Which d20s the passive note rides — skill checks for most runes;
      // Hill's poison advantage is a save.
      checkNoteKinds?: RollKind[];
      save?: boolean;
    } & (
      | {
          cost: ActionCost;
          costNote?: string;
          note: string;
          roll?: { label: string; count?: number; die: StandardDie };
          // The condition the invoke puts on its target (Stone Rune's charm).
          applies?: { name: string; rounds?: number; note?: string };
        }
      | {
          onHit: {
            amount: CustomFormula;
            damageType: DamageType;
            note: string;
            // The condition the hit puts on the target (Fire Rune's
            // restrain) — carried by the damage rider, stamped by the dialog.
            applies?: { name: string; rounds?: number; note?: string };
          };
        }
    ),
  ): ClassPoolDef => {
    const title = `${opts.name} Rune`;
    return {
      title,
      detail: opts.detail,
      level: opts.level,
      recharge: short,
      requiresFeature: title,
      // Once between rests; Master of Runes (15th) allows a second invocation.
      maxUses: (k) => (k.level >= 15 ? 2 : 1),
      ...(opts.save
        ? {
            save: {
              dc: saveDcFormula(StatKey.con),
              note: "Rune save DC (8 + PB + CON). The save the target rolls varies by rune.",
            },
          }
        : {}),
      mechanics: () => ({
        riders: [
          ...(opts.checkNote
            ? [
                {
                  appliesTo: opts.checkNoteKinds ?? ["check" as const],
                  rider: {
                    rider: "advantage" as const,
                    note: opts.checkNote,
                  },
                },
              ]
            : []),
          ...("onHit" in opts
            ? [
                {
                  appliesTo: ["damage" as const],
                  rider: {
                    rider: "extraDamage" as const,
                    amount: opts.onHit.amount,
                    damageType: opts.onHit.damageType,
                    declareAt: "on-hit" as const,
                    optional: true,
                    note: opts.onHit.note,
                    ...(opts.onHit.applies
                      ? { applies: opts.onHit.applies }
                      : {}),
                    uses: { pool: title },
                  },
                },
              ]
            : []),
        ],
        ...("onHit" in opts
          ? {}
          : {
              actions: [
                spendRollRemind({
                  id: slugId(`invoke-${opts.name}-rune`),
                  name: `Invoke ${opts.name} Rune`,
                  cost: opts.cost,
                  ...(opts.costNote ? { costNote: opts.costNote } : {}),
                  ...(opts.roll ? { roll: opts.roll } : {}),
                  note: opts.note,
                  ...(opts.applies ? { applies: opts.applies } : {}),
                }),
              ],
            }),
      }),
    };
  };

  return [
    {
      title: "Giant's Might",
      detail:
        "As a bonus action, grow to Large size (Huge at 18th) for 1 minute: advantage on Strength checks and saves, and once per turn on a weapon hit deal extra damage (1d6, rising to 1d8 at 10th and 1d10 at 18th).",
      level: 3,
      recharge: long,
      maxUses: () => PB,
      mechanics: (k) => ({
        riders: [
          {
            appliesTo: ["check", "save"],
            rider: {
              rider: "advantage",
              note: "While enlarged: advantage on Strength checks and Strength saving throws.",
            },
          },
          {
            appliesTo: ["damage"],
            rider: {
              rider: "extraDamage",
              amount: dieRoll(
                1,
                atLevel(k.level, [
                  [3, StandardDie.d6],
                  [10, StandardDie.d8],
                  [18, StandardDie.d10],
                ]),
              ),
              declareAt: "on-hit",
              optional: true,
              oncePerTurn: true,
              note: "While enlarged by Giant's Might, once per turn on a weapon hit.",
            },
          },
        ],
        actions: [
          spendRollRemind({
            id: "giants-might",
            name: "Giant's Might",
            cost: "bonusAction",
            note: "Grow to Large size (Huge at 18th) for 1 minute.",
          }),
        ],
      }),
    },
    {
      title: "Runic Shield",
      detail:
        "As a reaction when a creature you can see within 60 ft. is hit by an attack roll, force the attacker to reroll the d20 and use the new result.",
      level: 7,
      recharge: long,
      maxUses: () => PB,
      mechanics: () => ({
        actions: [
          spendRollRemind({
            id: "runic-shield",
            name: "Runic Shield",
            cost: "reaction",
            note: "Force the triggering attacker to reroll the d20 and use the new roll.",
          }),
        ],
      }),
    },
    rune({
      name: "Cloud",
      level: 3,
      cost: "reaction",
      checkNote:
        "Advantage on Dexterity (Sleight of Hand) and Charisma (Deception) checks.",
      detail:
        "Passive: advantage on Sleight of Hand and Deception checks. Invoke as a reaction to redirect an attack that hits you or a creature within 30 ft. onto a different creature within 30 ft.",
      note: "Redirect the triggering attack onto a different creature you can see within 30 ft., using the same roll.",
    }),
    rune({
      name: "Fire",
      level: 3,
      save: true,
      detail:
        "Passive: add double your proficiency bonus to ability checks with tools you're proficient with. Invoke on a weapon hit to deal 2d6 fire and restrain the target.",
      // Invoked on a hit, so it rides the attack's damage roll rather than being
      // a button that would make you roll 2d6 apart from the swing.
      onHit: {
        amount: dieRoll(2, StandardDie.d6),
        damageType: DamageType.Fire,
        note: "On a weapon hit. The target must also succeed on a Strength saving throw (the rune DC) or be restrained for 1 minute, taking 2d6 fire at the start of each of its turns (it repeats the save at the end of its turns).",
        applies: {
          name: "Restrained",
          rounds: 10,
          note: "on a failed STR save against the rune DC; 2d6 fire at the start of its turns, repeating the save at the end of them",
        },
      },
    }),
    rune({
      name: "Frost",
      level: 3,
      cost: "bonusAction",
      checkNote:
        "Advantage on Wisdom (Animal Handling) and Charisma (Intimidation) checks.",
      detail:
        "Passive: advantage on Animal Handling and Intimidation checks. Invoke as a bonus action for a boon to Strength and Constitution rolls.",
      note: "For 10 minutes, gain a +2 bonus to ability checks and saving throws using Strength or Constitution.",
    }),
    rune({
      name: "Stone",
      level: 3,
      cost: "reaction",
      save: true,
      checkNote: "Advantage on Wisdom (Insight) checks.",
      detail:
        "Passive: advantage on Insight checks and darkvision to 120 ft. Invoke as a reaction to charm a creature within 30 ft.",
      note: "The triggering creature within 30 ft. must succeed on a Wisdom saving throw or be charmed for 1 minute (it repeats the save at the end of each of its turns, and whenever it takes damage).",
      applies: {
        name: "Charmed",
        rounds: 10,
        note: "on a failed WIS save against the rune DC; repeats the save at the end of its turns and when it takes damage",
      },
    }),
    rune({
      name: "Hill",
      level: 7,
      cost: "bonusAction",
      checkNote:
        "Advantage on saving throws against being poisoned (and resistance to poison damage).",
      checkNoteKinds: ["save"],
      detail:
        "Passive: advantage on saves against poison and resistance to poison damage. Invoke as a bonus action for resistance to physical damage.",
      note: "For 1 minute, gain resistance to bludgeoning, piercing, and slashing damage.",
    }),
    rune({
      name: "Storm",
      level: 7,
      cost: "bonusAction",
      checkNote: "Advantage on Intelligence (Arcana) checks.",
      detail:
        "Passive: advantage on Arcana checks and you can't be surprised while conscious. Invoke as a bonus action to enter a prophetic state.",
      note: "For 1 minute, once on each of your turns you can use your reaction to grant advantage or impose disadvantage on an attack roll, ability check, or saving throw within 60 ft.",
    }),
  ];
}

// Subclass pools, keyed by the subclass name stored on the class entry.
// Synced exactly like class pools (created at the feature's class level,
// size/recharge re-derived every level-up), which is what handles scaling
// pools like the battle master's superiority dice. Titles match the mechanics
// catalog so the pools arrive with their actions.
export const SUBCLASS_POOLS: Record<string, ClassPoolDef[]> = {
  // --- Wizard traditions -------------------------------------------------
  Divination: [
    {
      title: "Portent",
      detail:
        "After a long rest, roll two d20s (three at 14th level) and record them; replace any attack roll, save, or ability check you or a creature you can see makes with one of these rolls before it's made.",
      level: 2,
      recharge: long,
      maxUses: (k) => (k.level >= 14 ? 3 : 2),
    },
  ],
  Abjuration: [
    {
      title: "Arcane Ward",
      detail:
        "A magical ward with hit points equal to twice your wizard level + your Intelligence modifier. Casting an abjuration spell of 1st level or higher restores it; it absorbs damage until its hit points run out.",
      level: 2,
      recharge: long,
      maxUses: (k) =>
        atLeastOne({
          operation: Operation.addition,
          operands: [
            {
              operation: Operation.multiplication,
              operands: [2, classLevel(k)],
            },
            StatKey.int,
          ],
        }),
    },
  ],
  Bladesinging: [
    {
      title: "Bladesong",
      detail:
        "As a bonus action, enter the Bladesong for 1 minute: +INT modifier to AC, +10 ft. speed, advantage on Acrobatics, and a Constitution-save bonus for concentration.",
      level: 2,
      recharge: short,
      maxUses: () => PB,
    },
  ],
  Chronurgy: [
    {
      title: "Chronal Shift",
      detail:
        "As a reaction, force a creature within 30 ft. to reroll an attack, save, or ability check.",
      level: 2,
      recharge: long,
      maxUses: () => 2,
    },
  ],
  Graviturgy: [
    {
      title: "Violent Attraction",
      detail:
        "As a reaction when a creature you can see within 60 ft. is hit by a weapon attack or takes falling damage, add extra damage (1d10 on a hit, or 2d10 for a fall).",
      level: 10,
      recharge: long,
      maxUses: () => ({
        operation: Operation.maximum,
        operands: [1, StatKey.int],
      }),
    },
  ],
  // --- Bard colleges -----------------------------------------------------
  Creation: [
    {
      title: "Performance of Creation",
      detail:
        "As an action, create one nonmagical item you've seen (size scaling with bard level). You can also expend a spell slot to make one instead of using this feature.",
      level: 3,
      recharge: long,
      maxUses: () => 1,
    },
    {
      title: "Animating Performance",
      detail:
        "As an action, animate a Large or smaller nonmagical object as a Dancing Item for 1 hour. You can also expend a 3rd-level+ spell slot to do so.",
      level: 6,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  Glamour: [
    {
      title: "Enthralling Performance",
      detail:
        "After a 1-minute performance, charm up to your Charisma modifier of humanoids who fail a Wisdom save for 1 hour.",
      level: 3,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Mantle of Majesty",
      detail:
        "As a bonus action, cast Command without a slot each turn for 1 minute while charmed creatures obey.",
      level: 6,
      recharge: long,
      maxUses: () => 1,
    },
    {
      title: "Unbreakable Majesty",
      detail:
        "As a bonus action, assume a majestic presence for 1 minute: attackers must succeed on a Charisma save or choose a new target (and take psychic damage on a failure).",
      level: 14,
      recharge: short,
      maxUses: () => 1,
    },
  ],
  // --- Druid circles -----------------------------------------------------
  Dreams: [
    {
      title: "Balm of the Summer Court",
      detail:
        "A pool of d6s equal to your druid level. As a bonus action, spend up to half your druid level (rounded up) of them to heal a creature within 120 ft. and give it temporary hit points.",
      level: 2,
      recharge: long,
      maxUses: (k) => atLeastOne(classLevel(k)),
    },
    {
      title: "Hidden Paths",
      detail:
        "As a bonus action, teleport up to 60 ft. to an unoccupied space you can see, or teleport a willing touched creature up to 30 ft.",
      level: 10,
      recharge: long,
      maxUses: () => ({
        operation: Operation.maximum,
        operands: [1, StatKey.wis],
      }),
    },
  ],
  Shepherd: [
    {
      title: "Spirit Totem",
      detail:
        "As a bonus action, summon an incorporeal Bear, Hawk, or Unicorn spirit in a 30-ft. aura for 1 minute, granting its effect to allies within it.",
      level: 2,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Faithful Summons",
      detail:
        "When you're reduced to 0 HP or incapacitated, four spirit beasts (CR 2 or lower) appear within 20 ft. to defend you for 1 hour, no concentration.",
      level: 14,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  Stars: [
    {
      title: "Star Map",
      detail:
        "Your star map lets you cast Guiding Bolt without a slot a number of times equal to your proficiency bonus (you also always have Guidance and Guiding Bolt prepared).",
      level: 2,
      recharge: long,
      maxUses: () => PB,
    },
    {
      title: "Cosmic Omen",
      detail:
        "After a long rest, roll a die for Weal (even) or Woe (odd). As a reaction, add or subtract 1d6 on a roll by a creature within 30 ft.",
      level: 6,
      recharge: long,
      maxUses: () => PB,
    },
  ],
  Wildfire: [
    {
      title: "Cauterizing Flames",
      detail:
        "When a creature dies within 30 ft. of you or your wildfire spirit, a spectral flame appears; a creature that starts its turn there or enters the space can be dealt fire damage or healed.",
      level: 10,
      recharge: long,
      maxUses: () => PB,
    },
    {
      title: "Blazing Revival",
      detail:
        "If you drop to 0 HP with your wildfire spirit summoned, you can dismiss it to instead drop to half your hit point maximum.",
      level: 14,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  "Psi Warrior": [
    {
      title: "Psionic Energy",
      detail:
        "A pool of Psionic Energy dice (d6, becoming d8 at 5th, d10 at 11th, d12 at 17th) fueling Protective Field, Psionic Strike, and Telekinetic Movement. Regain all on a long rest, and one as a bonus action once per short rest.",
      level: 3,
      recharge: long,
      // Twice your proficiency bonus.
      maxUses: () => ({
        operation: Operation.multiplication,
        operands: [2, "proficiencyBonus"],
      }),
    },
  ],
  // Another pool-less at-will (see Song of Rest): a free reaction whose only
  // number is a die that grows with druid level.
  Spores: [
    {
      title: "Halo of Spores",
      detail:
        "As a reaction, damage a creature that comes within 10 ft. of you or starts its turn there.",
      level: 2,
      recharge: long,
      maxUses: () => 0,
      // 1d4 → 1d6 (6th) → 1d8 (10th) → 1d10 (14th).
      mechanics: (k) =>
        atWillAction({
          id: "halo-of-spores",
          name: "Halo of Spores",
          cost: "reaction",
          costNote:
            "when a creature comes within 10 ft. or starts its turn there",
          roll: {
            label: "Necrotic damage",
            die: atLevel(k.level, [
              [2, StandardDie.d4],
              [6, StandardDie.d6],
              [10, StandardDie.d8],
              [14, StandardDie.d10],
            ]),
          },
          note: "The target takes this necrotic damage unless it succeeds on a Constitution save against your spell save DC. While Symbiotic Entity is active, roll the damage twice and keep the higher.",
        }),
    },
  ],
  "Battle Master": [
    {
      title: "Superiority Dice",
      detail:
        "Dice fueling your combat maneuvers, usually spent as part of an attack.",
      level: 3,
      recharge: short,
      maxUses: (k) => (k.level >= 15 ? 6 : k.level >= 7 ? 5 : 4),
      // Maneuver save DC = 8 + PB + STR or DEX, the fighter's choice; the
      // formula takes whichever is higher. Which save the *target* rolls
      // depends on the maneuver (Trip Attack is STR, Menacing is WIS).
      save: {
        dc: saveDcFormula([StatKey.str, StatKey.dex]),
        note: "Maneuver save DC. The ability saved against varies by maneuver.",
      },
      // The die grows d8 → d10 (10th) → d12 (18th).
      mechanics: (k) =>
        SUPERIORITY(
          atLevel(k.level, [
            [3, StandardDie.d8],
            [10, StandardDie.d10],
            [18, StandardDie.d12],
          ]),
        ),
    },
  ],
  Samurai: [
    {
      title: "Fighting Spirit",
      detail:
        "As a bonus action, gain temporary hit points and advantage on weapon attacks until the end of the turn.",
      level: 3,
      recharge: long,
      maxUses: () => 3,
      // The temp HP grows 5 → 10 (10th) → 15 (15th).
      mechanics: (k) => ({
        actions: [
          {
            id: "fighting-spirit",
            name: "Fighting Spirit",
            cost: "bonusAction",
            effects: [
              { effect: "spendUses", amount: { fixed: 1 } },
              {
                effect: "gainTempHp",
                amount: { fixed: k.level >= 15 ? 15 : k.level >= 10 ? 10 : 5 },
              },
              {
                effect: "remind",
                note: "Advantage on all weapon attack rolls until the end of this turn.",
              },
            ],
          },
        ],
      }),
    },
  ],
  "Rune Knight": runeKnightPools(),
  Land: [
    {
      title: "Natural Recovery",
      detail:
        "Once per day on a short rest, recover expended spell slots with combined levels up to half your druid level (none 6th or higher).",
      level: 2,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  // College of Lore's Cutting Words is the worked example of a cross-pool
  // spender: it owns no charges (maxUses 0 → an action-only host), and its
  // reaction drains the shared Bardic Inspiration pool by title.
  Lore: [
    bardicSpender({
      title: "Cutting Words",
      detail:
        "As a reaction when a creature within 60 ft. makes an attack roll, ability check, or damage roll, expend a Bardic Inspiration die and subtract it from the roll.",
      level: 3,
      cost: "reaction",
      note: "Subtract the roll from the triggering creature's attack roll, ability check, or damage roll.",
    }),
    bardicSpender({
      title: "Peerless Skill",
      detail:
        "When you make an ability check, expend a Bardic Inspiration die and add it to the roll (you may wait until after you roll).",
      level: 14,
      cost: "special",
      costNote: "as part of an ability check",
      note: "Add the roll to your ability check.",
    }),
  ],
  Eloquence: [
    bardicSpender({
      title: "Unsettling Words",
      detail:
        "As a bonus action, expend a Bardic Inspiration die and subtract it from the next saving throw a creature within 60 ft. makes before your next turn.",
      level: 3,
      cost: "bonusAction",
      note: "Subtract the roll from the target's next saving throw before your next turn.",
      applies: { name: "Unsettling Words", rounds: 1 },
    }),
    {
      title: "Universal Speech",
      detail:
        "As an action, make up to your Charisma modifier of creatures within 60 ft. able to understand you for 1 hour. You can also expend a spell slot instead of a use.",
      level: 6,
      recharge: long,
      maxUses: () => 1,
    },
    {
      title: "Infectious Inspiration",
      detail:
        "As a reaction when a creature within 60 ft. succeeds on a roll using your Bardic Inspiration (or that you can inspire), give another creature a Bardic Inspiration die without expending one.",
      level: 14,
      recharge: long,
      maxUses: () => ({
        operation: Operation.maximum,
        operands: [1, StatKey.cha],
      }),
    },
  ],
  Spirits: [
    bardicSpender({
      title: "Tales from Beyond",
      detail:
        "While holding your Spiritual Focus, expend a Bardic Inspiration die and roll it on the Spirit Tales table; you keep the tale until you bestow its effect or finish a rest.",
      level: 3,
      cost: "bonusAction",
      note: "Roll on the Spirit Tales table for the effect you retain.",
    }),
    {
      title: "Spirit Session",
      detail:
        "Over a 1-hour ritual with your focus, learn one divination or necromancy spell (up to a level you can cast) until your next long rest; it counts as a bard spell for you.",
      level: 6,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  Whispers: [
    // Psychic Blades is *not* a pool here: it owns no charges, spends someone
    // else's, and lands on a weapon hit — so it's an `extraDamage` rider in
    // `classDamageRiders` (gated on bard + Whispers, like Divine Strike on a
    // domain) plus an ordinary prose row, rather than a charge-less host whose
    // only content was a button rolling damage away from the attack.
    {
      title: "Words of Terror",
      detail:
        "After a 1-minute conversation, a humanoid that fails a Wisdom save is frightened of you (or of someone you name) for 1 hour, or 24 hours if it thinks the threat is real.",
      level: 3,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Mantle of Whispers",
      detail:
        "As a reaction when a humanoid dies within 30 ft., capture its shadow to disguise yourself as it (with surface memories) for 1 hour.",
      level: 6,
      recharge: short,
      maxUses: () => 1,
    },
    {
      title: "Shadow Lore",
      detail:
        "As an action, whisper a shadowy secret; a creature within 30 ft. that fails a Wisdom save obeys your commands for 8 hours as if charmed.",
      level: 14,
      recharge: long,
      maxUses: () => 1,
    },
  ],
  Hexblade: [
    {
      title: "Hexblade's Curse",
      detail:
        "As a bonus action, curse a creature within 30 ft. for 1 minute: +PB damage on your attacks against it, crits on 19–20, and regain CHA mod + warlock level HP when it dies.",
      level: 1,
      recharge: short,
      maxUses: () => 1,
    },
  ],
  Celestial: [
    {
      title: "Healing Light",
      detail:
        "A pool of d6s: as a bonus action, spend dice to heal a creature within 60 ft. by the rolled total.",
      level: 1,
      recharge: long,
      maxUses: (k) => ({
        operation: Operation.addition,
        operands: [1, classLevel(k)],
      }),
    },
  ],
};

// Racial pools, keyed by the trait title the race data grants. The use count
// and recharge are created once at build (no re-derive), but `mechanics` is a
// function of *total character level* — racial features scale on character
// level, not a class level — and is re-derived on level-up so scaling dice
// stay current. Only structural scaling (dice count/size) needs this; a `+CON`
// modifier stays a formula resolved against the character at roll time.
export const RACE_POOLS: Record<
  string,
  {
    detail: string;
    recharge: RestType;
    maxUses: CustomFormula;
    // Total character level the pool first appears at (an aasimar subrace's
    // 3rd-level transformation). Omitted means level 1.
    minLevel?: number;
    mechanics?: (totalLevel: number) => FeatureMechanics;
    save?: SaveEffect;
  }
> = {
  "breath weapon": {
    detail:
      "Exhale your draconic ancestry's breath: DC 8 + CON mod + PB, damage scaling with character level, half on a successful save.",
    recharge: RestType.shortRest,
    maxUses: 1,
    // The ancestry decides whether the target rolls DEX (a line/cone of fire,
    // lightning, …) or CON (poison), and the sheet doesn't model ancestry — so
    // the DC is fixed and the ability is left to vary.
    save: {
      dc: saveDcFormula(StatKey.con),
      onSuccess: "half",
      note: "The ability saved against follows your draconic ancestry (usually DEX; CON for poison).",
    },
    // 2d6 → 3d6 (6th) → 4d6 (11th) → 5d6 (16th) by character level. Type and
    // shape (line vs. cone) follow the ancestry, which the sheet doesn't model.
    mechanics: (level) => ({
      actions: [
        spendRollRemind({
          id: "breath-weapon",
          name: "Breath Weapon",
          cost: "action",
          roll: {
            label: "Breath Weapon damage",
            count: atLevel(level, [
              [1, 2],
              [6, 3],
              [11, 4],
              [16, 5],
            ]),
            die: StandardDie.d6,
          },
          note: "DC 8 + CON mod + PB; each creature in the area makes a save (Dexterity or Constitution per your ancestry), taking half on a success.",
        }),
      ],
    }),
  },
  "relentless endurance": {
    detail: "When reduced to 0 hit points but not killed, drop to 1 instead.",
    recharge: RestType.longRest,
    maxUses: 1,
  },
  "stone's endurance": {
    detail:
      "When you take damage, use your reaction to reduce it by 1d12 + CON modifier.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "healing hands": {
    detail:
      "As an action, touch a creature to heal it a number of hit points equal to your level.",
    recharge: RestType.longRest,
    maxUses: 1,
  },
  "radiant soul": {
    detail:
      "As an action, sprout wings for 1 minute: a 30-foot fly speed and extra radiant damage equal to your level on one attack or spell each turn.",
    recharge: RestType.longRest,
    maxUses: 1,
    minLevel: 3,
  },
  "radiant consumption": {
    detail:
      "As an action, unleash searing light for 1 minute: nearby creatures (and you) take radiant damage each turn, and one attack or spell each turn deals extra radiant damage equal to your level.",
    recharge: RestType.longRest,
    maxUses: 1,
    minLevel: 3,
  },
  "necrotic shroud": {
    detail:
      "As an action, manifest skeletal wings for 1 minute: nearby foes must save against fright, and one attack or spell each turn deals extra necrotic damage equal to your level.",
    recharge: RestType.longRest,
    maxUses: 1,
    minLevel: 3,
  },
  "hidden step": {
    detail:
      "As a bonus action, turn invisible until the start of your next turn or until you attack, cast a spell, or force a save.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "hungry jaws": {
    detail:
      "As a bonus action, make a special bite attack; on a hit you gain temporary hit points equal to your CON modifier.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "fury of the small": {
    detail:
      "When you damage a creature larger than you, deal extra damage equal to your level.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "saving face": {
    detail:
      "After missing an attack, save, or check, add a bonus (up to +5) equal to the number of allies you can see within 30 feet.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "grovel, cower, and beg": {
    detail:
      "As an action, cower to distract foes: allies gain advantage on attacks against enemies within 10 feet of you until the end of your turn.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "daunting roar": {
    detail:
      "As a bonus action, roar: nearby creatures of your choice must succeed on a Wisdom save or be frightened until the end of your next turn.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "rabbit hop": {
    detail:
      "As a bonus action, jump five times your proficiency bonus in feet without provoking opportunity attacks.",
    recharge: RestType.longRest,
    maxUses: PB,
  },
  shifting: {
    detail:
      "As a bonus action, shift for 1 minute: temporary hit points equal to twice your proficiency bonus, plus your shifter type's benefit.",
    recharge: RestType.longRest,
    maxUses: PB,
  },
  "fey step": {
    detail:
      "As a bonus action, teleport up to 30 feet to a space you can see. From 3rd level your season adds an extra effect.",
    recharge: RestType.shortRest,
    maxUses: 1,
  },
  "blessing of the raven queen": {
    detail:
      "As a bonus action, teleport up to 30 feet to a space you can see. From 3rd level you also gain resistance to all damage until the start of your next turn.",
    recharge: RestType.longRest,
    maxUses: 1,
  },
};

// Racial innate spellcasting, keyed by the trait title that grants it. Each
// entry becomes its own limited-use ability once the character reaches its
// `minLevel`: at-will cantrips (maxUses 0, like other at-will hosts) and the
// once-per-long-rest spells races cast without a slot. The casting ability is
// named in the note; racial spells have no spellcasting class, so they live
// here rather than in the (class-keyed) spell list.
interface InnateSpell {
  name: string;
  minLevel: number;
  atWill?: boolean;
  // Recharge for the non-at-will spells; long rest unless stated (a firbolg's
  // magic comes back on a short rest).
  recharge?: RestType;
  note: string;
}

export const RACE_INNATE_SPELLS: Record<string, InnateSpell[]> = {
  "drow magic": [
    {
      name: "Dancing Lights",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Charisma): create up to four torch-bright lights, or a vaguely humanoid glow, for 1 minute.",
    },
    {
      name: "Faerie Fire",
      minLevel: 3,
      note: "Cast Faerie Fire once per long rest without a spell slot (Charisma).",
    },
    {
      name: "Darkness",
      minLevel: 5,
      note: "Cast Darkness once per long rest without a spell slot (Charisma).",
    },
  ],
  "natural illusionist": [
    {
      name: "Minor Illusion",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Intelligence): create a sound or an image for 1 minute.",
    },
  ],
  "infernal legacy": [
    {
      name: "Thaumaturgy",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Charisma): a minor wonder — a booming voice, flickering flames, tremors, and the like — for up to 1 minute.",
    },
    {
      name: "Hellish Rebuke",
      minLevel: 3,
      note: "Cast Hellish Rebuke as a 2nd-level spell once per long rest without a spell slot (Charisma).",
    },
    {
      name: "Darkness",
      minLevel: 5,
      note: "Cast Darkness once per long rest without a spell slot (Charisma).",
    },
  ],
  "light bearer": [
    {
      name: "Light",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Charisma): make an object shed bright light in a 20-foot radius for 1 hour.",
    },
  ],
  "firbolg magic": [
    {
      name: "Detect Magic",
      minLevel: 1,
      recharge: RestType.shortRest,
      note: "Cast Detect Magic once per short or long rest without a spell slot (Wisdom).",
    },
    {
      name: "Disguise Self",
      minLevel: 1,
      recharge: RestType.shortRest,
      note: "Cast Disguise Self once per short or long rest without a spell slot (Wisdom). You can seem up to 3 feet shorter than normal.",
    },
  ],
  "control air and water": [
    {
      name: "Fog Cloud",
      minLevel: 1,
      note: "Cast Fog Cloud once per long rest without a spell slot (Charisma).",
    },
    {
      name: "Gust of Wind",
      minLevel: 3,
      note: "Cast Gust of Wind once per long rest without a spell slot (Charisma).",
    },
    {
      name: "Wall of Water",
      minLevel: 5,
      note: "Cast Wall of Water once per long rest without a spell slot (Charisma).",
    },
  ],
  // Yuan-ti Pureblood's trait is titled just "Innate Spellcasting".
  "innate spellcasting": [
    {
      name: "Poison Spray",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Charisma): a puff of poison gas, CON save or take poison damage.",
    },
    {
      name: "Animal Friendship",
      minLevel: 1,
      atWill: true,
      note: "Cast at will, targeting snakes only, without a spell slot (Charisma).",
    },
    {
      name: "Suggestion",
      minLevel: 3,
      note: "Cast Suggestion once per long rest without a spell slot (Charisma).",
    },
  ],
  "mingle with the wind": [
    {
      name: "Levitate",
      minLevel: 1,
      note: "Cast Levitate on yourself once per long rest without a spell slot or material components (Constitution).",
    },
  ],
  "merge with stone": [
    {
      name: "Pass Without Trace",
      minLevel: 1,
      note: "Cast Pass Without Trace once per long rest without a spell slot or material components (Constitution).",
    },
  ],
  "reach to the blaze": [
    {
      name: "Produce Flame",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Constitution): a flame in your hand for light or a thrown attack.",
    },
    {
      name: "Burning Hands",
      minLevel: 3,
      note: "Cast Burning Hands once per long rest without a spell slot (Constitution).",
    },
  ],
  "call to the wave": [
    {
      name: "Shape Water",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Constitution): move or reshape a small body of water.",
    },
    {
      name: "Create or Destroy Water",
      minLevel: 3,
      note: "Cast Create or Destroy Water as a 2nd-level spell once per long rest without a spell slot (Constitution).",
    },
  ],
  "githyanki psionics": [
    {
      name: "Mage Hand",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Intelligence): the hand is invisible. No components needed.",
    },
    {
      name: "Jump",
      minLevel: 3,
      note: "Cast Jump once per long rest without a spell slot or components (Intelligence).",
    },
    {
      name: "Misty Step",
      minLevel: 5,
      note: "Cast Misty Step once per long rest without a spell slot or components (Intelligence).",
    },
  ],
  "githzerai psionics": [
    {
      name: "Mage Hand",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Wisdom): the hand is invisible. No components needed.",
    },
    {
      name: "Shield",
      minLevel: 3,
      note: "Cast Shield once per long rest without a spell slot or components (Wisdom).",
    },
    {
      name: "Detect Thoughts",
      minLevel: 5,
      note: "Cast Detect Thoughts once per long rest without a spell slot or components (Wisdom).",
    },
  ],
  "fairy magic": [
    {
      name: "Druidcraft",
      minLevel: 1,
      atWill: true,
      note: "At-will cantrip (Int, Wis, or Cha — chosen with the race): small nature-themed sensory wonders.",
    },
    {
      name: "Faerie Fire",
      minLevel: 3,
      note: "Cast Faerie Fire once per long rest without a spell slot (your chosen ability).",
    },
    {
      name: "Enlarge/Reduce",
      minLevel: 5,
      note: "Cast Enlarge/Reduce once per long rest without a spell slot (your chosen ability).",
    },
  ],
  "duergar magic": [
    {
      name: "Enlarge/Reduce",
      minLevel: 3,
      note: "Cast Enlarge/Reduce (enlarge only) on yourself once per long rest without a spell slot or material components (Intelligence). Not castable in direct sunlight.",
    },
    {
      name: "Invisibility",
      minLevel: 5,
      note: "Cast Invisibility on yourself once per long rest without a spell slot or material components (Intelligence). Not castable in direct sunlight.",
    },
  ],
};

const findPool = (
  char: Character,
  title: string,
): LimitedUseAbility | undefined =>
  char.limitedUseAbilities.find(
    (a) => normalizeTitle(a.info.title) === normalizeTitle(title),
  );

// Create/refresh the pools `klass` should have at its current level. Mutates
// `char` (both callers work on a fresh clone/scaffold).
export function syncClassPools(char: Character, klass: IClass): void {
  // Pre-migration saves may lack the list entirely (level-up runs on raw
  // characters in tests and legacy flows).
  char.limitedUseAbilities ??= [];
  const oc = Object.values(OfficialClass).find((c) => c === klass.name);
  const pools = [
    ...((oc && CLASS_POOLS[oc]) ?? []),
    ...((klass.subclass && SUBCLASS_POOLS[klass.subclass]) || []),
    ...((klass.subclass && SUBCLASS_ACTION_HOSTS[klass.subclass]) || []),
  ];
  const features = new Set(
    (char.features ?? []).map((f) => normalizeTitle(f.title)),
  );
  for (const pool of pools) {
    if (klass.level < pool.level) continue;
    if (
      pool.requiresFeature &&
      !features.has(normalizeTitle(pool.requiresFeature))
    )
      continue;
    const maxUses = pool.maxUses(klass);
    const recharge = pool.recharge(klass.level);
    // Level-computed mechanics (scaling die/amount) are re-derived like maxUses.
    const mechanics = pool.mechanics?.(klass);
    const existing = findPool(char, pool.title);
    if (existing) {
      existing.maxUses = maxUses;
      existing.recharge = recharge;
      if (mechanics) existing.mechanics = mechanics;
      // The DC is a formula, so it needs no re-derivation — but a pool granted
      // before save DCs existed won't have one, so backfill it.
      if (pool.save && !existing.save) existing.save = pool.save;
    } else {
      char.limitedUseAbilities.push({
        info: {
          title: pool.title,
          titleFormulas: [],
          detail: pool.detail,
          detailFormulas: [],
        },
        maxUses,
        recharge,
        expended: 0,
        ...(mechanics ? { mechanics } : {}),
        ...(pool.save ? { save: pool.save } : {}),
      });
    }
  }
}

// Create/refresh the racial pools matching any of the given trait titles. The
// use count and recharge are created once (never re-derived, so a hand-edit
// sticks), but the level-scaled `mechanics` block is re-derived every call —
// so passing a leveled character refreshes Breath Weapon's dice. On level-up,
// pass the character's existing pool titles: the matching ones refresh and no
// new pool is created (the race doesn't change), while non-racial titles fall
// through `def` being undefined.
export function syncRacePools(char: Character, traitTitles: string[]): void {
  char.limitedUseAbilities ??= [];
  const totalLevel = char.class.reduce((sum, k) => sum + k.level, 0);
  for (const title of traitTitles) {
    const def = RACE_POOLS[normalizeTitle(title)];
    if (!def) continue;
    // Level-gated pools (an aasimar's 3rd-level transformation) appear on the
    // level-up that reaches them, exactly as innate-spell tiers below do.
    if (totalLevel < (def.minLevel ?? 1)) continue;
    const mechanics = def.mechanics?.(totalLevel);
    const existing = findPool(char, title);
    if (existing) {
      if (mechanics) existing.mechanics = mechanics;
      // Backfill for pools granted before racial save DCs existed; a
      // hand-edited one is left alone, like the use count.
      if (def.save && !existing.save) existing.save = def.save;
      continue;
    }
    char.limitedUseAbilities.push({
      info: {
        title: title.trim(),
        titleFormulas: [],
        detail: def.detail,
        detailFormulas: [],
      },
      maxUses: def.maxUses,
      recharge: def.recharge,
      expended: 0,
      ...(mechanics ? { mechanics } : {}),
      ...(def.save ? { save: def.save } : {}),
    });
  }

  // Racial innate spellcasting: each spell whose minLevel the character has
  // reached becomes its own limited-use ability (at-will cantrips as maxUses-0
  // hosts, the rest once per long rest). New tiers appear as the character
  // levels because `applyClassLevel` passes race feature titles here too.
  for (const title of traitTitles) {
    const innate = RACE_INNATE_SPELLS[normalizeTitle(title)];
    if (!innate) continue;
    for (const spell of innate) {
      if (totalLevel < spell.minLevel) continue;
      if (findPool(char, spell.name)) continue;
      char.limitedUseAbilities.push({
        info: {
          title: spell.name,
          titleFormulas: [],
          detail: spell.note,
          detailFormulas: [],
        },
        maxUses: spell.atWill ? 0 : 1,
        recharge: spell.recharge ?? RestType.longRest,
        expended: 0,
      });
    }
  }
}

// Every pool title a class can be granted, at any level (including its
// subclasses'). Used to keep pool-backed features out of the prose feature
// list — they already appear on the sheet as limited-use pools with their own
// descriptions, so listing them twice just doubles them.
export function poolTitlesFor(className: string): string[] {
  const oc = Object.values(OfficialClass).find((c) => c === className);
  const own = (oc && CLASS_POOLS[oc]) ?? [];
  const sub = Object.values(SUBCLASS_POOLS).flat();
  const hosts = Object.values(SUBCLASS_ACTION_HOSTS).flat();
  return [...own, ...sub, ...hosts].map((p) => p.title);
}
