import React, { createContext, useContext, useState } from "react";
import RestDialog from "src/components/rest/rest-dialog";
import { useCharacter } from "src/lib/hooks/use-character";

interface RestContextData {
  openRest: () => void;
}

const RestContext = createContext<RestContextData>({
  openRest: () => {},
});

// Mounts the rest panel once and exposes `openRest()`, mirroring
// `LevelUpProvider`. Unlike the level-up wizard this provider holds no state of
// its own: a rest is applied through ordinary dispatches on the open character
// (so it autosaves, syncs and undoes like any edit), and the panel keeps its own
// short-lived phase state.
export function RestProvider({ children }: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { character } = useCharacter();

  return (
    <RestContext.Provider value={{ openRest: () => setOpen(true) }}>
      {children}
      {open && character && <RestDialog onClose={() => setOpen(false)} />}
    </RestContext.Provider>
  );
}

export const useRest = () => useContext(RestContext);
