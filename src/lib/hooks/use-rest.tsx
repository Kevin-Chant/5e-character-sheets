import React, { createContext, useContext, useState } from "react";
import RestDialog from "src/components/rest/rest-dialog";
import { useCharacter } from "src/lib/hooks/use-character";
import { RestPreset } from "src/lib/rest";

interface RestContextData {
  openRest: (preset?: RestPreset) => void;
}

const RestContext = createContext<RestContextData>({
  openRest: () => {},
});

// Mounts the rest panel once and exposes `openRest()`, mirroring
// `LevelUpProvider`. Unlike the level-up wizard this provider holds no state of
// its own beyond the preset the panel opened with: a rest is applied through
// ordinary dispatches on the open character (so it autosaves, syncs and undoes
// like any edit), and the panel keeps its own short-lived phase state.
export function RestProvider({ children }: React.PropsWithChildren) {
  const [preset, setPreset] = useState<RestPreset | undefined>();
  const [open, setOpen] = useState(false);
  const { character } = useCharacter();

  return (
    <RestContext.Provider
      value={{
        openRest: (next?: RestPreset) => {
          setPreset(next);
          setOpen(true);
        },
      }}
    >
      {children}
      {open && character && (
        <RestDialog
          preset={preset}
          // Keyed on the preset so a rest called while the panel is already
          // open re-opens it on the new fork rather than leaving the player
          // looking at the previous one.
          key={preset ? `${preset.kind}:${preset.spansDawn}` : "manual"}
          onClose={() => setOpen(false)}
        />
      )}
    </RestContext.Provider>
  );
}

export const useRest = () => useContext(RestContext);
