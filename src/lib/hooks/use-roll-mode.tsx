import React, { useContext, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";

// Whether the app rolls the dice or the player does.
//
// One top-level switch instead of a per-surface pair of affordances: every roll
// surface (the roll dialog's sections, the initiative prompts) reads this and
// renders either its Roll buttons or a type-what-you-rolled input. Persisted to
// localStorage: a physical roller is one for the whole campaign, and a mid-game
// refresh (the common way back into a live session) shouldn't silently hand
// their dice to the app. The nav toggle stays the only control — it's a table
// posture, not something to bury in the settings panel.
export type RollMode = "app" | "manual";

const STORAGE_KEY = "rollMode";

const storedRollMode = (): RollMode | undefined => {
  const value = readLocalStorage(STORAGE_KEY);
  return value === "app" || value === "manual" ? value : undefined;
};

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
  const [rollMode, setRollModeState] = useState<RollMode>(
    () => props.initialMode ?? storedRollMode() ?? "app",
  );
  const setRollMode = (mode: RollMode) => {
    setRollModeState(mode);
    writeLocalStorage(STORAGE_KEY, mode);
  };
  return (
    <RollModeContext.Provider value={{ rollMode, setRollMode }}>
      {props.children}
    </RollModeContext.Provider>
  );
}

export const useRollMode = () => useContext(RollModeContext);
