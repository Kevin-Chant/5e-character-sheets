import { FIELD } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { UpdateAction } from "src/lib/hooks/reducers/actions";
import { calculateCustomFormula } from "src/lib/formula";
import { Character, RechargeCriteria } from "src/lib/types";

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
  return TRIGGER_PHRASES[event].some((phrase) => trigger.includes(phrase));
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
    if (!matchesTrigger(ability.recharge, event)) return;
    const total = calculateCustomFormula(ability.maxUses, character);
    const spent = Math.max(0, Math.min(ability.expended, total));
    if (spent === 0) return;
    updates.push(
      updateAt(charPath(FIELD.limitedUseAbilities).at(index).k("expended"), 0),
    );
    changes.push({
      key: `ability:${index}`,
      label: ability.info.title,
      detail: `Restored ${spent} of ${total}`,
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
  return character.limitedUseAbilities.some((ability) =>
    matchesTrigger(ability.recharge, event),
  );
}
