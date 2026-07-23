import { calculateCustomFormula } from "src/lib/formula";
import { Character, RollRider } from "src/lib/types";
import {
  classDamageRiders,
  FEATURE_MECHANICS,
  mechanicsForAbility,
  normalizeTitle,
  RACE_MECHANICS,
} from "./catalog";
import { ActiveRider, FeatureMechanics, RollKind } from "./types";

// The roll-time interpreter: collects the riders in play for a roll and
// applies them. Die-level adjustments (rerolls, minimum dice) hook into
// `roll.ts`'s per-die loop; total-level ones (minimums, bonuses) apply to the
// finished sum.

// Every rider active for this character and roll kind. Sources: feature
// titles (feats land on the sheet as features), limited-use abilities (their
// authored `mechanics` field, falling back to catalog-by-title), and the race
// (for traits like Halfling Luck whose titles are too generic).
export function ridersFor(character: Character, kind: RollKind): ActiveRider[] {
  const out: ActiveRider[] = [];
  const collectEntry = (entry: FeatureMechanics | undefined, source: string) =>
    entry?.riders?.forEach((r) => {
      if (r.appliesTo.includes(kind)) out.push({ source, rider: r.rider });
    });
  character.features.forEach((f) =>
    collectEntry(FEATURE_MECHANICS[normalizeTitle(f.title)], f.title.trim()),
  );
  character.limitedUseAbilities.forEach((a) =>
    collectEntry(mechanicsForAbility(a), a.info.title.trim()),
  );
  // Chosen options (Metamagic, maneuvers, Pact Boon) match by name on the same
  // title-keyed catalog — none carry riders today, but this is what keeps the
  // field from being inert, and lets an option gain mechanics without moving it
  // into `features`.
  character.chosenOptions?.forEach((o) =>
    collectEntry(FEATURE_MECHANICS[normalizeTitle(o.name)], o.name.trim()),
  );
  const race = normalizeTitle(character.race.name);
  Object.entries(RACE_MECHANICS).forEach(([key, entry]) => {
    if (!race.includes(key)) return;
    entry.riders?.forEach((r) => {
      if (r.appliesTo.includes(kind))
        out.push({ source: character.race.name, rider: r.rider });
    });
  });
  return out;
}

// The `extraDamage` riders in play for a weapon attack: authored ones on
// features / limited-use abilities, plus the level-scaled class ones (Sneak
// Attack, Rage damage) baked from the character's class levels. Kept apart from
// `ridersFor` on purpose — extra damage isn't a silent total fold: the roll
// dialog gates it to weapon attacks, sequences it by `declareAt`, and lets the
// player opt in — so it must never leak into spell damage or standalone rolls.
export function extraDamageRiders(character: Character): ActiveRider[] {
  const out: ActiveRider[] = [];
  const collect = (entry: FeatureMechanics | undefined, source: string) =>
    entry?.riders?.forEach((r) => {
      if (r.rider.rider === "extraDamage") out.push({ source, rider: r.rider });
    });
  character.features.forEach((f) =>
    collect(FEATURE_MECHANICS[normalizeTitle(f.title)], f.title.trim()),
  );
  character.limitedUseAbilities.forEach((a) =>
    collect(mechanicsForAbility(a), a.info.title.trim()),
  );
  out.push(...classDamageRiders(character));
  return out;
}

// Adjust one rolled die: reroll-below first (RAW: you must keep the new
// roll), then minimum-die floors the result. `reroll` re-rolls the same die.
export function adjustDieRoll(
  raw: number,
  riders: ActiveRider[],
  reroll: () => number,
): number {
  let result = raw;
  const rerollAt = Math.max(
    0,
    ...riders.flatMap((r) =>
      r.rider.rider === "rerollBelow" ? [r.rider.threshold] : [],
    ),
  );
  if (result <= rerollAt) result = reroll();
  const dieFloor = Math.max(
    0,
    ...riders.flatMap((r) =>
      r.rider.rider === "minimumDie" ? [r.rider.value] : [],
    ),
  );
  return Math.max(result, dieFloor);
}

// The floor the roll's total can't come out below (0 when no rider applies).
export function riderMinimumTotal(
  riders: ActiveRider[],
  character: Character,
): number {
  return Math.max(
    0,
    ...riders.flatMap((r) =>
      r.rider.rider === "minimumTotal"
        ? [calculateCustomFormula(r.rider.value, character)]
        : [],
    ),
  );
}

// A `bonus` rider with its source, narrowed out of the `RollRider` union.
export interface FlatBonusRider {
  source: string;
  rider: Extract<RollRider, { rider: "bonus" }>;
}

// The `bonus` riders in play, split by whether the sheet can apply them on its
// own. Unconditional ones fold silently; `optional` ones name a condition the
// sheet can't verify (Archery's ranged-weapons-only) and are offered as a
// checkbox, in the same spirit as an opt-in `extraDamage`.
export function flatBonusRiders(riders: ActiveRider[]): {
  always: FlatBonusRider[];
  optional: FlatBonusRider[];
} {
  const always: FlatBonusRider[] = [];
  const optional: FlatBonusRider[] = [];
  for (const r of riders) {
    if (r.rider.rider !== "bonus") continue;
    // Narrowed here so the dialog can read `value`/`note` without re-casting.
    const entry = { source: r.source, rider: r.rider };
    (r.rider.optional ? optional : always).push(entry);
  }
  return { always, optional };
}

// Flat additions to the total. Sums every `bonus` rider it's handed — callers
// decide which are in play (see `flatBonusRiders`), so an opt-in bonus never
// applies just by existing.
export function riderFlatBonus(
  riders: ActiveRider[],
  character: Character,
): number {
  return riders.reduce(
    (sum, r) =>
      r.rider.rider === "bonus"
        ? sum + calculateCustomFormula(r.rider.value, character)
        : sum,
    0,
  );
}

// Fold the total-level riders into a finished roll: raise to any minimum, then
// add the unconditional flat bonuses (an `optional` one needs the player to opt
// in, which is a dialog decision, so it's excluded here). Note the implicit
// floor at 0 (riderMinimumTotal's base) — correct for the damage/healing/hit-die
// totals this is meant for, so don't use it on d20 checks, whose totals can
// legitimately be negative and whose bonuses fold into the modifier instead.
export function applyTotalRiders(
  total: number,
  riders: ActiveRider[],
  character: Character,
): number {
  return (
    Math.max(total, riderMinimumTotal(riders, character)) +
    riderFlatBonus(flatBonusRiders(riders).always, character)
  );
}

// The d20 value at or above which this roll crits (20 without riders).
export function critThreshold(riders: ActiveRider[]): number {
  return Math.min(
    20,
    ...riders.flatMap((r) =>
      r.rider.rider === "critRange" ? [r.rider.value] : [],
    ),
  );
}

// Advisory advantage notes to surface in the dialog.
export function advantageNotes(riders: ActiveRider[]): string[] {
  return riders.flatMap((r) =>
    r.rider.rider === "advantage" ? [`${r.source}: ${r.rider.note}`] : [],
  );
}

// HP regained from spending one hit die, given the rolled die + CON total:
// never negative, raised by any minimum-total rider (Durable). Lives here
// rather than rules.ts because rider values are formulas and rules.ts sits
// below the formula engine in the import graph.
export function hitDieHealing(
  character: Character,
  rolledTotal: number,
): number {
  return Math.max(
    0,
    applyTotalRiders(rolledTotal, ridersFor(character, "hitDie"), character),
  );
}
