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

// A rest applies through ordinary dispatches (autosaves/syncs/undoes like any
// edit); this provider only holds the preset the panel opened with.
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
          // Re-keys so a rest called while the panel is already open re-opens on the new preset.
          key={preset ? `${preset.kind}:${preset.spansDawn}` : "manual"}
          onClose={() => setOpen(false)}
        />
      )}
    </RestContext.Provider>
  );
}

export const useRest = () => useContext(RestContext);
