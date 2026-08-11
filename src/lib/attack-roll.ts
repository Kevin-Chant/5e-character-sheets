import {
  DamageType,
  DieOperation,
  LeveledSpellLevel,
} from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormulaWithDamage,
  RollRider,
  SaveEffect,
  Spell,
} from "src/lib/types";
import { getSpellSaveDcFormula } from "src/lib/formula";
import { spellConditionFor } from "src/lib/spells/spell-conditions";
import {
  conditionRiders,
  ridersAgainst,
} from "src/lib/play/condition-mechanics";
import { ConditionName } from "src/lib/play/conditions";
import {
  CritSpec,
  DamageRollResult,
  rollDamage,
  rollFormula,
} from "src/lib/roll";
import { ActiveRider } from "src/lib/mechanics/types";
import { extraDamageRiders, spellDamageRiders } from "src/lib/mechanics/riders";
import {
  AttackContext,
  needsOptIn,
  riderEligibility,
} from "src/lib/mechanics/conditions";
import { availableSpellSlots } from "src/lib/rules";
import { abilityRemainingUses } from "src/lib/mechanics/resolve";
import { spellDamageAtLevel } from "src/lib/spells/spell-scaling";

// Resolving an attack's damage: extra-damage riders, slot-powered scaling
// (Divine Smite), and the total. Kept out of the roll dialog component so it's
// unit-testable independent of UI state.

export type ExtraDamageRider = Extract<RollRider, { rider: "extraDamage" }>;
export type SlotScaling = NonNullable<ExtraDamageRider["slot"]>;
export type UsesCost = NonNullable<ExtraDamageRider["uses"]>;

export interface ExtraDamageEntry {
  source: string;
  rider: ExtraDamageRider;
  /** Whether the player must tick this one rather than it applying automatically. */
  optIn: boolean;
}

/**
 * Extra-damage riders for a weapon attack (a fixed `damage` map, no `spell`).
 * `before-attack` riders are excluded (declared with the to-hit roll instead).
 * `context` drops riders the weapon's tags rule out, rather than offering them unticked.
 */
export function extrasForAttack(
  character: Character,
  damage: CustomFormulaWithDamage | undefined,
  spell: Spell | undefined,
  context: AttackContext = {},
): ExtraDamageEntry[] {
  if (spell || !damage) return [];
  return extraDamageRiders(character).flatMap((r) =>
    r.rider.rider === "extraDamage" &&
    r.rider.declareAt !== "before-attack" &&
    riderEligibility(r, context) !== "no"
      ? [
          {
            source: r.source,
            rider: r.rider,
            // A rider that spends a use is always opt-in.
            optIn: needsOptIn(r, context) || !!r.rider.uses,
          },
        ]
      : [],
  );
}

/**
 * Spell-damage extras for this cast, expressed as `ExtraDamageEntry`s so they
 * resolve through the same path as weapon extra damage. Scoped by cast type
 * (`cantrip`/`leveled`/`any`). The rider's flat `value` becomes `amount` —
 * no dice, so it doesn't inflate on a crit.
 */
export function spellExtrasForCast(
  character: Character,
  spell: Spell | undefined,
  isCantrip: boolean,
): ExtraDamageEntry[] {
  if (!spell) return [];
  const scopeMatches = (scope: "cantrip" | "leveled" | "any") =>
    scope === "any" || (scope === "cantrip" ? isCantrip : !isCantrip);
  return spellDamageRiders(character).flatMap((r) => {
    if (r.rider.rider !== "spellDamage" || !scopeMatches(r.rider.scope))
      return [];
    // Re-expressed as an on-hit extraDamage rider so it reuses the existing resolver.
    const rider: ExtraDamageRider = {
      rider: "extraDamage",
      amount: r.rider.value,
      declareAt: "on-hit",
      ...(r.rider.damageType ? { damageType: r.rider.damageType } : {}),
      ...(r.rider.optional ? { optional: true } : {}),
      ...(r.rider.note ? { note: r.rider.note } : {}),
    };
    return [{ source: r.source, rider, optIn: !!r.rider.optional }];
  });
}

// Dice a slot-powered rider contributes at a chosen slot level: `diceAtMin` at
// `minLevel`, one more per level above, capped at `maxDice`.
export const slotDiceCount = (slot: SlotScaling, level: number): number =>
  Math.min(slot.diceAtMin + (level - slot.minLevel), slot.maxDice);

/**
 * Uses left in the pool that powers a `uses` rider, and its index on the sheet.
 * `undefined` when no pool by that title exists on the character.
 */
export function usesPoolState(
  character: Character,
  pool: string,
): { index: number; remaining: number } | undefined {
  const wanted = pool.trim().toLowerCase();
  const index = (character.limitedUseAbilities ?? []).findIndex(
    (a) => a.info.title.trim().toLowerCase() === wanted,
  );
  if (index < 0) return undefined;
  return {
    index,
    remaining: abilityRemainingUses(
      character.limitedUseAbilities[index],
      character,
    ),
  };
}

/** Slot levels at or above `minLevel` that the character still has unspent. */
export function availableSlotLevels(
  character: Character,
  minLevel: number,
): number[] {
  const out: number[] = [];
  for (let lvl = minLevel; lvl <= 9; lvl++)
    if (availableSpellSlots(character, lvl as LeveledSpellLevel) > 0)
      out.push(lvl);
  return out;
}

// Extra-damage riders from the bearer's own active conditions (Divine Favor,
// Absorb Elements). Not weapon-gated. Bearer-side only — target-mark riders
// like Hex stay summary chips, not modelled here.
export function conditionExtras(
  conditions: ConditionName[],
): ExtraDamageEntry[] {
  return conditionRiders(conditions, "damage").flatMap((r) =>
    r.rider.rider === "extraDamage" && r.rider.declareAt !== "before-attack"
      ? [{ source: r.source, rider: r.rider, optIn: !!r.rider.optional }]
      : [],
  );
}

// Extra damage the chosen target's conditions owe this roller (e.g. Hex's
// necrotic d6, for the hexer only).
export function conditionExtrasAgainst(
  targetConditions: { name: ConditionName; from?: string }[],
  selfParticipantId: string | undefined,
): ExtraDamageEntry[] {
  return ridersAgainst(targetConditions, selfParticipantId, "damage").flatMap(
    (r) =>
      r.rider.rider === "extraDamage" && r.rider.declareAt !== "before-attack"
        ? [{ source: r.source, rider: r.rider, optIn: !!r.rider.optional }]
        : [],
  );
}

// Whether the roll dialog has anything to offer for a spell: dice to roll, a
// save, or a condition to apply to targets.
export function rollableSpell(spell: Spell): boolean {
  const m = spell.mechanics;
  if (m && (m.damage || m.damageTable || m.healing)) return true;
  if (m?.resolution?.kind === "save") return true;
  return !!spellConditionFor(spell);
}

// Builds a `SaveEffect` from a spell's `resolution: {kind: "save"}`.
// `onSuccess` only set when there's damage for it to scale.
export function spellSaveEffect(
  character: Character,
  spell?: Spell,
): SaveEffect | undefined {
  const mechanics = spell?.mechanics;
  const res = mechanics?.resolution;
  if (!res || res.kind !== "save") return undefined;
  return {
    dc: getSpellSaveDcFormula(character, spell!.spellcastingClass),
    stat: res.ability,
    ...(mechanics.damage || mechanics.damageTable
      ? { onSuccess: res.halfOnSuccess ? "half" : ("none" as const) }
      : {}),
  };
}

/** The damage map to roll: a spell's level-scaled damage, or the fixed map. */
export function damageMapFor(
  spell: Spell | undefined,
  damage: CustomFormulaWithDamage | undefined,
  castLevel: number,
): CustomFormulaWithDamage {
  if (!spell) return damage ?? {};
  const mechanics = spell.mechanics;
  if (!mechanics || mechanics.healing) return {};
  return spellDamageAtLevel(mechanics, castLevel);
}

export interface ExtraResult {
  source: string;
  total: number;
  dice: number[];
  damageType?: DamageType;
}

export interface DamageResolution {
  parts: DamageRollResult[];
  extras: ExtraResult[];
  total: number;
  critical?: CritSpec;
}

export interface ResolveDamageInput {
  character: Character;
  map: CustomFormulaWithDamage;
  extras: ExtraDamageEntry[];
  /** Sources of the opt-in extras the player ticked. */
  chosen: Set<string>;
  /** Roll-kind riders for `damage` (rerolls, minimum dice, flat bonuses). */
  riders: ActiveRider[];
  crit?: CritSpec;
  /** The slot-powered rider's chosen level and bonus toggle, when active. */
  slot?: { entry: ExtraDamageEntry; level: number; withBonus: boolean };
  /** Folds total-level riders (a minimum, an unconditional bonus) into the sum. */
  applyTotals: (total: number) => number;
}

/**
 * Roll an attack's damage: base dice, then every applicable extra, then
 * total-level riders. The slot-powered extra rolls its dice here but does
 * not spend the slot — that's a separate explicit commit.
 */
export function resolveDamage({
  character,
  map,
  extras,
  chosen,
  riders,
  crit,
  slot,
  applyTotals,
}: ResolveDamageInput): DamageResolution {
  const parts = rollDamage(map, character, riders, crit);

  const results: ExtraResult[] = extras
    .filter(
      ({ source, rider, optIn }) =>
        !rider.slot && (!optIn || chosen.has(source)),
    )
    .map(({ source, rider }) => {
      const dice: number[] = [];
      return {
        source,
        total: rollFormula(rider.amount, character, dice, undefined, crit),
        dice,
        damageType: rider.damageType,
      };
    });

  if (slot?.entry.rider.slot) {
    const scaling = slot.entry.rider.slot;
    const count =
      slotDiceCount(scaling, slot.level) +
      (slot.withBonus && scaling.bonus ? scaling.bonus.dice : 0);
    const dice: number[] = [];
    const total = rollFormula(
      [count, scaling.die, DieOperation.roll],
      character,
      dice,
      undefined,
      crit,
    );
    results.push({
      source: slot.entry.source,
      total,
      dice,
      damageType: slot.entry.rider.damageType,
    });
  }

  const raw =
    parts.reduce((sum, p) => sum + p.total, 0) +
    results.reduce((sum, e) => sum + e.total, 0);

  return { parts, extras: results, total: applyTotals(raw), critical: crit };
}

/** What a successful save leaves of a rolled total. 5e rounds down. */
export const damageOnSave = (
  total: number,
  onSuccess: "half" | "none",
): number => (onSuccess === "half" ? Math.floor(total / 2) : 0);
