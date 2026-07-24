import { charPath, updateAt } from "src/lib/cursor";
import {
  DieOperation,
  FIELD,
  LeveledSpellLevel,
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
import { Character, LimitedUseAbility } from "src/lib/types";
import { AbilityAction, AmountExpr, Effect } from "./types";

// The write-side interpreter: turns effect data into ordinary whole-value
// reducer updates (dispatched by the caller), so every mechanic syncs over
// live sessions and undoes exactly like a manual edit. Two passes with one
// contract between them:
//
// - `actionBlocked` (render time) answers "is this usable?" WITHOUT resolving
//   dice — `fixed` amounts may contain dice, and rolling during render would
//   break determinism. Blocked checks therefore only consult pool/slot/HP
//   *state*, never random amounts.
// - `resolveAction` (click time) rolls what needs rolling and emits updates,
//   reminders, and display rolls.

export interface EffectContext {
  character: Character;
  // The owning limited-use ability and its index — required for the
  // spendUses/restoreUses effects.
  ability?: LimitedUseAbility;
  abilityIndex?: number;
  chosenLevel?: LeveledSpellLevel;
  chosenAmount?: number;
}

export interface ResolvedEffects {
  updates: UpdateAction[];
  reminders: string[];
  // Display-only rolls made while resolving (a `roll` effect, or a `heal`
  // whose amount contained dice).
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

// Slot accounting lives in rules.ts (which clamps a stored `expended` to the
// current total); re-exported here so the mechanics interpreters and their
// tests keep one import site.
export { expendedSpellSlots, totalSpellSlots };

// The pool a `spendUses`/`restoreUses` targets and its list index. A `pool`
// title names a *different* ability to drain (cross-pool spend — Cutting Words
// spends Bardic Inspiration); absent, it's the owning ability the context
// carries. Returns `undefined` when the named pool isn't on the character, so
// the gate can report it rather than silently draining nothing.
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

// The static value of an amount, or undefined when it can't be known without
// rolling (a `fixed` formula containing dice) or without a pending user
// choice. Blocked-checks use this; execution uses `rollAmount`.
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

// The class-level addend of a fixed amount: levelMultiplier (default 1) × the
// level in the named class.
function classLevelPart(
  expr: { plusLevelOf?: string; levelMultiplier?: number },
  ctx: EffectContext,
): number {
  if (!expr.plusLevelOf) return 0;
  return (
    (expr.levelMultiplier ?? 1) * levelInClass(expr.plusLevelOf, ctx.character)
  );
}

// Resolve an amount at execution time, rolling any dice.
function rollAmount(
  expr: AmountExpr,
  ctx: EffectContext,
  dice: number[],
): number | undefined {
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

// ---------------------------------------------------------------------------
// Gating

const slotLevelOf = (
  effect: { level?: LeveledSpellLevel },
  ctx: EffectContext,
): LeveledSpellLevel | undefined => effect.level ?? ctx.chosenLevel;

// Why this effect can't fire right now, or undefined when it can. Checks
// state only — never rolls (see the module contract above).
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
// `actionBlocked`; a still-blocked effect throws rather than corrupting
// state, since blocked-at-click means the UI and state disagree.
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

  // Running `expended`, keyed by pool index — a batch may touch more than one
  // pool now (a cross-pool spend), and later effects must read through what an
  // earlier one already changed, not the stale character, so spend+restore of
  // the same pool composes correctly.
  const expendedByIndex = new Map<number, number>();
  const currentExpended = (index: number, fallback: number) =>
    expendedByIndex.get(index) ?? fallback;

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
        if (dice.length > 0)
          out.rolls.push({ label: "Healing", total: amount, dice });
        out.updates.push(updateAt(charPath(FIELD.currHp), healed));
        break;
      }
      case "gainTempHp": {
        const dice: number[] = [];
        const amount = rollAmount(effect.amount, ctx, dice) ?? 0;
        if (dice.length > 0)
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
      case "remind":
        out.reminders.push(effect.note);
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Choice options for the UI

// Slot levels an action's picker should offer (the character has slots at the
// level at all; per-level blocking is reported by `actionBlocked` on the
// current choice).
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
