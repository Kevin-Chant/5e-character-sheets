import {
  DieOperation,
  Operation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";
import {
  AbilityAction,
  AmountExpr,
  CustomFormula,
  Effect,
  isDieExpression,
} from "src/lib/types";

// Authoring helpers for homebrew ability mechanics: the editor UI speaks
// `SimpleAmount` (a number, N d M + K, or "player picks"), which round-trips
// to the subset of `AmountExpr` a homebrew author needs. Catalog-only shapes
// (chosen slot level, per-level tables, class-level addends) parse to null and
// the editor shows them read-only rather than mangling them.

export type SimpleAmount =
  | { mode: "number"; value: number }
  | { mode: "dice"; count: number; die: StandardDie; bonus: number }
  | { mode: "chosenAmount" }
  // "Spend N, roll N of these dice" (Healing Light-style pools).
  | { mode: "chosenDice"; die: StandardDie };

export function parseSimpleAmount(expr: AmountExpr): SimpleAmount | null {
  if ("chosenAmount" in expr) return { mode: "chosenAmount" };
  if ("chosenAmountDice" in expr)
    return { mode: "chosenDice", die: expr.chosenAmountDice };
  if (!("fixed" in expr) || expr.plusLevelOf) return null;
  return parseSimpleFormula(expr.fixed);
}

function parseSimpleFormula(formula: CustomFormula): SimpleAmount | null {
  if (typeof formula === "number") return { mode: "number", value: formula };
  const die = parseDieExpression(formula);
  if (die) return { ...die, bonus: 0 };
  if (
    typeof formula === "object" &&
    !Array.isArray(formula) &&
    "operation" in formula &&
    formula.operation === Operation.addition &&
    "operands" in formula &&
    formula.operands.length === 2
  ) {
    const [a, b] = formula.operands;
    const dieName = parseDieExpression(a);
    if (dieName && typeof b === "number") return { ...dieName, bonus: b };
  }
  return null;
}

function parseDieExpression(
  formula: CustomFormula,
): { mode: "dice"; count: number; die: StandardDie } | null {
  if (
    isDieExpression(formula) &&
    typeof formula[1] === "string" &&
    formula[2] === DieOperation.roll
  )
    return { mode: "dice", count: formula[0], die: formula[1] as StandardDie };
  return null;
}

export function buildAmount(simple: SimpleAmount): AmountExpr {
  switch (simple.mode) {
    case "number":
      return { fixed: simple.value };
    case "chosenAmount":
      return { chosenAmount: true };
    case "chosenDice":
      return { chosenAmountDice: simple.die };
    case "dice": {
      const dice: CustomFormula = [simple.count, simple.die, DieOperation.roll];
      return {
        fixed:
          simple.bonus !== 0
            ? { operation: Operation.addition, operands: [dice, simple.bonus] }
            : dice,
      };
    }
  }
}

// The choice pickers an action's effects imply. Recomputed on every edit so
// authors never manage `choose` by hand: a restore/expend-slot effect without
// a pinned level needs a level picker, a chosen amount needs the number
// input.
export function deriveChoose(
  effects: Effect[],
): AbilityAction["choose"] | undefined {
  const needsRestore = effects.some(
    (ef) => ef.effect === "restoreSlot" && ef.level === undefined,
  );
  const needsExpend = effects.some(
    (ef) => ef.effect === "expendSlot" && ef.level === undefined,
  );
  const needsAmount = effects.some(
    (ef) =>
      "amount" in ef &&
      ("chosenAmount" in ef.amount || "chosenAmountDice" in ef.amount),
  );
  const choose: AbilityAction["choose"] = {};
  if (needsRestore) choose.slotLevel = "toRestore";
  else if (needsExpend) choose.slotLevel = "toExpend";
  if (needsAmount) choose.amount = "uses";
  return choose.slotLevel || choose.amount ? choose : undefined;
}

export function newHomebrewAction(): AbilityAction {
  return {
    id: randomUUID(),
    name: "New action",
    cost: "action",
    effects: [{ effect: "spendUses", amount: { fixed: 1 } }],
  };
}

// A sensible starting shape per effect kind, for the editor's kind picker.
export function defaultEffectOfKind(kind: Effect["effect"]): Effect {
  switch (kind) {
    case "heal":
    case "gainTempHp":
      return { effect: kind, amount: { fixed: 5 } };
    case "spendUses":
    case "restoreUses":
      return { effect: kind, amount: { fixed: 1 } };
    case "expendSlot":
    case "restoreSlot":
      return { effect: kind };
    case "spendHitDie":
      return { effect: kind, die: StandardDie.d8 };
    case "roll":
      return {
        effect: kind,
        label: "Roll",
        amount: { fixed: [1, StandardDie.d6, DieOperation.roll] },
      };
    case "remind":
      return { effect: kind, note: "" };
  }
}

export const EFFECT_KIND_LABELS: Record<Effect["effect"], string> = {
  heal: "Heal HP",
  gainTempHp: "Grant temporary HP",
  spendUses: "Spend uses",
  restoreUses: "Restore uses",
  expendSlot: "Expend a spell slot",
  restoreSlot: "Restore a spell slot",
  spendHitDie: "Spend a hit die",
  roll: "Roll dice (display only)",
  remind: "Show a reminder",
};
