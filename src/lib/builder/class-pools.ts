import {
  OfficialClass,
  Operation,
  RestType,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  normalizeTitle,
  spendRollRemind,
  SUPERIORITY,
} from "src/lib/mechanics/catalog";
import { FeatureMechanics } from "src/lib/mechanics/types";
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

interface ClassPoolDef {
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
              die: atLevel(k.level, [
                [1, StandardDie.d6],
                [5, StandardDie.d8],
                [10, StandardDie.d10],
                [15, StandardDie.d12],
              ]),
            },
            note: "Give one creature other than you within 60 ft. the die to add to one d20 roll in the next 10 minutes.",
          }),
        ],
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

// Subclass pools, keyed by the subclass name stored on the class entry.
// Synced exactly like class pools (created at the feature's class level,
// size/recharge re-derived every level-up), which is what handles scaling
// pools like the battle master's superiority dice. Titles match the mechanics
// catalog so the pools arrive with their actions.
export const SUBCLASS_POOLS: Record<string, ClassPoolDef[]> = {
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
  ];
  for (const pool of pools) {
    if (klass.level < pool.level) continue;
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
}
