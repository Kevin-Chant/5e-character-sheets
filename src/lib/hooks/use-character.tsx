import React, {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Action,
  invertAction,
  isUpdateAction,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { Character } from "src/lib/types";
import { missingProvider } from "src/lib/missing-provider";

// One reversible edit: the action applied and the action that undoes it.
type HistoryEntry = { action: Action; inverse: Action };

// Undo history is per-tab and in-memory; cap it so a long editing session
// doesn't accumulate unboundedly (each entry holds two full field values).
const MAX_HISTORY = 100;
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";
import { useSettings } from "./use-settings";
import {
  useHostSharingSession,
  useSharingSessions,
} from "./use-sharing-session";

interface CharacterContextData {
  character: Character | undefined;
  reset: () => void;
  dispatch: (action: Action, dirtyAction?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  unsavedChanges: boolean;
  setUnsavedChanges: (isUnsaved: boolean) => void;
  saveError: boolean;
  saveNow: () => void;
  // Start hosting a live session for the open character. `silent` suppresses the
  // failure alert (used by the auto-bootstrap, which should stay solo quietly if
  // the sidecar is unreachable).
  openSharingSession: (options?: { silent?: boolean }) => void;
  closeSharingSession: () => void;
}

export const CharacterContext = React.createContext<CharacterContextData>({
  character: undefined,
  reset: missingProvider("reset"),
  dispatch: missingProvider("dispatch"),
  undo: missingProvider("undo"),
  redo: missingProvider("redo"),
  canUndo: false,
  canRedo: false,
  unsavedChanges: false,
  setUnsavedChanges: missingProvider("setUnsavedChanges"),
  saveError: false,
  saveNow: missingProvider("saveNow"),
  openSharingSession: missingProvider("openSharingSession"),
  closeSharingSession: missingProvider("closeSharingSession"),
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, undefined);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Per-tab undo/redo history of this user's own edits. Read the latest
  // character through a ref so an edit's "before" value is captured reliably.
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const characterRef = useRef(character);
  characterRef.current = character;
  const { save } = useDatastore();
  const { settings } = useSettings();
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

  // Debounced autosave (when enabled). Only persist genuine edits — loading an
  // already-persisted character leaves unsavedChanges false, so opening a sheet
  // doesn't trigger a redundant write. With autosave off, edits stay dirty until
  // a manual save (⌘S / the save button).
  useLazyEffect(
    () => {
      if (settings.autosave && unsavedChanges) persist();
    },
    [character],
    settings.autosaveDelay,
  );

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

  // Stable via characterRef, so undo/redo (and the keydown effect below) don't
  // have to rebind on every character change.
  const dispatchAndBroadcast = useCallback(
    (
      action: Action,
      dirtyAction: boolean = true,
      suppressBroadcast: boolean = false,
      record: boolean = true,
    ) => {
      // Loading an already-persisted character isn't a user edit, so it must
      // not flag unsaved changes (see loadPersistedCharacter).
      const isDirty = dirtyAction && action.type !== "load_character";
      // Record only genuine local edits, so undo/redo covers this tab's own
      // changes; remote echoes (suppressed) and replays (record=false) stay out.
      if (
        record &&
        isDirty &&
        !suppressBroadcast &&
        isUpdateAction(action) &&
        characterRef.current
      ) {
        const entry = {
          action,
          inverse: invertAction(characterRef.current, action),
        };
        setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), entry]);
        setFuture([]);
      }
      // A new character context has no history to carry over.
      if (
        action.type === "load_character" ||
        action.type === "reset_character"
      ) {
        setPast([]);
        setFuture([]);
      }
      dispatch(action);
      setUnsavedChanges(isDirty);
      if (characterRef.current && !suppressBroadcast) {
        broadcast(characterRef.current.uuid, action, isDirty);
      }
    },
    [broadcast],
  );

  // Undo/redo replay a recorded action (broadcasting to peers) without
  // recording a new entry; the moved entry crosses between the two stacks.
  const undo = useCallback(() => {
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, entry]);
    dispatchAndBroadcast(entry.inverse, true, false, false);
  }, [past, dispatchAndBroadcast]);
  const redo = useCallback(() => {
    if (future.length === 0) return;
    const entry = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, entry]);
    dispatchAndBroadcast(entry.action, true, false, false);
  }, [future, dispatchAndBroadcast]);

  // Cmd/Ctrl+S saves; Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y redoes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s" && !e.shiftKey) {
        // Always swallow the browser's save-page dialog; only write if dirty.
        e.preventDefault();
        if (unsavedChanges) persist();
        return;
      }
      // Leave native text undo alone while editing a field (e.g. modal inputs).
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unsavedChanges, persist, undo, redo]);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
    dispatch(resetCharacter());
  }, []);

  // startSession/endSession are recreated by their hook on every render; mirror
  // them in refs so the context-facing wrappers can stay stable.
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  const openSharingSession = useCallback((options?: { silent?: boolean }) => {
    startSessionRef.current().catch((error) => {
      if (!options?.silent) window.alert(error);
      else console.warn("Auto live session failed to start", error);
    });
  }, []);

  const closeSharingSession = useCallback(() => {
    endSessionRef.current();
  }, []);

  // Memoized so consumers re-render on real changes (character, history,
  // dirty/save state) rather than on every provider render.
  const providerData = React.useMemo(
    () => ({
      character,
      reset,
      dispatch: dispatchAndBroadcast,
      undo,
      redo,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      unsavedChanges,
      setUnsavedChanges,
      saveError,
      saveNow: persist,
      openSharingSession,
      closeSharingSession,
    }),
    [
      character,
      reset,
      dispatchAndBroadcast,
      undo,
      redo,
      past.length,
      future.length,
      unsavedChanges,
      saveError,
      persist,
      openSharingSession,
      closeSharingSession,
    ],
  );

  return (
    <CharacterContext.Provider value={providerData}>
      {props.children}
    </CharacterContext.Provider>
  );
}

export function useCharacter() {
  return useContext(CharacterContext);
}
