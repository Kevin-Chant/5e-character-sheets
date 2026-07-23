import {
  DamageType,
  DieOperation,
  LeveledSpellLevel,
} from "src/lib/data/data-definitions";
import {
  Character,
  CustomFormulaWithDamage,
  RollRider,
  Spell,
} from "src/lib/types";
import {
  CritSpec,
  DamageRollResult,
  rollDamage,
  rollFormula,
} from "src/lib/roll";
import { ActiveRider } from "src/lib/mechanics/types";
import { extraDamageRiders } from "src/lib/mechanics/riders";
import { availableSpellSlots } from "src/lib/rules";
import { spellDamageAtLevel } from "src/lib/spells/spell-scaling";

// ---------------------------------------------------------------------------
// Resolving an attack's damage.
//
// This is the arithmetic behind the roll dialog's damage section: which extra
// damage is in play, what a slot-powered rider (Divine Smite) contributes at a
// chosen level, and what the whole thing totals. It lives outside the component
// so it can be reasoned about and tested directly — `EffectControls` had grown
// to 447 lines and seven `useState` hooks, and every new rule (crits, save DCs,
// opt-in bonuses, slot scaling) was landing in the same function.
//
// The component keeps what's genuinely UI: which boxes are ticked, which slot
// level is selected, and the last result to display.
// ---------------------------------------------------------------------------

export type ExtraDamageRider = Extract<RollRider, { rider: "extraDamage" }>;
export type SlotScaling = NonNullable<ExtraDamageRider["slot"]>;

export interface ExtraDamageEntry {
  source: string;
  rider: ExtraDamageRider;
}

/**
 * The extra-damage riders that apply to this effect.
 *
 * Gated to weapon attacks — a fixed `damage` map with no `spell` — so a rogue's
 * Sneak Attack can never attach itself to a fireball. `before-attack` riders
 * are excluded because they'd be declared alongside the to-hit roll, not here.
 */
export function extrasForAttack(
  character: Character,
  damage: CustomFormulaWithDamage | undefined,
  spell: Spell | undefined,
): ExtraDamageEntry[] {
  if (spell || !damage) return [];
  return extraDamageRiders(character).flatMap((r) =>
    r.rider.rider === "extraDamage" && r.rider.declareAt !== "before-attack"
      ? [{ source: r.source, rider: r.rider }]
      : [],
  );
}

// Dice a slot-powered rider contributes at a chosen slot level: `diceAtMin` at
// `minLevel`, one more per level above, capped at `maxDice`.
export const slotDiceCount = (slot: SlotScaling, level: number): number =>
  Math.min(slot.diceAtMin + (level - slot.minLevel), slot.maxDice);

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
 * Roll an attack's damage: the weapon/spell's own dice, then every extra in
 * play, then the total-level riders.
 *
 * Always-on extras apply unconditionally; opt-in ones only when ticked. The
 * slot-powered extra rolls its display dice here but does *not* spend the slot
 * — that's an explicit, separate commit, so re-rolling stays free.
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
      ({ source, rider }) =>
        !rider.slot && (!rider.optional || chosen.has(source)),
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
