import React, { useContext, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";

// Whether the app rolls the dice or the player types what they rolled. One
// global switch every roll surface reads, persisted to localStorage so a
// mid-game refresh doesn't silently switch a physical roller to app rolls.
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
