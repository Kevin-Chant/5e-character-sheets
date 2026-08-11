import React, { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import CharacterBuilder from "src/components/builder/character-builder";
import { Character } from "src/lib/types";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";

interface CharacterBuilderContextData {
  openBuilder: () => void;
}

const CharacterBuilderContext = createContext<CharacterBuilderContextData>({
  openBuilder: () => {},
});

// On finish, opens the sheet immediately and persists in the background; the
// nav save indicator carries the write's fate.
export function CharacterBuilderProvider({
  children,
}: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const { dispatch, persistCharacter } = useCharacter();
  const navigate = useNavigate();

  const onFinish = (character: Character) => {
    dispatch(loadPersistedCharacter(character));
    setOpen(false);
    navigate("/sheet");
    void persistCharacter(character);
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
