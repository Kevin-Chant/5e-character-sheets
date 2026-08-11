import React, { useContext, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { planTrigger, TriggerEvent } from "src/lib/play/triggers";

// Starting, advancing and stopping the fight, plus the sheet recharges each
// boundary fires and a one-line receipt of what the last boundary did.
// Recharges auto-apply rather than being confirmed — deterministic and
// undoable like any other edit.
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

  // With no character, still starts/advances combat; just nothing to restore.
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
    // Start-of-turn recharges fire only when the turn that started is ours.
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
