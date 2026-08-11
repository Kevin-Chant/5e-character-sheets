import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { UUID } from "crypto";
import {
  Action,
  invertAction,
  isNavigationAction,
  isUpdateAction,
  replaceCharacter,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { Character } from "src/lib/types";
import { missingProvider } from "src/lib/missing-provider";
import { isDriveAuthError } from "src/lib/google-auth";
import { writeLastCharacter } from "src/lib/last-character";
import { readLastDatastore } from "src/lib/last-datastore";
import { publishTabEdit, subscribeTabEdits } from "src/lib/tab-sync";

// One reversible edit: the action applied and the action that undoes it.
type HistoryEntry = { action: Action; inverse: Action };

// Cap per-tab in-memory undo history (each entry holds two full field values).
const MAX_HISTORY = 100;
import { useLazyEffect } from "./use-lazy-effect";
import { useDatastore } from "./use-datastore";
import { useDatastoreSelector } from "./use-datastore-selector";
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
  // false when saved; "auth" when a Drive sign-in click is needed; "error" otherwise.
  saveError: false | "auth" | "error";
  saveNow: () => void;
  // Persist an explicit character without blocking the caller (wizard finishes,
  // moves between backends). Stages into the reactive list immediately, resolves
  // true once confirmed (or not ours to persist), false on failed write.
  persistCharacter: (character: Character) => Promise<boolean>;
  // `silent` suppresses the failure alert (used by the auto-bootstrap).
  openSharingSession: (options?: { silent?: boolean }) => Promise<void>;
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
  persistCharacter: missingProvider("persistCharacter", Promise.resolve(false)),
  openSharingSession: missingProvider("openSharingSession"),
  closeSharingSession: missingProvider("closeSharingSession"),
});

export function CharacterContextProvider(props: React.PropsWithChildren) {
  const [character, dispatch] = useReducer(reducer, undefined);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<false | "auth" | "error">(false);
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const characterRef = useRef(character);
  characterRef.current = character;
  // Bumped on every dispatch so an in-flight async save can tell whether a
  // newer edit landed (the reducer clones, so object identity can't tell).
  const editSeq = useRef(0);
  const { save, stageCharacter } = useDatastore();
  const { datastore } = useDatastoreSelector();
  const { settings } = useSettings();
  const getCharacter = useCallback<() => Character | undefined>(() => {
    return character;
  }, [character]);

  const { broadcast, getRole, isBorrowed } = useSharingSessions();
  // Lets the sharing layer keep a session alive for a character this tab isn't
  // looking at (folds arriving edits into storage, serves them to joiners).
  // Read goes to the raw backend, not `useDatastore`'s `load`, because that
  // wrapper's `characterLoading` side effect is only correct for a
  // user-requested load. Write stays `save` so the reactive list/dirty state
  // stay correct for a background fold.
  const storage = useMemo(
    () =>
      datastore
        ? {
            loadStored: (uuid: UUID) => datastore.loadFromDatastore(uuid),
            saveStored: save,
          }
        : undefined,
    [datastore, save],
  );
  const { startSession, endSession } = useHostSharingSession(
    dispatch,
    getCharacter,
    storage,
  );

  // A remote-joined or DM-borrowed character is owned/persisted elsewhere; skip.
  const persist = useCallback(() => {
    if (
      !character ||
      getRole(character.uuid) === "remote" ||
      isBorrowed(character.uuid)
    )
      return;
    const seq = editSeq.current;
    save(character)
      .then(() => {
        // Only clear dirty if no newer edit landed while this write was in flight.
        if (editSeq.current === seq) setUnsavedChanges(false);
        setSaveError(false);
      })
      .catch((error) => {
        console.error("Failed to save character", error);
        setSaveError(isDriveAuthError(error) ? "auth" : "error");
      });
  }, [character, getRole, isBorrowed, save]);

  // Stages into the reactive list immediately rather than blocking the caller
  // on the datastore round-trip.
  const persistCharacter = useCallback(
    async (next: Character): Promise<boolean> => {
      // Same ownership rule as `persist`; report "done" since there's nothing to write.
      if (getRole(next.uuid) === "remote" || isBorrowed(next.uuid)) return true;
      stageCharacter(next);
      setUnsavedChanges(true);
      const seq = editSeq.current;
      try {
        await save(next);
        if (editSeq.current === seq) setUnsavedChanges(false);
        setSaveError(false);
        return true;
      } catch (error) {
        console.error("Failed to save character", error);
        setSaveError(isDriveAuthError(error) ? "auth" : "error");
        return false;
      }
    },
    [getRole, isBorrowed, save, stageCharacter],
  );

  // Debounced autosave. Loading a character leaves unsavedChanges false, so
  // opening a sheet doesn't trigger a redundant write.
  useLazyEffect(
    () => {
      if (settings.autosave && unsavedChanges) persist();
    },
    [character],
    settings.autosaveDelay,
  );

  // Warn before leaving with unsaved work; only armed while dirty.
  useEffect(() => {
    if (!unsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsavedChanges]);

  // Mirror the save indicator in the tab title with a leading dot.
  useEffect(() => {
    document.title = character
      ? `${unsavedChanges ? "● " : ""}${character.name}`
      : "5e Character Sheets";
  }, [character, unsavedChanges]);

  // Remember the sheet for "pick up where you left off" — only sheets this
  // browser owns; a remote or borrowed one belongs to someone else's table.
  useEffect(() => {
    if (!character || !datastore) return;
    if (getRole(character.uuid) === "remote" || isBorrowed(character.uuid))
      return;
    const mode = readLastDatastore();
    if (mode !== "local" && mode !== "drive") return;
    writeLastCharacter({
      uuid: character.uuid,
      name: character.name || "Unnamed",
      mode,
    });
  }, [character?.uuid, character?.name, datastore]);

  // Read synchronously from inside the dispatcher below.
  const unsavedRef = useRef(unsavedChanges);
  unsavedRef.current = unsavedChanges;
  const persistableRef = useRef((_uuid: UUID) => false as boolean);
  persistableRef.current = (uuid: UUID) =>
    getRole(uuid) !== "remote" && !isBorrowed(uuid);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Force-write the outgoing character before another replaces it, since
  // debounced autosave would otherwise drop edits made inside the debounce
  // window when switching sheets. Only on `load_character`, never
  // `reset_character` — a reset means the character was deleted, the
  // datastore was swapped, or the picker was opened, and writing in any of
  // those cases would resurrect/cross-write the sheet.
  const flushOutgoing = useCallback(() => {
    const outgoing = characterRef.current;
    if (!outgoing || !unsavedRef.current) return;
    if (!persistableRef.current(outgoing.uuid)) return;
    saveRef.current(outgoing).catch((error) => {
      console.error("Failed to save the character being closed", error);
      setSaveError(isDriveAuthError(error) ? "auth" : "error");
    });
  }, []);

  // Stable via characterRef, so undo/redo and the keydown effect don't rebind
  // on every character change.
  const dispatchAndBroadcast = useCallback(
    (
      action: Action,
      dirtyAction: boolean = true,
      suppressBroadcast: boolean = false,
      record: boolean = true,
    ) => {
      const isDirty = dirtyAction && action.type !== "load_character";
      // Record only genuine local edits (not remote echoes or replays), so
      // undo/redo covers this tab's own changes. `replace_character`'s
      // inverse carries the whole prior character, so one undo reverts it.
      if (record && isDirty && !suppressBroadcast && characterRef.current) {
        let entry: HistoryEntry | undefined;
        if (isUpdateAction(action))
          entry = {
            action,
            inverse: invertAction(characterRef.current, action),
          };
        else if (action.type === "replace_character")
          entry = {
            action,
            inverse: replaceCharacter(characterRef.current),
          };
        if (entry) {
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), entry!]);
          setFuture([]);
        }
      }
      // Same-uuid load is a re-adoption (e.g. Drive bootstrap discarding solo
      // edits after confirmation), not a sheet switch — skip the flush.
      if (
        action.type === "load_character" &&
        action.payload.uuid !== characterRef.current?.uuid
      ) {
        flushOutgoing();
      }
      if (
        action.type === "load_character" ||
        action.type === "reset_character"
      ) {
        setPast([]);
        setFuture([]);
      }
      editSeq.current++;
      dispatch(action);
      // Dirty only ever rises here: only a completed save (or closing the
      // context) may clear it.
      if (
        action.type === "load_character" ||
        action.type === "reset_character"
      ) {
        setUnsavedChanges(false);
      } else if (isDirty) {
        setUnsavedChanges(true);
      }
      // Loads/resets are tab-local navigation and never broadcast; the uuid
      // used here is the pre-dispatch character's, since a load has already
      // left it.
      if (
        characterRef.current &&
        !suppressBroadcast &&
        !isNavigationAction(action)
      ) {
        broadcast(characterRef.current.uuid, action, isDirty);
        publishTabEdit({
          uuid: characterRef.current.uuid,
          action,
          dirtyAction: isDirty,
          origin: "local",
        });
      }
    },
    [broadcast, flushOutgoing],
  );

  // Edits arriving from this browser's other tabs: applied not-dirty since
  // the originating tab owns the write to storage; marking dirty here would
  // race two tabs' autosaves over the same file. Forwarding into a live realm
  // is the sessions provider's job, not this one's.
  const dispatchAndBroadcastRef = useRef(dispatchAndBroadcast);
  dispatchAndBroadcastRef.current = dispatchAndBroadcast;
  useEffect(
    () =>
      subscribeTabEdits((message) => {
        const open = characterRef.current;
        if (!open || open.uuid !== message.uuid) return;
        dispatchAndBroadcastRef.current(message.action, false, true, false);
      }),
    [],
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
    setUnsavedChanges(false);
    setSaveError(false);
    dispatch(resetCharacter());
  }, []);

  // Reset only on a defined→defined datastore swap, so signing into Drive
  // with a local sheet open closes it instead of autosaving it into Drive.
  // Skipping undefined transitions leaves the remote joiner (no datastore)
  // and session lobby unaffected.
  const previousDatastore = useRef(datastore);
  useEffect(() => {
    const previous = previousDatastore.current;
    previousDatastore.current = datastore;
    if (previous && datastore && previous !== datastore) reset();
  }, [datastore]);

  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  // `silent` is for the automatic Drive bootstrap, which has no UI waiting
  // on it, so it logs instead of throwing.
  const openSharingSession = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      try {
        await startSessionRef.current();
      } catch (error) {
        if (options?.silent) {
          console.warn("Auto live session failed to start", error);
          return;
        }
        throw error;
      }
    },
    [],
  );

  const closeSharingSession = useCallback(() => {
    endSessionRef.current();
  }, []);

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
      persistCharacter,
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
      persistCharacter,
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

// `useCharacter()` with `character` narrowed to non-undefined. Inside the
// sheet a character is always loaded, so this asserts the invariant once
// instead of every component repeating an unreachable `if (!character)`
// branch. A violation surfaces via the ErrorBoundary in `sheet-container.tsx`.
// Use plain `useCharacter()` where "no character" is a real state (nav,
// sheet container, effects).
export function useLoadedCharacter(): CharacterContextData & {
  character: Character;
} {
  const context = useContext(CharacterContext);
  if (!context.character)
    throw new Error(
      "useLoadedCharacter() was called with no character loaded. This " +
        "component renders outside the sheet subtree — use useCharacter() and " +
        "handle the undefined case explicitly.",
    );
  return context as CharacterContextData & { character: Character };
}
