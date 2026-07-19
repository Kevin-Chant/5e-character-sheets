import { Operation } from "src/lib/data/data-definitions";
import {
  CustomFormula,
  CustomFormulaWithDamage,
  DieDefinition,
  SpellDamageComponent,
  SpellMechanics,
  isDieExpression,
  isStandardDie,
} from "src/lib/types";

// The fixed 5e breakpoints at which cantrip effects grow, each adding one step.
export const CANTRIP_TIERS = [5, 11, 17] as const;

// How many scaling increments apply when the spell is cast at `castLevel`
// (a slot level, or the character's total level for cantrips).
export function scalingSteps(m: SpellMechanics, castLevel: number): number {
  const scaling = m.scaling;
  if (!scaling) return 0;
  if (scaling.driver === "character")
    return CANTRIP_TIERS.filter((tier) => castLevel >= tier).length;
  const perLevels = scaling.perLevels ?? 1;
  return Math.max(0, Math.floor((castLevel - m.level) / perLevels));
}

const sameDie = (a: DieDefinition, b: DieDefinition): boolean =>
  isStandardDie(a) && isStandardDie(b)
    ? a === b
    : !isStandardDie(a) && !isStandardDie(b) && a.numFaces === b.numFaces;

// `base + steps * increment`, kept as a plain CustomFormula the engine already
// evaluates. When both sides are the same die (e.g. 8d6 + N·1d6) it collapses to
// a single dice-count bump; otherwise it falls back to an addition node. A dice
// increment scales by its *count* (steps × N dice), never `steps × oneRoll` —
// so an actual roll rolls the right number of dice, not one die multiplied.
function combine(
  base: CustomFormula,
  increment: CustomFormula,
  steps: number,
): CustomFormula {
  if (steps <= 0) return base;
  if (
    isDieExpression(base) &&
    isDieExpression(increment) &&
    sameDie(base[1], increment[1]) &&
    base[2] === increment[2]
  )
    return [base[0] + steps * increment[0], base[1], base[2]];
  const scaledIncrement: CustomFormula = isDieExpression(increment)
    ? [increment[0] * steps, increment[1], increment[2]]
    : steps === 1
      ? increment
      : { operation: Operation.multiplication, operands: [steps, increment] };
  return { operation: Operation.addition, operands: [base, scaledIncrement] };
}

// Largest table entry at or below `castLevel` (tables can be sparse — only the
// levels where damage changes need an entry).
function tableEntryFor(
  table: Record<number, SpellDamageComponent[]>,
  castLevel: number,
): SpellDamageComponent[] | undefined {
  const key = Object.keys(table)
    .map(Number)
    .filter((lvl) => lvl <= castLevel)
    .sort((a, b) => b - a)[0];
  return key === undefined ? undefined : table[key];
}

const componentsToMap = (
  components: SpellDamageComponent[],
): CustomFormulaWithDamage =>
  components.reduce<CustomFormulaWithDamage>((map, c) => {
    map[c.damageType] = c.formula;
    return map;
  }, {});

/**
 * The concrete damage of a spell cast at `castLevel` — a slot level, or the
 * character's total level for cantrips — as a `CustomFormulaWithDamage` the
 * existing engine renders and totals. An explicit `damageTable` entry wins;
 * otherwise each base component grows by `steps` copies of its matching scaling
 * increment. Returns `{}` for spells with no structured damage.
 */
export function spellDamageAtLevel(
  m: SpellMechanics,
  castLevel: number,
): CustomFormulaWithDamage {
  if (m.damageTable) {
    const entry = tableEntryFor(m.damageTable, castLevel);
    if (entry) return componentsToMap(entry);
  }
  if (!m.damage) return {};

  const steps = scalingSteps(m, castLevel);
  const increments = m.scaling?.damage ?? [];
  return componentsToMap(
    m.damage.map((base) => {
      const increment = increments.find(
        (i) => i.damageType === base.damageType,
      );
      return {
        damageType: base.damageType,
        formula: increment
          ? combine(base.formula, increment.formula, steps)
          : base.formula,
      };
    }),
  );
}

/**
 * The concrete healing formula of a spell cast at `castLevel` — base healing
 * grown by its per-step increment (e.g. Cure Wounds `1d8 + mod` gains `1d8` per
 * slot above 1st). Returns undefined for spells that don't heal.
 */
export function spellHealingAtLevel(
  m: SpellMechanics,
  castLevel: number,
): CustomFormula | undefined {
  if (!m.healing) return undefined;
  const increment = m.scaling?.healing;
  return increment
    ? combine(m.healing, increment, scalingSteps(m, castLevel))
    : m.healing;
}

// The number of separately-rolled instances (darts/rays/beams) at `castLevel`.
export function spellInstancesAtLevel(
  m: SpellMechanics,
  castLevel: number,
): number {
  if (m.instances === undefined) return 1;
  const perStep = m.scaling?.instances ?? 0;
  return m.instances + perStep * scalingSteps(m, castLevel);
}
