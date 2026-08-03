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
export type UsesCost = NonNullable<ExtraDamageRider["uses"]>;

export interface ExtraDamageEntry {
  source: string;
  rider: ExtraDamageRider;
  /**
   * Whether the player has to tick this one, rather than it applying on its own.
   *
   * Resolved here, once, from the attack's weapon properties — the component
   * shouldn't be re-deciding it. Two things force the tick: a condition that
   * isn't about the weapon at all ("while raging", "with advantage on the
   * attack"), and a weapon condition an untagged attack can't settle.
   */
  optIn: boolean;
}

/**
 * The extra-damage riders that apply to this effect.
 *
 * Gated to weapon attacks — a fixed `damage` map with no `spell` — so a rogue's
 * Sneak Attack can never attach itself to a fireball. `before-attack` riders
 * are excluded because they'd be declared alongside the to-hit roll, not here.
 *
 * `context` narrows further by the weapon itself: a rider whose condition the
 * attack's tags rule out (Rage on a longbow, Sneak Attack with a greatsword) is
 * dropped rather than offered unticked — the dialog shouldn't list a choice that
 * isn't one.
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
            // A rider that costs something is never applied silently, whatever
            // the weapon settles: spending a use has to be the player's word.
            optIn: needsOptIn(r, context) || !!r.rider.uses,
          },
        ]
      : [],
  );
}

/**
 * The spell-damage extras that apply to this cast, as `ExtraDamageEntry`s so
 * they render and resolve through the very same path as a weapon's extra damage
 * (a checkbox for the opt-in ones, a flat "+N — source" line in the result).
 *
 * Scoped by the cast: a cleric's Potent Spellcasting (`cantrip`) shows only on a
 * cantrip, Empowered Evocation (`leveled`) only on a slotted spell. The rider's
 * flat `value` becomes the entry's `amount`, so it carries no dice and never
 * inflates on a crit — the mirror of a flat weapon bonus like Dueling.
 *
 * Only ever collected on the spell path, so it can't touch a weapon; likewise
 * `extrasForAttack` returns nothing for a spell. The two never cross.
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
    // Re-expressed as an on-hit `extraDamage` so the existing UI/resolver apply
    // — a flat modifier, so no crit inflation.
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
 *
 * `undefined` when no pool by that title is on the character — the same "report
 * it, don't silently drain nothing" stance `poolTarget` takes on the write side.
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

// The extra-damage riders the bearer's own active conditions contribute
// (Divine Favor's radiant d4, Absorb Elements' stored d6). Unlike
// `extrasForAttack` these aren't weapon-gated — a self-buff's dice ride
// whatever the bearer swings — and they carry no weapon conditions to
// settle: opt-in iff authored optional. Deliberately *bearer-side only*:
// Hex and Hunter's Mark mark the target, and their dice belong to the
// attacker, which this model can't express (they stay summary chips).
export function conditionExtras(
  conditions: ConditionName[],
): ExtraDamageEntry[] {
  return conditionRiders(conditions, "damage").flatMap((r) =>
    r.rider.rider === "extraDamage" && r.rider.declareAt !== "before-attack"
      ? [{ source: r.source, rider: r.rider, optIn: !!r.rider.optional }]
      : [],
  );
}

// The mirror: extra damage the chosen *target's* conditions owe this roller —
// a mark cashing out (Hex's necrotic d6, for the hexer only). Same
// entry shape, so the dialog itemises and crit-doubles it like any extra.
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
// save to show and announce (Hideous Laughter rolls nothing, but "I cast it
// on Goblin 1" still has to reach the DM), or a condition to put on its
// targets (Bless rolls nothing and asks no save — the announcement *is* the
// cast). The one gate both the spell list and the play board use.
export function rollableSpell(spell: Spell): boolean {
  const m = spell.mechanics;
  if (m && (m.damage || m.damageTable || m.healing)) return true;
  if (m?.resolution?.kind === "save") return true;
  return !!spellConditionFor(spell);
}

// A save-resolution spell's save, in the shape the dialog and the wire speak
// (`SaveEffect`). Spells never carry one directly — the catalog models
// `resolution: {kind: "save"}` — so this is the bridge the weapon path never
// needed. `onSuccess` only when there's damage for it to scale.
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
 * Roll an attack's damage: the weapon/spell's own dice, then every extra in
 * play, then the total-level riders.
 *
 * Extras the sheet can verify apply on their own; `optIn` ones only when ticked.
 * The
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
