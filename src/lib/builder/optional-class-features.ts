import { OfficialClass } from "src/lib/data/data-definitions";
import { Character } from "src/lib/types";
import type { LevelEffects, RaceTrait } from "src/lib/builder/types";

// Tasha's optional class features: swaps that replace a feature rather than
// add to it. Taken per character, remembered as the granted feature row
// itself (`takenOptionalFeatures` reads it back), so no new `Character` field
// is needed.
//
// Non-SRD content: mechanical facts with terse original summaries, never
// published prose.

interface OptionalFeatureGrant {
  // Prose rows added at this class level.
  features?: RaceTrait[];
  // Fields written (speeds, senses) — same applier a class level uses.
  effects?: LevelEffects;
  // Flat walking-speed bonus in feet; additive, unlike `effects.speeds` which
  // only raises to a number.
  speedBonus?: number;
  // Spells granted (always prepared). Absent indices are skipped.
  spellIndices?: string[];
  // Expertise picks owed, offered by the same picker rogue/bard use.
  expertise?: number;
}

export interface OptionalClassFeature {
  name: string;
  className: OfficialClass;
  // Class level the swap is offered at — the level the replaced feature
  // arrives at.
  level: number;
  summary: string;
  // Feature titles replaced, matched by prefix (SRD's "Favored Enemy (1
  // type)" is caught by "Favored Enemy").
  replaces: string[];
  // Option-group categories switched off, including later picks the replaced
  // feature would have granted.
  replacesOptions?: string[];
  // Grants keyed by class level; applied idempotently as the class levels.
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
    // Die and uses scale as a pool in `class-pools.ts`.
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
        // Tireless's temp-HP/PB-uses half is a pool in `class-pools.ts`; only
        // the rest-side half is modelled as prose here.
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
    // Uses are a pool; see `class-pools.ts`.
  },
];

// Swaps `className` offers on reaching `level`.
export const optionalFeaturesAt = (
  className: string,
  level: number,
): OptionalClassFeature[] =>
  OPTIONAL_CLASS_FEATURES.filter(
    (f) => f.className === className && f.level === level,
  );

// Swaps already taken, read back off the granted feature rows (no field of
// its own).
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

// Whether a feature title is replaced by one of `names` (prefix match).
export function isReplacedFeature(title: string, names: string[]): boolean {
  const lc = title.trim().toLowerCase();
  return byName(names).some((f) =>
    f.replaces.some((r) => lc.startsWith(r.toLowerCase())),
  );
}

// Option-group categories `names` switch off.
export const replacedOptionCategories = (names: string[]): string[] =>
  byName(names).flatMap((f) => f.replacesOptions ?? []);

// Grants from taken swaps at one class level, flattened.
export const optionalGrantsAt = (
  names: string[],
  className: string,
  level: number,
): OptionalFeatureGrant[] =>
  byName(names)
    .filter((f) => f.className === className)
    .map((f) => f.byLevel?.[level])
    .filter((g): g is OptionalFeatureGrant => !!g);
