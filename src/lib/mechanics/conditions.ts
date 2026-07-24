import { StatKey } from "src/lib/data/data-definitions";
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

// ---------------------------------------------------------------------------
// Does this rider apply to *this* attack?
//
// The riders in `catalog.ts` all carry real 5e conditions ("melee weapon attack
// using Strength", "ranged weapons only"), and the sheet used to answer "I can't
// tell" for every one of them — so Archery was a checkbox you ticked on every
// bow shot, and Rage damage was added to a longbow. Attacks now carry the weapon
// properties (`Attack.tags`) that decide most of those conditions.
//
// The answer is deliberately three-valued. An attack with no tags — every
// hand-authored one, and every attack made before tags existed — is `unknown`,
// which restores exactly the old behaviour (offer it, let the player say) rather
// than guessing. Only a decidable `no` hides a rider, and only a decidable `yes`
// applies one silently.
// ---------------------------------------------------------------------------

export type Eligibility = "yes" | "no" | "unknown";

/** What we know about the attack being rolled, as the conditions see it. */
export interface AttackContext {
  /** Undefined when the attack carries no tags — "unknown", not "none". */
  tags?: AttackTag[];
  /** The ability the to-hit roll uses, when it resolves to exactly one. */
  ability?: StatKey;
}

// The stat leaves a to-hit formula mentions. A weapon built from a preset is
// `ability + PB`, so a single stat means the attack unambiguously uses it;
// finesse is `max(STR, DEX)`, which yields two and is correctly unknowable.
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

/**
 * The context an attack presents to the conditions.
 *
 * `ability` is read off the to-hit formula rather than stored: the editor lets
 * you build any expression, so the formula is the only truth, and a finesse
 * `max(STR, DEX)` names two stats and so stays undefined — which is right, since
 * "which one did you use" is a per-swing decision.
 */
export function attackContext(attack: Attack | undefined): AttackContext {
  if (!attack) return {};
  const stats = [...statsIn(attack.bonus, new Set<StatKey>())];
  return {
    tags: attack.tags,
    ability: stats.length === 1 ? stats[0] : undefined,
  };
}

/**
 * Whether a condition holds for an attack.
 *
 * A missing clause is satisfied. A clause the context has no information for is
 * `unknown` — and one decidable failure beats any number of unknowns, so a rider
 * that plainly doesn't apply (Archery on a greatsword) is still hidden even when
 * the ability is ambiguous.
 */
export function conditionEligibility(
  condition: RiderCondition | undefined,
  context: AttackContext,
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

  return unknown ? "unknown" : "yes";
}

/** The eligibility of one collected rider against the attack being rolled. */
export const riderEligibility = (
  rider: ActiveRider,
  context: AttackContext,
): Eligibility => conditionEligibility(rider.rider.requires, context);

/**
 * Drop the riders that plainly don't apply to this attack.
 *
 * The single filter every roll path runs its collected riders through: an
 * ineligible rider is not merely unticked, it isn't offered at all — a longbow
 * shot shouldn't mention Rage.
 */
export const applicableRiders = (
  riders: ActiveRider[],
  context: AttackContext,
): ActiveRider[] => riders.filter((r) => riderEligibility(r, context) !== "no");

/**
 * Whether a rider needs the player to opt in, or applies on its own.
 *
 * Two things force the prompt: an explicit `optional` (a condition that isn't
 * about the weapon — "while raging", "against a favored enemy"), and a weapon
 * condition the attack's tags can't settle. Everything else the sheet can now
 * see for itself, and applies silently.
 */
export const needsOptIn = (
  rider: ActiveRider,
  context: AttackContext,
): boolean => {
  const r = rider.rider;
  const explicit =
    (r.rider === "bonus" || r.rider === "extraDamage") && !!r.optional;
  return explicit || riderEligibility(rider, context) === "unknown";
};
