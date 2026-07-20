import React, { createContext, useContext, useState } from "react";
import LevelUpWizard from "src/components/builder/level-up-wizard";
import { Character } from "src/lib/types";
import { replaceCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";

interface LevelUpContextData {
  openLevelUp: () => void;
}

const LevelUpContext = createContext<LevelUpContextData>({
  openLevelUp: () => {},
});

// Mounts the guided level-up wizard once and exposes `openLevelUp()`. It
// operates on the currently open character; on finish it applies the leveled
// character as a single recorded `replace_character` edit (so the whole level-up
// is one undo step) and persists it. Unlike the creation builder, which loads a
// brand-new character with `loadPersistedCharacter` (resetting history), the
// level-up edits an existing sheet and must stay on the undo stack.
export function LevelUpProvider({ children }: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { character, dispatch } = useCharacter();
  const { save } = useDatastore();

  const onFinish = async (updated: Character) => {
    // Dispatch before saving so the recorded inverse captures the pre-level-up
    // character (read from the live character ref at dispatch time).
    dispatch(replaceCharacter(updated));
    await save(updated);
    setOpen(false);
  };

  return (
    <LevelUpContext.Provider value={{ openLevelUp: () => setOpen(true) }}>
      {children}
      {open && character && (
        <LevelUpWizard
          character={character}
          onCancel={() => setOpen(false)}
          onFinish={onFinish}
        />
      )}
    </LevelUpContext.Provider>
  );
}

export const useLevelUp = () => useContext(LevelUpContext);
