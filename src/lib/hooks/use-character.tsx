import React, { useContext, useEffect, useReducer, useState } from "react";
import { Action, resetCharacter } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { Character } from "src/lib/types";
import { defaultCharacter } from "../data/default-data";
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";

interface CharacterContextData {
  character: Character | undefined;
  reset: () => void;
  dispatch: (action: Action, dirtyAction?: boolean) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (isUnsaved: boolean) => void;
}

export const CharacterContext = React.createContext<CharacterContextData>({
  character: undefined,
  reset: () => {
    console.log("Calling default reset");
  },
  dispatch: (action: Action, dirtyAction: boolean = true) => {
    console.log("Calling default dispatch");
  },
  unsavedChanges: false,
  setUnsavedChanges: () => {
    console.log("Calling default setUnsavedChanges");
  },
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const { save, debounceWait } = useDatastore();

  useLazyEffect(
    () => {
      if (character) {
        save(character);
        setUnsavedChanges(false);
      }
    },
    [character],
    debounceWait
  );

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

  const reset = () => dispatch(resetCharacter());

  const providerData = {
    character,
    reset,
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
  return useContext(CharacterContext);
}
