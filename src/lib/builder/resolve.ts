import { StatKey } from "src/lib/data/data-definitions";
import { getSrdRace, getSubrace } from "src/lib/builder/srd-races";
import { STANDARD_ARRAY, STAT_ORDER } from "src/lib/builder/ability-scores";
import {
  BuilderState,
  RaceBonus,
  SrdRace,
  SrdSubrace,
} from "src/lib/builder/types";

// The racial bonuses a race+subrace grant by default: the fixed increases, plus
// one unassigned +1 placeholder per "choose N" option (Half-Elf). Used to seed
// the editable list; the player can then reassign any of them.
export function defaultRaceBonuses(
  race?: SrdRace,
  subrace?: SrdSubrace,
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

// The bonuses actually in effect: the player's edited list when present, else
// the race defaults (so build-character stays correct even if the UI never
// seeded them, e.g. in tests).
export function resolvedRaceBonuses(state: BuilderState): RaceBonus[] {
  if (state.raceBonuses.length) return state.raceBonuses;
  return defaultRaceBonuses(
    getSrdRace(state.raceIndex),
    getSubrace(getSrdRace(state.raceIndex), state.subraceIndex),
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
