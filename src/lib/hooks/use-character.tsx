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
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";
import { useHostSharingSession } from "./use-sharing-session";

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
  const [character, dispatch] = useReducer(reducer, undefined);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const { save, debounceWait } = useDatastore();
  const [sharingSessionOpen, setSharingSessionOpen] = useState(false);
  // TODO: this is likely not stateful. Need to make sure the newest value of character is available
  // inside the body of useHostSharingSession
  const getCharacter = useCallback<() => Character | undefined>(() => {
    return character;
  }, [character]);

  const { broadcast, startSession, endSession } = useHostSharingSession(
    dispatch,
    getCharacter
  );

  useLazyEffect(
    () => {
      console.log("Running lazy effect to save character to datastore");
      if (character) {
        save(character).then(() => {
          setUnsavedChanges(false);
        });
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
      broadcast(action, dirtyAction);
    }
  };

  // TODO: remove debug statement or turn into dev-only
  useEffect(() => {
    console.log(character);
  }, [character]);

  const reset = () => dispatch(resetCharacter());

  const openSharingSession = () => {
    startSession().then(() => {
      setSharingSessionOpen(true);
    });
  };

  const closeSharingSession = () => {
    endSession().then((res) => {
      setSharingSessionOpen(res);
    });
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
