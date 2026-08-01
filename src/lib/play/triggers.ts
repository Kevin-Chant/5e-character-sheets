import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { UpdateAction } from "src/lib/hooks/reducers/actions";
import { calculateCustomFormula } from "src/lib/formula";
import { rollPoolRestore } from "src/lib/mechanics/resolve";
import { Character, LimitedUseAbility, RechargeCriteria } from "src/lib/types";

// Event recharge — the half of `RechargeCriteria` that rests can't consume.
//
// `rest.ts` handles "Short Rest"/"Long Rest" and deliberately punts everything
// else to a `manualRecharge` follow-up, because "Dawn" and "Initiative" aren't
// things a rest knows about. This is where they land: a pure planner shaped
// exactly like `planRest` (updates + a human account of them), so a trigger
// firing produces ordinary reducer updates that sync, undo and autosave like any
// other edit.
//
// Deliberately *not* general: this restores pools, and nothing else. A trigger
// that needs to do something else is a reason to extend `Effect`, not to grow a
// second effect interpreter here.

export type TriggerEvent =
  // Rolling initiative / the fight beginning.
  | "combatStart"
  // The start of this character's turn.
  | "startOfTurn"
  // The end of this character's turn.
  | "endOfTurn"
  // Daybreak — the recharge a lot of magic items and a few features use.
  | "dawn";

export const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  combatStart: "Combat starts",
  startOfTurn: "Start of your turn",
  endOfTurn: "End of your turn",
  dawn: "Dawn",
};

// Phrases that mean each event, matched against the free-text trigger.
//
// Textual matching for the same reason `rechargesOnRest` uses it:
// `RechargeCriteria` is deliberately open (`RestType | string`), the presets
// cover only the rests, and everything else is whatever the feature's own text
// said. These are the phrasings the catalogs and the PHB actually use.
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
  // A rest trigger is the rest planner's business. Checked first so a homebrew
  // "long rest or dawn" isn't double-restored by both planners.
  if (trigger.includes("short rest") || trigger.includes("long rest")) {
    return false;
  }
  // "Every 7 days" is dawn-shaped but rides its own countdown (see `tickDawn`),
  // so it must not full-restore through the plain phrase match.
  if (event === "dawn" && rechargeIntervalDays(recharge) !== undefined) {
    return false;
  }
  return TRIGGER_PHRASES[event].some((phrase) => trigger.includes(phrase));
}

// The X of an "Every X days" recharge, or undefined when the trigger isn't an
// interval at all. Textual for the same reason the trigger phrases are:
// `RechargeCriteria` is open, and "Every 7 days" is how the item text reads.
export function rechargeIntervalDays(
  recharge: RechargeCriteria,
): number | undefined {
  const match = /every\s+(\d+)\s*days?/i.exec(recharge ?? "");
  if (!match) return undefined;
  const days = Number(match[1]);
  return days >= 1 ? days : undefined;
}

// What `days` dawns passing do to one ability: a plain "at dawn" recharge
// restores; an "Every X days" interval ticks its countdown and restores when it
// comes due. Returns undefined when the ability doesn't listen for dawn, or has
// nothing to do. Shared by `planTrigger` (one dawn at a time, from the play
// surface's Dawn button) and `planRest` (a rest that spans dawn — possibly
// several, under gritty realism's 7-day long rest).
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
    // The countdown runs only while something is spent — "can't be used again
    // until X days have passed" starts from the use, and the first dawn after
    // it is the first tick.
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
  // Whole-value `update_*` actions, ready to dispatch.
  updates: UpdateAction[];
  changes: TriggerChange[];
}

// What this event restores on this character, right now. Pools already full are
// left out of both halves — a receipt listing things that didn't change is how
// the rest panel's first version came to say "Nothing to restore" to a player
// who had plenty to do.
export function planTrigger(
  character: Character,
  event: TriggerEvent,
): TriggerPlan {
  const updates: UpdateAction[] = [];
  const changes: TriggerChange[] = [];

  character.limitedUseAbilities.forEach((ability, index) => {
    const total = calculateCustomFormula(ability.maxUses, character);
    const entry = { key: `ability:${index}`, label: ability.info.title };

    // Dawn covers two shapes — plain "at dawn" and "Every X days" countdowns —
    // so it goes through the shared ticker instead of the generic restore.
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

// Whether anything on this character listens for an event at all — so the UI can
// offer a "Dawn" button only to a character that has something to recharge at
// dawn, rather than showing a control that would always do nothing.
export function hasTriggerFor(
  character: Character,
  event: TriggerEvent,
): boolean {
  return character.limitedUseAbilities.some(
    (ability) =>
      matchesTrigger(ability.recharge, event) ||
      // "Every X days" abilities listen for dawn too — it's their tick.
      (event === "dawn" &&
        rechargeIntervalDays(ability.recharge) !== undefined),
  );
}
