import React, {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import { Action, resetCharacter } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { Character } from "src/lib/types";
import { defaultCharacter } from "../data/default-data";
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";
import {
  broadcast,
  leaveSharingSession,
  startSharingSession,
} from "../sharing";

interface CharacterContextData {
  character: Character | undefined;
  reset: () => void;
  dispatch: (action: Action, dirtyAction?: boolean) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (isUnsaved: boolean) => void;
  openSharingSession: () => void;
  closeSharingSession: () => void;
  sharingSessionOpen: boolean;
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
  openSharingSession: () => {
    console.log("Calling default openSharingSession");
  },
  closeSharingSession: () => {
    console.log("Calling default closeSharingSession");
  },
  sharingSessionOpen: false,
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const { save, debounceWait } = useDatastore();
  const [sharingSessionOpen, setSharingSessionOpen] = useState(false);

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

  const dispatchAndBroadcast: React.Dispatch<Action> = (
    action: Action,
    dirtyAction: boolean = true,
    suppressBroadcast: boolean = false
  ) => {
    dispatch(action);
    setUnsavedChanges(dirtyAction);
    if (character && !suppressBroadcast) {
      broadcast(character.uuid, action, dirtyAction);
    }
  };

  // TODO: remove debug statement or turn into dev-only
  useEffect(() => {
    console.log(character);
  }, [character]);

  const reset = () => dispatch(resetCharacter());

  // TODO: this is likely not stateful. Need to make sure the newest value of character is available
  // inside the body of startSharingSession
  const getCharacter = useCallback(() => {
    return character;
  }, [character]);

  const openSharingSession = () => {
    startSharingSession(character.uuid, dispatch, getCharacter);
    setSharingSessionOpen(true);
  };

  const closeSharingSession = () => {
    // TODO: close session don't just leave it
    leaveSharingSession(character.uuid);
    setSharingSessionOpen(false);
  };

  const providerData = {
    character,
    reset,
    dispatch: dispatchAndBroadcast,
    unsavedChanges,
    setUnsavedChanges,
    openSharingSession,
    closeSharingSession,
    sharingSessionOpen,
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
