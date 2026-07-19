import React, { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import CharacterBuilder from "src/components/builder/CharacterBuilder";
import { Character } from "src/lib/types";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";

interface CharacterBuilderContextData {
  openBuilder: () => void;
}

const CharacterBuilderContext = createContext<CharacterBuilderContextData>({
  openBuilder: () => {},
});

// Mounts the guided builder once and exposes `openBuilder()` so every entry
// point (the picker card, the sidebar button) runs the same flow. On finish it
// persists the assembled character and opens its sheet.
export function CharacterBuilderProvider({
  children,
}: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { save } = useDatastore();
  const { dispatch } = useCharacter();
  const navigate = useNavigate();

  const onFinish = async (character: Character) => {
    await save(character);
    dispatch(loadPersistedCharacter(character));
    setOpen(false);
    navigate("/sheet");
  };

  return (
    <CharacterBuilderContext.Provider
      value={{ openBuilder: () => setOpen(true) }}
    >
      {children}
      {open && (
        <CharacterBuilder onCancel={() => setOpen(false)} onFinish={onFinish} />
      )}
    </CharacterBuilderContext.Provider>
  );
}

export const useCharacterBuilder = () => useContext(CharacterBuilderContext);
