import React, { createContext, useContext, useState } from "react";
import LevelUpWizard from "src/components/builder/level-up-wizard";
import { Character } from "src/lib/types";
import { replaceCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";

interface LevelUpContextData {
  openLevelUp: () => void;
}

const LevelUpContext = createContext<LevelUpContextData>({
  openLevelUp: () => {},
});

// Applies the finished level-up as a single `replace_character` edit (one
// undo step), unlike the creation builder's `loadPersistedCharacter` which
// resets history.
export function LevelUpProvider({ children }: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { character, dispatch, persistCharacter } = useCharacter();

  const onFinish = (updated: Character) => {
    // Dispatch before persisting so the recorded inverse captures the
    // pre-level-up character; persist runs in the background.
    dispatch(replaceCharacter(updated));
    setOpen(false);
    void persistCharacter(updated);
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
