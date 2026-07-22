import {
  OfficialClass,
  Operation,
  RestType,
  StatKey,
} from "src/lib/data/data-definitions";
import { normalizeTitle } from "src/lib/mechanics/catalog";
import {
  Character,
  CustomFormula,
  IClass,
  LimitedUseAbility,
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
}

const short = () => RestType.shortRest;
const long = () => RestType.longRest;
const classLevel = (klass: IClass): CustomFormula => ({
  classLevel: klass.id,
});
const atLeastOne = (formula: CustomFormula): CustomFormula => ({
  operation: Operation.maximum,
  operands: [1, formula],
});

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

// Racial pools, keyed by the trait title the race data grants. Static sizes,
// created once at build; never re-derived (race levels don't exist).
export const RACE_POOLS: Record<
  string,
  { detail: string; recharge: RestType; maxUses: CustomFormula }
> = {
  "breath weapon": {
    detail:
      "Exhale your draconic ancestry's breath: DC 8 + CON mod + PB, 2d6 damage scaling with character level, half on a successful save.",
    recharge: RestType.shortRest,
    maxUses: 1,
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
    const existing = findPool(char, pool.title);
    if (existing) {
      existing.maxUses = maxUses;
      existing.recharge = recharge;
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
      });
    }
  }
}

// Create the racial pools matching any of the given trait titles. Unlike
// class pools these are created once and never re-derived.
export function syncRacePools(char: Character, traitTitles: string[]): void {
  char.limitedUseAbilities ??= [];
  for (const title of traitTitles) {
    const def = RACE_POOLS[normalizeTitle(title)];
    if (!def || findPool(char, title)) continue;
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
    });
  }
}
