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
  saveNow: () => void;
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
  saveNow: () => {
    console.log("Calling default saveNow");
  },
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

  // Persist the current character now. A character we joined remotely is owned
  // (and persisted) by the host, so we must not write a divergent copy.
  const persist = useCallback(() => {
    if (!character || getRole(character.uuid) === "remote") return;
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
  }, [character, getRole, save]);

  // Debounced autosave. Only persist genuine edits — loading an already-
  // persisted character leaves unsavedChanges false, so opening a sheet doesn't
  // trigger a redundant write.
  useLazyEffect(
    () => {
      if (unsavedChanges) persist();
    },
    [character],
    debounceWait,
  );

  // Cmd/Ctrl+S forces an immediate save, completing the editor lifecycle.
  // Always swallow the browser's save-page dialog; only write if dirty.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        if (unsavedChanges) persist();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unsavedChanges, persist]);

  // Warn before leaving with unsaved work (e.g. a failed save), editor-style.
  // Only armed while dirty so a clean sheet closes without a prompt.
  useEffect(() => {
    if (!unsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedChanges]);

  // Mirror the in-app save indicator in the tab title: a leading dot marks
  // unsaved changes, editor-style.
  useEffect(() => {
    document.title = character
      ? `${unsavedChanges ? "● " : ""}${character.name}`
      : "5e Character Sheets";
  }, [character, unsavedChanges]);

  const dispatchAndBroadcast: React.Dispatch<Action> = (
    action: Action,
    dirtyAction: boolean = true,
    suppressBroadcast: boolean = false,
  ) => {
    // Loading an already-persisted character isn't a user edit, so it must not
    // flag unsaved changes (see loadPersistedCharacter).
    const isDirty = dirtyAction && action.type !== "load_character";
    dispatch(action);
    setUnsavedChanges(isDirty);
    if (character && !suppressBroadcast) {
      broadcast(character.uuid, action, isDirty);
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
    saveNow: persist,
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
