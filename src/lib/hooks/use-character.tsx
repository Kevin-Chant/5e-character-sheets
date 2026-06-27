import React, { useCallback, useContext, useReducer, useState } from "react";
import { Action, resetCharacter } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { Character } from "src/lib/types";
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";
import {
  useHostSharingSession,
  useSharingSessions,
} from "./use-sharing-session";

interface CharacterContextData {
  character: Character | undefined;
  reset: () => void;
  dispatch: (action: Action, dirtyAction?: boolean) => void;
  unsavedChanges: boolean;
  setUnsavedChanges: (isUnsaved: boolean) => void;
  saveError: boolean;
  openSharingSession: () => void;
  closeSharingSession: () => void;
}

export const CharacterContext = React.createContext<CharacterContextData>({
  character: undefined,
  reset: () => {
    console.log("Calling default reset");
  },
  dispatch: () => {
    console.log("Calling default dispatch");
  },
  unsavedChanges: false,
  setUnsavedChanges: () => {
    console.log("Calling default setUnsavedChanges");
  },
  saveError: false,
  openSharingSession: () => {
    console.log("Calling default openSharingSession");
  },
  closeSharingSession: () => {
    console.log("Calling default closeSharingSession");
  },
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, undefined);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const { save, debounceWait } = useDatastore();
  const getCharacter = useCallback<() => Character | undefined>(() => {
    return character;
  }, [character]);

  const { broadcast, getRole } = useSharingSessions();
  const { startSession, endSession } = useHostSharingSession(
    dispatch,
    getCharacter,
  );

  useLazyEffect(
    () => {
      // A character we joined remotely is owned (and persisted) by the host, so
      // we must not write a divergent copy into our own datastore.
      if (character && getRole(character.uuid) !== "remote") {
        save(character)
          .then(() => {
            setUnsavedChanges(false);
            setSaveError(false);
          })
          .catch((error) => {
            // Keep unsavedChanges true so the edit isn't silently treated as
            // persisted; surface the failure via the save indicator.
            console.error("Failed to save character", error);
            setSaveError(true);
          });
      }
    },
    [character],
    debounceWait,
  );

  const dispatchAndBroadcast: React.Dispatch<Action> = (
    action: Action,
    dirtyAction: boolean = true,
    suppressBroadcast: boolean = false,
  ) => {
    dispatch(action);
    setUnsavedChanges(dirtyAction);
    if (character && !suppressBroadcast) {
      broadcast(character.uuid, action, dirtyAction);
    }
  };

  const reset = () => dispatch(resetCharacter());

  const openSharingSession = () => {
    startSession().catch((error) => alert(error));
  };

  const closeSharingSession = () => {
    endSession();
  };

  const providerData = {
    character,
    reset,
    dispatch: dispatchAndBroadcast,
    unsavedChanges,
    setUnsavedChanges,
    saveError,
    openSharingSession,
    closeSharingSession,
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
