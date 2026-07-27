import React, { useContext, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { planTrigger, TriggerEvent } from "src/lib/play/triggers";

// Starting, advancing and stopping the fight — plus the sheet recharges each
// boundary fires and a one-line receipt of what the last boundary did.
//
// Lifted out of the initiative rail so it isn't the only door: the player's
// "End turn" ends their own turn for real (that call is theirs alone — unlike
// everything else on the board it needs no table ruling), and both surfaces
// advance the same fight the same way.
//
// Recharges are auto-applied rather than confirmed: they're deterministic (a
// pool goes back to full), they undo in one step like any edit, and a
// confirmation dialog on every turn boundary would cost more than the
// certainty is worth.
interface TurnFlowData {
  // What the last turn boundary did, shown until the next one replaces it.
  receipt: string | null;
  beginCombat: () => void;
  advance: () => void;
  stopCombat: () => void;
}

const TurnFlowContext = React.createContext<TurnFlowData>({
  receipt: null,
  beginCombat: () => {},
  advance: () => {},
  stopCombat: () => {},
});

export function TurnFlowProvider(props: React.PropsWithChildren) {
  const { character, dispatch } = useCharacter();
  const { start, end, next, self } = useEncounter();
  const [receipt, setReceipt] = useState<string | null>(null);

  // Fire an event's recharges and describe what it restored. Recharges belong
  // to a sheet; running the order without one still starts combat and still
  // advances turns — there is simply nothing of yours to restore.
  const fireTrigger = (event: TriggerEvent): string[] => {
    if (!character) return [];
    const plan = planTrigger(character, event);
    plan.updates.forEach((update) => dispatch(update));
    return plan.changes.map((change) => change.label);
  };

  const beginCombat = () => {
    start();
    const restored = fireTrigger("combatStart");
    setReceipt(restored.length ? `Regained: ${restored.join(", ")}` : null);
  };

  const advance = () => {
    const step = next();
    if (!step) return;
    const notes: string[] = [];
    if (step.expired.length) notes.push(`Ended: ${step.expired.join(", ")}`);
    // Start-of-turn recharges are this character's, so they only fire when the
    // turn that started is ours. Somebody else's turn beginning is not an
    // event on our sheet.
    if (step.active && step.active.id === self?.id) {
      const restored = fireTrigger("startOfTurn");
      if (restored.length) notes.push(`Regained: ${restored.join(", ")}`);
    }
    setReceipt(notes.length ? notes.join(" · ") : null);
  };

  const stopCombat = () => {
    end();
    setReceipt(null);
  };

  return (
    <TurnFlowContext.Provider
      value={{ receipt, beginCombat, advance, stopCombat }}
    >
      {props.children}
    </TurnFlowContext.Provider>
  );
}

export const useTurnFlow = () => useContext(TurnFlowContext);
