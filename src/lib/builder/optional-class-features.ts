import { OfficialClass } from "src/lib/data/data-definitions";
import { Character } from "src/lib/types";
import type { LevelEffects, RaceTrait } from "src/lib/builder/types";

// Tasha's optional class features — the ones that *replace* a feature rather
// than add to it. A swap is offered at the level the feature it replaces would
// arrive, taken per character (two tables can disagree about editions, and one
// player can have a 2014 ranger and a Tasha's one), and remembered as the
// granted feature row itself: `takenOptionalFeatures` reads them back off the
// sheet, which is what lets a swap chosen at 1st still suppress a pick at 14th
// without a new field on `Character`.
//
// Licensing, as everywhere outside the SRD JSON: mechanical facts with terse
// original summaries, never published prose.

interface OptionalFeatureGrant {
  // Prose rows added at this class level (Deft Explorer's later halves).
  features?: RaceTrait[];
  // Fields written (speeds, senses) — the same applier a class level uses.
  effects?: LevelEffects;
  // Flat walking-speed bonus in feet. Separate from `effects.speeds`, which
  // only ever *raises to* a number: Roving's +5 is additive, so a wood elf's
  // 35 becomes 40 rather than staying put. Applied once, when the feature row
  // it comes with is added.
  speedBonus?: number;
  // Spells granted (always prepared). Absent indices are skipped, as ever —
  // Beast Sense isn't in the bundled catalog, and the prose still names it.
  spellIndices?: string[];
  // Expertise picks owed (Canny's one skill), offered by the same picker the
  // rogue and bard use.
  expertise?: number;
}

export interface OptionalClassFeature {
  name: string;
  className: OfficialClass;
  // The class level at which the swap is offered — always the level the
  // replaced feature arrives at, so the player chooses between them once.
  level: number;
  summary: string;
  // Feature titles it replaces, matched by prefix so the SRD's parenthesised
  // "Favored Enemy (1 type)" is caught by "Favored Enemy".
  replaces: string[];
  // Option-group categories it switches off — including the *later* picks the
  // replaced feature would have granted (Favored Enemy's at 6th and 14th).
  replacesOptions?: string[];
  // What the swap grants, keyed by class level. The choice level is one of
  // them; the rest arrive as the class levels, applied idempotently.
  byLevel?: Record<number, OptionalFeatureGrant>;
}

export const OPTIONAL_CLASS_FEATURES: OptionalClassFeature[] = [
  {
    name: "Favored Foe",
    className: OfficialClass.Ranger,
    level: 1,
    summary:
      "When you hit a creature with an attack roll, you can expend a use to mark it as your favored foe for a minute — while you keep concentration, the first time you hit it each turn it takes extra damage from your Favored Foe die.",
    replaces: ["Favored Enemy"],
    replacesOptions: ["favoredEnemy"],
    // The die and the uses are a limited-use pool, so they scale in
    // `class-pools.ts` alongside every other pool rather than here.
  },
  {
    name: "Deft Explorer",
    className: OfficialClass.Ranger,
    level: 1,
    summary:
      "Canny: choose one skill you're proficient in — your proficiency bonus is doubled for it. You also learn two languages of your choice.",
    replaces: ["Natural Explorer"],
    replacesOptions: ["naturalExplorer"],
    byLevel: {
      1: { expertise: 1 },
      6: {
        features: [
          {
            title: "Roving",
            detail:
              "Your walking speed increases by 5 ft., and you gain a climbing speed and a swimming speed equal to it.",
          },
        ],
        speedBonus: 5,
        effects: { speeds: { climb: "walk", swim: "walk" } },
      },
      10: {
        // Tireless is a pool (temp HP, PB uses) — see `class-pools.ts`. Only
        // its rest-side half is prose, since no pool models it.
        features: [
          {
            title: "Tireless (exhaustion)",
            detail:
              "Whenever you finish a short rest, your exhaustion level drops by one.",
          },
        ],
      },
    },
  },
  {
    name: "Primal Awareness",
    className: OfficialClass.Ranger,
    level: 3,
    summary:
      "You always have these spells prepared, and can cast each once per long rest without a spell slot: speak with animals, beast sense (5th), speak with plants (9th), locate creature (13th), commune with nature (17th).",
    replaces: ["Primeval Awareness"],
    byLevel: {
      3: { spellIndices: ["speak-with-animals"] },
      5: { spellIndices: ["beast-sense"] },
      9: { spellIndices: ["speak-with-plants"] },
      13: { spellIndices: ["locate-creature"] },
      17: { spellIndices: ["commune-with-nature"] },
    },
  },
  {
    name: "Nature's Veil",
    className: OfficialClass.Ranger,
    level: 10,
    summary:
      "As a bonus action, magically become invisible — along with anything you wear or carry — until the end of your next turn.",
    replaces: ["Hide in Plain Sight"],
    // The uses are a pool; see `class-pools.ts`.
  },
];

// The swaps `className` offers on reaching `level` — the question the wizards
// ask, and the only level at which each can be taken.
export const optionalFeaturesAt = (
  className: string,
  level: number,
): OptionalClassFeature[] =>
  OPTIONAL_CLASS_FEATURES.filter(
    (f) => f.className === className && f.level === level,
  );

// The swaps a character has already taken, read back off the feature rows they
// granted. Feature titles are the record, so this survives a save from before
// optional features existed and needs no field of its own.
export const takenOptionalFeatures = (
  character: Character,
): OptionalClassFeature[] => {
  const titles = new Set(
    (character.features ?? []).map((f) => f.title.trim().toLowerCase()),
  );
  return OPTIONAL_CLASS_FEATURES.filter((f) =>
    titles.has(f.name.trim().toLowerCase()),
  );
};

const byName = (names: string[]): OptionalClassFeature[] =>
  OPTIONAL_CLASS_FEATURES.filter((f) => names.includes(f.name));

// Whether a feature title is replaced by one of `names` — a prefix match, so
// the SRD's "Favored Enemy (1 type)" is caught by "Favored Enemy".
export function isReplacedFeature(title: string, names: string[]): boolean {
  const lc = title.trim().toLowerCase();
  return byName(names).some((f) =>
    f.replaces.some((r) => lc.startsWith(r.toLowerCase())),
  );
}

// The option-group categories `names` switch off.
export const replacedOptionCategories = (names: string[]): string[] =>
  byName(names).flatMap((f) => f.replacesOptions ?? []);

// Everything the taken swaps grant at one class level, flattened — the caller
// applies them next to the ordinary class grants.
export const optionalGrantsAt = (
  names: string[],
  className: string,
  level: number,
): OptionalFeatureGrant[] =>
  byName(names)
    .filter((f) => f.className === className)
    .map((f) => f.byLevel?.[level])
    .filter((g): g is OptionalFeatureGrant => !!g);
