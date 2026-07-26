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

// What you've spent this turn.
//
// Deliberately **advisory**: nothing here blocks an action. A turn lasts about a
// minute, and the app can't see the table — a DM ruling, a readied action, an
// Action Surge — so a hard budget would be wrong more often than it was useful.
// It marks what it saw you do and lets you correct it by clicking.
//
// This started as component state, on the reasoning that a turn isn't a fact
// about the character. That's still true — but it *is* a fact about the
// encounter, which is where it lives now, so a turn's economy clears when the
// turn actually comes round again rather than when a component happens to
// remount. Callers never changed: the shape below is the same one they used when
// it was a `useState`.
export function usePlayTurn() {
  const { self, setSlotSpent } = useEncounter();
  const spent = self?.spent ?? NOTHING_SPENT;

  const set = (slot: EconomySlot, value: boolean) => {
    if (!self) return;
    setSlotSpent(self.id, slot, value);
  };

  return {
    spent,
    // Clicking a slot corrects the record in either direction — the board's
    // guess is a convenience, not an authority.
    toggle: (slot: EconomySlot) => set(slot, !spent[slot]),
    // Using something off the board marks its slot. Costs without a slot
    // (`free`, `special`) pass through untouched.
    markSpent: (cost: ActionCost) => {
      if (!isEconomySlot(cost)) return;
      set(cost, true);
    },
    // Clearing by hand, for a turn taken outside the initiative order (or for
    // the player who just wants the slots back). Advancing the turn does this on
    // its own, for whoever's turn is starting.
    endTurn: () => ECONOMY_SLOTS.forEach((slot) => set(slot, false)),
    anySpent: ECONOMY_SLOTS.some((slot) => spent[slot]),
  };
}

export type PlayTurn = ReturnType<typeof usePlayTurn>;
