import { StatKey } from "src/lib/data/data-definitions";
import { getCatalogRace, getSubrace } from "src/lib/builder/race-catalog";
import { STANDARD_ARRAY, STAT_ORDER } from "src/lib/builder/ability-scores";
import {
  BuilderState,
  RaceBonus,
  CatalogRace,
  CatalogSubrace,
} from "src/lib/builder/types";

// Default racial bonuses: fixed increases plus one unassigned +1 placeholder
// per "choose N" option (Half-Elf). Seeds the editable list.
export function defaultRaceBonuses(
  race?: CatalogRace,
  subrace?: CatalogSubrace,
): RaceBonus[] {
  const fixed = [
    ...(race?.abilityBonuses ?? []),
    ...(subrace?.abilityBonuses ?? []),
  ].map((b) => ({ bonus: b.bonus, stat: b.stat as StatKey | "" }));
  const floating = Array.from(
    { length: race?.abilityBonusOptions?.choose ?? 0 },
    () => ({ bonus: 1, stat: "" as StatKey | "" }),
  );
  return [...fixed, ...floating];
}

// Bonuses in effect: the player's edited list when present, else race defaults.
export function resolvedRaceBonuses(state: BuilderState): RaceBonus[] {
  if (state.raceBonuses.length) return state.raceBonuses;
  return defaultRaceBonuses(
    getCatalogRace(state.raceIndex),
    getSubrace(getCatalogRace(state.raceIndex), state.subraceIndex),
  );
}

// The pool of assignable values for the current score method (empty for
// point-buy / manual, which edit `baseStats` directly).
export const scorePool = (state: BuilderState): number[] =>
  state.scoreMethod === "standard"
    ? STANDARD_ARRAY
    : state.scoreMethod === "roll"
      ? state.rolledPool
      : [];

// The base (pre-racial) scores: point-buy/manual read `baseStats`; standard
// array and rolled scores come from the assignment (unassigned → 10).
export function resolveBaseStats(state: BuilderState): Record<StatKey, number> {
  if (state.scoreMethod === "pointbuy" || state.scoreMethod === "manual")
    return state.baseStats;
  return STAT_ORDER.reduce(
    (acc, stat) => ({ ...acc, [stat]: state.assignment[stat] ?? 10 }),
    {} as Record<StatKey, number>,
  );
}

// Final scores: base + resolved racial bonuses (unassigned bonuses ignored).
export function resolveFinalStats(
  state: BuilderState,
): Record<StatKey, number> {
  const stats = { ...resolveBaseStats(state) };
  for (const { stat, bonus } of resolvedRaceBonuses(state))
    if (stat) stats[stat] += bonus;
  return stats;
}
