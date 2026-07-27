import React, { useContext, useState } from "react";

// Whether the app rolls the dice or the player does.
//
// One top-level switch instead of a per-surface pair of affordances: every roll
// surface (the roll dialog's sections, the initiative prompts) reads this and
// renders either its Roll buttons or a type-what-you-rolled input. Deliberately
// in-memory rather than a persisted setting — it's a table posture, not an
// account preference, and a refresh falling back to app dice is harmless.
export type RollMode = "app" | "manual";

interface RollModeContextData {
  rollMode: RollMode;
  setRollMode: (mode: RollMode) => void;
}

const RollModeContext = React.createContext<RollModeContextData>({
  rollMode: "app",
  setRollMode: () => {},
});

export function RollModeContextProvider(
  props: React.PropsWithChildren<{ initialMode?: RollMode }>,
) {
  const [rollMode, setRollMode] = useState<RollMode>(
    props.initialMode ?? "app",
  );
  return (
    <RollModeContext.Provider value={{ rollMode, setRollMode }}>
      {props.children}
    </RollModeContext.Provider>
  );
}

export const useRollMode = () => useContext(RollModeContext);
