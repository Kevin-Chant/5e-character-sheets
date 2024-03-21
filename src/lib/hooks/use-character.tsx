import React, { useContext, useEffect, useReducer, useState } from "react";
import { Action } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { usePrompt } from "src/lib/hooks/use-prompt";
import { Character } from "src/lib/types";
import { defaultCharacter } from "../data/default-data";

interface CharacterContextData {
  character: Character | undefined;
  dispatch: (action: Action, dirtyAction?: boolean) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (isUnsaved: boolean) => void;
}

export const CharacterContext = React.createContext<CharacterContextData>({
  character: undefined,
  dispatch: (action: Action, dirtyAction: boolean = true) => {
    console.log("Calling default dispatch");
  },
  unsavedChanges: false,
  setUnsavedChanges: () => {
    console.log("Calling default setUnsavedChanges");
  },
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, defaultCharacter);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const dispatchWithUnsavedChanges: React.Dispatch<Action> = (
    action: Action,
    dirtyAction: boolean = true
  ) => {
    dispatch(action);
    setUnsavedChanges(dirtyAction);
  };

  // TODO: remove debug statement or turn into dev-only
  useEffect(() => {
    console.log(character);
  }, [character]);

  usePrompt({ isDirty: unsavedChanges });

  const providerData = {
    character,
    dispatch: dispatchWithUnsavedChanges,
    unsavedChanges,
    setUnsavedChanges,
  };

  return (
    <CharacterContext.Provider value={providerData}>
      {props.children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  const contextData = useContext(CharacterContext);
  return contextData;
}
