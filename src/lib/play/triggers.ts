import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { UpdateAction } from "src/lib/hooks/reducers/actions";
import { calculateCustomFormula } from "src/lib/formula";
import { rollPoolRestore } from "src/lib/mechanics/resolve";
import { Character, LimitedUseAbility, RechargeCriteria } from "src/lib/types";

// Event-based recharge (Dawn, Initiative) that rest.ts doesn't cover.
// Restores pools only; other trigger effects belong in `Effect`, not here.

export type TriggerEvent = "combatStart" | "startOfTurn" | "endOfTurn" | "dawn";

export const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  combatStart: "Combat starts",
  startOfTurn: "Start of your turn",
  endOfTurn: "End of your turn",
  dawn: "Dawn",
};

// Phrases matched against the free-text RechargeCriteria (RestType | string).
const TRIGGER_PHRASES: Record<TriggerEvent, string[]> = {
  combatStart: [
    "initiative",
    "combat start",
    "start of combat",
    "enter combat",
  ],
  startOfTurn: ["start of your turn", "start of each of your turns"],
  endOfTurn: ["end of your turn", "end of each of your turns"],
  dawn: ["dawn", "daybreak", "sunrise", "each day"],
};

export function matchesTrigger(
  recharge: RechargeCriteria,
  event: TriggerEvent,
): boolean {
  const trigger = (recharge ?? "").toLowerCase();
  if (!trigger) return false;
  // Rest triggers are rest.ts's business, checked first to avoid double-restore.
  if (trigger.includes("short rest") || trigger.includes("long rest")) {
    return false;
  }
  // "Every X days" uses its own countdown (tickDawn), not the plain phrase match.
  if (event === "dawn" && rechargeIntervalDays(recharge) !== undefined) {
    return false;
  }
  return TRIGGER_PHRASES[event].some((phrase) => trigger.includes(phrase));
}

// The X of an "Every X days" recharge, or undefined if not that shape.
export function rechargeIntervalDays(
  recharge: RechargeCriteria,
): number | undefined {
  const match = /every\s+(\d+)\s*days?/i.exec(recharge ?? "");
  if (!match) return undefined;
  const days = Number(match[1]);
  return days >= 1 ? days : undefined;
}

// `days` dawns passing for one ability: a plain "at dawn" recharge restores;
// an "Every X days" interval ticks its countdown and restores when due.
// Undefined if the ability doesn't listen for dawn. Shared by planTrigger
// (one dawn) and planRest (a rest that may span several dawns).
export interface DawnTick {
  updates: UpdateAction[];
  // Uses handed back; 0 when only the countdown moved.
  restored: number;
  newExpended: number;
  rolled: boolean;
  // For an interval ability that hasn't come due: days still to wait.
  daysLeft?: number;
}

export function tickDawn(
  character: Character,
  ability: LimitedUseAbility,
  index: number,
  days: number,
): DawnTick | undefined {
  const path = charPath(FIELD.limitedUseAbilities).at(index);
  const interval = rechargeIntervalDays(ability.recharge);
  if (interval !== undefined) {
    // Countdown only runs while something is spent.
    if (ability.expended <= 0) return undefined;
    const remaining = (ability.daysUntilRecharge ?? interval) - days;
    if (remaining > 0) {
      return {
        updates: [updateAt(path.k("daysUntilRecharge"), remaining)],
        restored: 0,
        newExpended: ability.expended,
        rolled: false,
        daysLeft: remaining,
      };
    }
    const back = rollPoolRestore(ability, character);
    const updates = [updateAt(path.k("expended"), back.newExpended)];
    if (ability.daysUntilRecharge !== undefined)
      updates.push(updateAt(path.k("daysUntilRecharge"), undefined));
    return { updates, ...back };
  }
  if (!matchesTrigger(ability.recharge, "dawn")) return undefined;
  const back = rollPoolRestore(ability, character);
  if (back.restored === 0) return undefined;
  return { updates: [updateAt(path.k("expended"), back.newExpended)], ...back };
}

export interface TriggerChange {
  key: string;
  label: string;
  detail: string;
}

export interface TriggerPlan {
  event: TriggerEvent;
  updates: UpdateAction[];
  changes: TriggerChange[];
}

// Pools already full are left out of both updates and changes.
export function planTrigger(
  character: Character,
  event: TriggerEvent,
): TriggerPlan {
  const updates: UpdateAction[] = [];
  const changes: TriggerChange[] = [];

  character.limitedUseAbilities.forEach((ability, index) => {
    const total = calculateCustomFormula(ability.maxUses, character);
    const entry = { key: `ability:${index}`, label: ability.info.title };

    if (event === "dawn") {
      const tick = tickDawn(character, ability, index, 1);
      if (!tick) return;
      updates.push(...tick.updates);
      changes.push({
        ...entry,
        detail:
          tick.daysLeft !== undefined
            ? `${tick.daysLeft} ${tick.daysLeft === 1 ? "day" : "days"} until recharge`
            : tick.rolled
              ? `Restored ${tick.restored} (rolled) — now ${total - tick.newExpended} of ${total}`
              : `Restored ${tick.restored} of ${total}`,
      });
      return;
    }

    if (!matchesTrigger(ability.recharge, event)) return;
    const { restored, newExpended, rolled } = rollPoolRestore(
      ability,
      character,
    );
    if (restored === 0) return;
    updates.push(
      updateAt(
        charPath(FIELD.limitedUseAbilities).at(index).k("expended"),
        newExpended,
      ),
    );
    changes.push({
      ...entry,
      detail: rolled
        ? `Restored ${restored} (rolled) — now ${total - newExpended} of ${total}`
        : `Restored ${restored} of ${total}`,
    });
  });

  return { event, updates, changes };
}

export function hasTriggerFor(
  character: Character,
  event: TriggerEvent,
): boolean {
  return character.limitedUseAbilities.some(
    (ability) =>
      matchesTrigger(ability.recharge, event) ||
      // "Every X days" abilities also listen for dawn.
      (event === "dawn" &&
        rechargeIntervalDays(ability.recharge) !== undefined),
  );
}
