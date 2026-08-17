import { charPath, updateAt } from "src/lib/cursor";
import {
  DieOperation,
  FIELD,
  LeveledSpellLevel,
  Operation,
} from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { UpdateAction } from "src/lib/hooks/reducers/actions";
import { formulaHasDice, rollFormula } from "src/lib/roll";
import {
  availableSpellSlots,
  expendedSpellSlots,
  getHpFormula,
  levelInClass,
  remainingHitDice,
  totalSpellSlots,
} from "src/lib/rules";
import { Character, CustomFormula, LimitedUseAbility } from "src/lib/types";
import { AbilityAction, AmountExpr, Effect } from "./types";

// Write-side interpreter: turns effect data into whole-value reducer updates.
// Two passes: `actionBlocked` (render time) checks pool/slot/HP state without
// resolving dice, since rolling during render would break determinism;
// `resolveAction` (click time) rolls what needs rolling and emits updates,
// reminders, and display rolls.

export interface EffectContext {
  character: Character;
  // Required for spendUses/restoreUses effects.
  ability?: LimitedUseAbility;
  abilityIndex?: number;
  chosenLevel?: LeveledSpellLevel;
  chosenAmount?: number;
  // Physical roller's entered totals, in `manualRollAsks` order, consumed in
  // place of rolling. The entered total is authoritative; nothing is added.
  manualTotals?: number[];
}

export interface ResolvedEffects {
  updates: UpdateAction[];
  reminders: string[];
  // Display-only rolls (a `roll` effect, or a `heal` whose amount had dice).
  rolls: { label: string; total: number; dice: number[] }[];
}

// ---------------------------------------------------------------------------
// Shared state readers

export function maxHpValue(character: Character): number {
  return calculateCustomFormula(
    character.maxHp ?? getHpFormula(character),
    character,
  );
}

export function abilityMaxUses(
  ability: LimitedUseAbility,
  character: Character,
): number {
  return calculateCustomFormula(ability.maxUses, character);
}

export function abilityRemainingUses(
  ability: LimitedUseAbility,
  character: Character,
): number {
  return Math.max(0, abilityMaxUses(ability, character) - ability.expended);
}

// One firing of a pool's `recharge`. Without a `restore` formula, everything
// comes back (the 5e default); with one ("regains 1d3 charges at dawn") the
// amount is rolled here so both planners (rests and event triggers) get a
// settled number.
export interface PoolRestore {
  restored: number;
  newExpended: number;
  // Whether dice decided the number, vs. a constant restore.
  rolled: boolean;
}

export function rollPoolRestore(
  ability: LimitedUseAbility,
  character: Character,
): PoolRestore {
  const spent = Math.max(
    0,
    Math.min(ability.expended, abilityMaxUses(ability, character)),
  );
  if (ability.restore === undefined)
    return { restored: spent, newExpended: 0, rolled: false };
  const amount = Math.max(0, rollFormula(ability.restore, character));
  const restored = Math.min(spent, amount);
  return {
    restored,
    newExpended: spent - restored,
    rolled: formulaHasDice(ability.restore),
  };
}

// Re-exported from rules.ts so mechanics interpreters and their tests keep
// one import site.
export { expendedSpellSlots, totalSpellSlots };

// The pool a `spendUses`/`restoreUses` targets and its list index. A `pool`
// title names a different ability to drain (cross-pool spend, e.g. Cutting
// Words spending Bardic Inspiration); absent, it's the owning ability from
// the context. Returns undefined when the named pool isn't on the character.
function poolTarget(
  effect: { pool?: string },
  ctx: EffectContext,
): { ability: LimitedUseAbility; index: number } | undefined {
  if (effect.pool) {
    const wanted = effect.pool.trim().toLowerCase();
    const index = (ctx.character.limitedUseAbilities ?? []).findIndex(
      (a) => a.info.title.trim().toLowerCase() === wanted,
    );
    if (index < 0) return undefined;
    return { ability: ctx.character.limitedUseAbilities[index], index };
  }
  if (!ctx.ability || ctx.abilityIndex === undefined) return undefined;
  return { ability: ctx.ability, index: ctx.abilityIndex };
}

// ---------------------------------------------------------------------------
// Amounts

// The static value of an amount, or undefined when it needs rolling or a
// pending user choice. Blocked-checks use this; execution uses `rollAmount`.
export function staticAmount(
  expr: AmountExpr,
  ctx: EffectContext,
): number | undefined {
  if ("chosenAmount" in expr) return ctx.chosenAmount;
  if ("chosenAmountDice" in expr) return undefined; // dice — rolled at execution
  if ("chosenLevel" in expr) return ctx.chosenLevel;
  if ("byChosenLevel" in expr)
    return ctx.chosenLevel !== undefined
      ? expr.byChosenLevel[ctx.chosenLevel]
      : undefined;
  if (formulaHasDice(expr.fixed)) return undefined;
  return (
    calculateCustomFormula(expr.fixed, ctx.character) +
    classLevelPart(expr, ctx)
  );
}

// levelMultiplier (default 1) × the level in the named class.
function classLevelPart(
  expr: { plusLevelOf?: string; levelMultiplier?: number },
  ctx: EffectContext,
): number {
  if (!expr.plusLevelOf) return 0;
  return (
    (expr.levelMultiplier ?? 1) * levelInClass(expr.plusLevelOf, ctx.character)
  );
}

// Whether resolving this amount would roll dice (needs a typed-in total on
// real dice).
function amountRollsDice(expr: AmountExpr, ctx: EffectContext): boolean {
  if ("chosenAmountDice" in expr) return (ctx.chosenAmount ?? 0) > 0;
  if ("fixed" in expr) return formulaHasDice(expr.fixed);
  return false;
}

// Resolve an amount at execution time, rolling any dice.
function rollAmount(
  expr: AmountExpr,
  ctx: EffectContext,
  dice: number[],
): number | undefined {
  if (ctx.manualTotals && amountRollsDice(expr, ctx))
    return Math.max(0, ctx.manualTotals.shift() ?? 0);
  if ("chosenAmountDice" in expr) {
    if (!ctx.chosenAmount) return 0;
    return rollFormula(
      [ctx.chosenAmount, expr.chosenAmountDice, DieOperation.roll],
      ctx.character,
      dice,
    );
  }
  if (!("fixed" in expr)) return staticAmount(expr, ctx);
  return (
    rollFormula(expr.fixed, ctx.character, dice) + classLevelPart(expr, ctx)
  );
}

// One entry the physical roller owes before effects can resolve.
// `resolveEffects` consumes `ctx.manualTotals` in exactly this order.
export interface ManualRollAsk {
  label: string;
  // For a `fixed` amount with a class-level addend, the addend is folded in.
  formula: CustomFormula;
}

export function manualRollAsks(
  effects: Effect[],
  ctx: EffectContext,
): ManualRollAsk[] {
  const asks: ManualRollAsk[] = [];
  for (const effect of effects) {
    // A table's die is always rolled, so it always owes the physical roller
    // an entry — there's no amount to inspect.
    if (effect.effect === "table") {
      asks.push({
        label: effect.label,
        formula: [1, effect.die, DieOperation.roll],
      });
      continue;
    }
    if (!("amount" in effect) || !amountRollsDice(effect.amount, ctx)) continue;
    const label =
      effect.effect === "heal"
        ? "Healing"
        : effect.effect === "gainTempHp"
          ? "Temporary HP"
          : effect.effect === "roll"
            ? effect.label
            : "Amount";
    asks.push({ label, formula: askFormula(effect.amount, ctx) });
  }
  return asks;
}

function askFormula(expr: AmountExpr, ctx: EffectContext): CustomFormula {
  if ("chosenAmountDice" in expr)
    return [
      Math.max(1, ctx.chosenAmount ?? 1),
      expr.chosenAmountDice,
      DieOperation.roll,
    ];
  if (!("fixed" in expr)) return 0;
  const part = classLevelPart(expr, ctx);
  if (part === 0) return expr.fixed;
  return { operation: Operation.addition, operands: [expr.fixed, part] };
}

// ---------------------------------------------------------------------------
// Gating

const slotLevelOf = (
  effect: { level?: LeveledSpellLevel },
  ctx: EffectContext,
): LeveledSpellLevel | undefined => effect.level ?? ctx.chosenLevel;

// Why this effect can't fire right now, or undefined when it can. Checks
// state only, never rolls.
export function effectBlocked(
  effect: Effect,
  ctx: EffectContext,
): string | undefined {
  const { character } = ctx;
  switch (effect.effect) {
    case "heal":
      return character.currHp >= maxHpValue(character)
        ? "Already at full HP"
        : undefined;
    case "gainTempHp":
    case "roll":
    case "remind":
      return undefined;
    case "spendUses": {
      const target = poolTarget(effect, ctx);
      if (!target) return effect.pool ? `No ${effect.pool}` : "No ability pool";
      const amount = staticAmount(effect.amount, ctx);
      if (amount === undefined || amount <= 0) return "Choose an amount";
      return abilityRemainingUses(target.ability, character) < amount
        ? "Not enough uses left"
        : undefined;
    }
    case "restoreUses": {
      const target = poolTarget(effect, ctx);
      if (!target) return effect.pool ? `No ${effect.pool}` : "No ability pool";
      return target.ability.expended <= 0 ? "Pool already full" : undefined;
    }
    case "expendSlot": {
      const level = slotLevelOf(effect, ctx);
      if (level === undefined) return "Choose a slot level";
      return availableSpellSlots(character, level) < 1
        ? "No unspent slot at this level"
        : undefined;
    }
    case "restoreSlot": {
      const level = slotLevelOf(effect, ctx);
      if (level === undefined) return "Choose a slot level";
      return expendedSpellSlots(character, level) < 1
        ? "No expended slot at this level to restore"
        : undefined;
    }
    case "spendHitDie":
      return remainingHitDice(character, effect.die) < 1
        ? "No hit dice remaining"
        : undefined;
  }
}

// Why this action is disabled (first blocking effect), or undefined.
export function actionBlocked(
  action: AbilityAction,
  ctx: EffectContext,
): string | undefined {
  for (const effect of action.effects) {
    const reason = effectBlocked(effect, ctx);
    if (reason) return reason;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Execution

// Resolve effects into dispatches. Assumes the caller checked
// `actionBlocked`; a still-blocked effect throws rather than corrupt state.
export function resolveEffects(
  effects: Effect[],
  ctx: EffectContext,
): ResolvedEffects {
  const { character } = ctx;
  const out: ResolvedEffects = { updates: [], reminders: [], rolls: [] };

  const usesCursor = (index: number) =>
    charPath(FIELD.limitedUseAbilities).at(index).k("expended");
  const slotCursor = (level: LeveledSpellLevel) =>
    charPath(FIELD.spellSlots).k(level).k("expended");

  // Running `expended`, keyed by pool index, so a batch touching multiple
  // pools (cross-pool spend) reads through prior changes in the same batch
  // rather than the stale character.
  const expendedByIndex = new Map<number, number>();
  const currentExpended = (index: number, fallback: number) =>
    expendedByIndex.get(index) ?? fallback;

  // Whether dice decided this amount, including a manual entry (which leaves
  // `dice` empty but still gets a display roll and table report).
  const diceDecided = (expr: AmountExpr, dice: number[]) =>
    dice.length > 0 || (!!ctx.manualTotals && amountRollsDice(expr, ctx));

  for (const effect of effects) {
    const blocked = effectBlocked(effect, ctx);
    if (blocked)
      throw new Error(`Effect ${effect.effect} blocked at resolve: ${blocked}`);
    switch (effect.effect) {
      case "heal": {
        const dice: number[] = [];
        const amount = rollAmount(effect.amount, ctx, dice) ?? 0;
        const healed = Math.min(
          maxHpValue(character),
          character.currHp + Math.max(0, amount),
        );
        if (diceDecided(effect.amount, dice))
          out.rolls.push({ label: "Healing", total: amount, dice });
        out.updates.push(updateAt(charPath(FIELD.currHp), healed));
        break;
      }
      case "gainTempHp": {
        const dice: number[] = [];
        const amount = rollAmount(effect.amount, ctx, dice) ?? 0;
        if (diceDecided(effect.amount, dice))
          out.rolls.push({ label: "Temporary HP", total: amount, dice });
        // Temp HP don't stack — only an improvement applies.
        if (amount > character.tempHp)
          out.updates.push(updateAt(charPath(FIELD.tempHp), amount));
        break;
      }
      case "spendUses": {
        const { ability, index } = poolTarget(effect, ctx)!;
        const amount = rollAmount(effect.amount, ctx, []) ?? 0;
        const next = currentExpended(index, ability.expended) + amount;
        expendedByIndex.set(index, next);
        out.updates.push(updateAt(usesCursor(index), next));
        break;
      }
      case "restoreUses": {
        const { ability, index } = poolTarget(effect, ctx)!;
        const amount = rollAmount(effect.amount, ctx, []) ?? 0;
        const next = Math.max(
          0,
          currentExpended(index, ability.expended) - amount,
        );
        expendedByIndex.set(index, next);
        out.updates.push(updateAt(usesCursor(index), next));
        break;
      }
      case "expendSlot": {
        const level = slotLevelOf(effect, ctx)!;
        out.updates.push(
          updateAt(slotCursor(level), expendedSpellSlots(character, level) + 1),
        );
        break;
      }
      case "restoreSlot": {
        const level = slotLevelOf(effect, ctx)!;
        out.updates.push(
          updateAt(slotCursor(level), expendedSpellSlots(character, level) - 1),
        );
        break;
      }
      case "spendHitDie":
        out.updates.push(
          updateAt(
            charPath(FIELD.expendedHitDice).k(effect.die),
            (character.expendedHitDice[effect.die] || 0) + 1,
          ),
        );
        break;
      case "roll": {
        const dice: number[] = [];
        const total = rollAmount(effect.amount, ctx, dice) ?? 0;
        out.rolls.push({ label: effect.label, total, dice });
        break;
      }
      case "table": {
        const dice: number[] = [];
        const rolled = ctx.manualTotals
          ? Math.max(0, ctx.manualTotals.shift() ?? 0)
          : rollFormula([1, effect.die, DieOperation.roll], character, dice);
        const row =
          effect.rows.find((r) => rolled <= r.upTo) ??
          effect.rows[effect.rows.length - 1];
        out.rolls.push({ label: effect.label, total: rolled, dice });
        if (row) out.reminders.push(`${rolled}: ${row.note}`);
        break;
      }
      case "remind":
        out.reminders.push(effect.note);
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Choice options for the UI

// Slot levels an action's picker should offer; per-level blocking is
// reported by `actionBlocked` on the current choice.
export function slotLevelOptions(
  action: AbilityAction,
  character: Character,
): LeveledSpellLevel[] {
  if (!action.choose?.slotLevel) return [];
  const max = action.choose.slotLevelMax ?? 9;
  const out: LeveledSpellLevel[] = [];
  for (let lvl = 1; lvl <= max; lvl++)
    if (totalSpellSlots(character, lvl as LeveledSpellLevel) > 0)
      out.push(lvl as LeveledSpellLevel);
  return out;
}
