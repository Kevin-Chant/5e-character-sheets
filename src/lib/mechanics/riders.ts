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
import { AttackContext, needsOptIn } from "./conditions";

// Roll-time interpreter: collects riders in play for a roll and applies them.
// Die-level adjustments (rerolls, minimum dice) hook into roll.ts's per-die
// loop; total-level ones (minimums, bonuses) apply to the finished sum.

// Every rider active for this character and roll kind, from feature titles,
// limited-use abilities (authored `mechanics`, falling back to
// catalog-by-title), and race traits (e.g. Halfling Luck).
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
  // Chosen options (Metamagic, maneuvers, Pact Boon) match by name on the
  // same title-keyed catalog.
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
// Attack, Rage damage). Kept separate from `ridersFor` since the roll dialog
// gates this to weapon attacks and sequences it by `declareAt`, rather than
// folding it silently into the total.
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

// The `spellDamage` mirror of `extraDamageRiders`, kept separate so a spell
// bonus never leaks onto a weapon and vice versa.
export function spellDamageRiders(character: Character): ActiveRider[] {
  const out: ActiveRider[] = [];
  const collect = (entry: FeatureMechanics | undefined, source: string) =>
    entry?.riders?.forEach((r) => {
      if (r.rider.rider === "spellDamage") out.push({ source, rider: r.rider });
    });
  character.features.forEach((f) =>
    collect(FEATURE_MECHANICS[normalizeTitle(f.title)], f.title.trim()),
  );
  character.limitedUseAbilities.forEach((a) =>
    collect(mechanicsForAbility(a), a.info.title.trim()),
  );
  character.chosenOptions?.forEach((o) =>
    collect(FEATURE_MECHANICS[normalizeTitle(o.name)], o.name.trim()),
  );
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

// Splits `bonus` riders by `needsOptIn`: settled conditions fold silently,
// unverifiable ones are offered as a checkbox. Default empty context means
// "attack unknown", so every conditional bonus prompts.
export function flatBonusRiders(
  riders: ActiveRider[],
  context: AttackContext = {},
): {
  always: FlatBonusRider[];
  optional: FlatBonusRider[];
} {
  const always: FlatBonusRider[] = [];
  const optional: FlatBonusRider[] = [];
  for (const r of riders) {
    if (r.rider.rider !== "bonus") continue;
    const entry = { source: r.source, rider: r.rider };
    (needsOptIn(r, context) ? optional : always).push(entry);
  }
  return { always, optional };
}

// Flat additions to the total. Sums every `bonus` rider it's handed; callers
// decide which are in play (see `flatBonusRiders`).
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

// Fold total-level riders into a finished roll: raise to any minimum, then
// add the unconditional flat bonuses (opt-in ones excluded, decided by the
// dialog). Floors at 0 — correct for damage/healing/hit-die totals; don't use
// on d20 checks, which can legitimately go negative.
export function applyTotalRiders(
  total: number,
  riders: ActiveRider[],
  character: Character,
  context: AttackContext = {},
): number {
  return (
    Math.max(total, riderMinimumTotal(riders, character)) +
    riderFlatBonus(flatBonusRiders(riders, context).always, character)
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

// HP regained from spending one hit die (rolled die + CON), never negative,
// raised by any minimum-total rider (Durable). Lives here rather than
// rules.ts, which sits below the formula engine in the import graph.
export function hitDieHealing(
  character: Character,
  rolledTotal: number,
): number {
  return Math.max(
    0,
    applyTotalRiders(rolledTotal, ridersFor(character, "hitDie"), character),
  );
}
