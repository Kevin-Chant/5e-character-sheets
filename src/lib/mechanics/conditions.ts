import { SkillName, StatKey } from "src/lib/data/data-definitions";
import {
  Attack,
  AttackTag,
  RiderCondition,
  isAtomicVariable,
  isArbitraryOperandOperation,
  isDieExpression,
  isDoubleOperandOperation,
  isExpression,
  isStatKey,
} from "src/lib/types";
import { ActiveRider } from "./types";

// Whether a rider's condition (from catalog.ts) applies to the roll being
// made — an attack's weapon tags (`Attack.tags`), or which skill a check is
// for. Three-valued: a roll that carries no information about a clause is
// `unknown` (offer it, let the player decide) rather than guessing; only a
// decidable `no` hides a rider and only `yes` applies one silently.

export type Eligibility = "yes" | "no" | "unknown";

/** What we know about the roll being made, as the conditions see it. */
export interface RollContext {
  /** Undefined when the attack carries no tags — "unknown", not "none". */
  tags?: AttackTag[];
  /** The ability the to-hit roll uses, when it resolves to exactly one. */
  ability?: StatKey;
  /** Which skill a check is rolled for; absent for a bare ability check. */
  skill?: SkillName;
  /** Whether the roll already adds proficiency. Absent when unknown. */
  proficient?: boolean;
}

// The stat leaves a to-hit formula mentions. A preset weapon is `ability +
// PB` (one stat); finesse is `max(STR, DEX)` (two stats, unknowable).
function statsIn(formula: unknown, out: Set<StatKey>): Set<StatKey> {
  if (formula === undefined || formula === null) return out;
  if (isDieExpression(formula)) return out;
  if (isAtomicVariable(formula)) {
    if (isStatKey(formula)) out.add(formula);
    return out;
  }
  if (isExpression(formula)) {
    if (isArbitraryOperandOperation(formula))
      formula.operands.forEach((o) => statsIn(o, out));
    else if (isDoubleOperandOperation(formula)) {
      statsIn(formula.operand1, out);
      statsIn(formula.operand2, out);
    } else statsIn((formula as { operand1: unknown }).operand1, out);
  }
  return out;
}

// `ability` is read off the to-hit formula rather than stored, since the
// formula is the only source of truth; a finesse weapon (two stats) stays
// undefined.
export function attackContext(attack: Attack | undefined): RollContext {
  if (!attack) return {};
  const stats = [...statsIn(attack.bonus, new Set<StatKey>())];
  return {
    tags: attack.tags,
    ability: stats.length === 1 ? stats[0] : undefined,
  };
}

// A missing clause is satisfied; a clause with no info is `unknown`. A
// decidable `no` beats any number of unknowns.
export function conditionEligibility(
  condition: RiderCondition | undefined,
  context: RollContext,
): Eligibility {
  if (!condition) return "yes";
  let unknown = false;

  const { tags, anyTags, without, ability } = condition;
  if (tags?.length || anyTags?.length || without?.length) {
    if (!context.tags) unknown = true;
    else {
      const has = (t: AttackTag) => context.tags!.includes(t);
      if (tags?.length && !tags.every(has)) return "no";
      if (anyTags?.length && !anyTags.some(has)) return "no";
      if (without?.length && without.some(has)) return "no";
    }
  }
  if (ability?.length) {
    if (!context.ability) unknown = true;
    else if (!ability.includes(context.ability)) return "no";
  }
  if (condition.skill?.length) {
    if (!context.skill) unknown = true;
    else if (!condition.skill.includes(context.skill)) return "no";
  }
  if (condition.proficiency) {
    if (context.proficient === undefined) unknown = true;
    else if (context.proficient !== (condition.proficiency === "proficient"))
      return "no";
  }

  return unknown ? "unknown" : "yes";
}

export const riderEligibility = (
  rider: ActiveRider,
  context: RollContext,
): Eligibility => conditionEligibility(rider.rider.requires, context);

// Riders that plainly don't apply (eligibility "no") are dropped entirely,
// not just unticked.
export const applicableRiders = (
  riders: ActiveRider[],
  context: RollContext,
): ActiveRider[] => riders.filter((r) => riderEligibility(r, context) !== "no");

// Prompts when a rider is explicitly optional (non-weapon condition, e.g.
// "while raging"), or when the weapon condition is unknown.
export const needsOptIn = (
  rider: ActiveRider,
  context: RollContext,
): boolean => {
  const r = rider.rider;
  const explicit =
    (r.rider === "bonus" || r.rider === "extraDamage") && !!r.optional;
  return explicit || riderEligibility(rider, context) === "unknown";
};
