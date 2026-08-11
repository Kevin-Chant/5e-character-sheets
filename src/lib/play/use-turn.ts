import { ActionCost } from "src/lib/types";
import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  ECONOMY_SLOTS,
  EconomySlot,
  NOTHING_SPENT,
} from "src/lib/play/encounter";

// Re-exported so the components that render the economy keep importing it from
// the hook they already use.
export { ECONOMY_SLOTS };
export type { EconomySlot };

export const ECONOMY_SLOT_LABELS: Record<EconomySlot, string> = {
  action: "Action",
  bonusAction: "Bonus",
  reaction: "Reaction",
};

function isEconomySlot(cost: ActionCost): cost is EconomySlot {
  return (ECONOMY_SLOTS as ActionCost[]).includes(cost);
}

// What you've spent this turn. Advisory only — nothing blocks an action,
// since the app can't see table rulings (readied actions, Action Surge,
// etc). Lives on the encounter (not component state) so the economy clears
// when the turn comes round again, not when a component remounts.
export function usePlayTurn() {
  const { self, setSlotSpent } = useEncounter();
  const spent = self?.spent ?? NOTHING_SPENT;

  const set = (slot: EconomySlot, value: boolean) => {
    if (!self) return;
    setSlotSpent(self.id, slot, value);
  };

  return {
    spent,
    toggle: (slot: EconomySlot) => set(slot, !spent[slot]),
    // Costs without a slot (`free`, `special`) pass through untouched.
    markSpent: (cost: ActionCost) => {
      if (!isEconomySlot(cost)) return;
      set(cost, true);
    },
    // Manual clear; advancing the turn also does this for whoever's turn
    // is starting.
    endTurn: () => ECONOMY_SLOTS.forEach((slot) => set(slot, false)),
    anySpent: ECONOMY_SLOTS.some((slot) => spent[slot]),
  };
}

export type PlayTurn = ReturnType<typeof usePlayTurn>;
