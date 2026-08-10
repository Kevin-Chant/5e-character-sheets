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

// Undo history is per-tab and in-memory; cap it so a long editing session
// doesn't accumulate unboundedly (each entry holds two full field values).
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
  // false when the last save landed; "auth" when it failed because the Google
  // Drive session needs a sign-in click (so the indicator can offer one
  // instead of a generic warning); "error" for everything else.
  saveError: false | "auth" | "error";
  saveNow: () => void;
  // Persist an explicit character in the background — for flows that just
  // dispatched a whole character (wizard finishes, moves between backends) and
  // shouldn't block their UI on the write. Stages the entry into the reactive
  // character list immediately, then resolves true once the backend confirms
  // (or the character isn't ours to persist), false on a failed write — with
  // the same dirty/error indicators as autosave either way.
  persistCharacter: (character: Character) => Promise<boolean>;
  // Start hosting a live session for the open character. `silent` suppresses the
  // failure alert (used by the auto-bootstrap, which should stay solo quietly if
  // the sidecar is unreachable).
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
  // Per-tab undo/redo history of this user's own edits. Read the latest
  // character through a ref so an edit's "before" value is captured reliably.
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const characterRef = useRef(character);
  characterRef.current = character;
  // Bumped on every dispatch. Lets an async save know whether a newer edit
  // landed while its write was in flight — the reducer clones the character,
  // so object identity can't answer that.
  const editSeq = useRef(0);
  const { save, stageCharacter } = useDatastore();
  const { datastore } = useDatastoreSelector();
  const { settings } = useSettings();
  const getCharacter = useCallback<() => Character | undefined>(() => {
    return character;
  }, [character]);

  const { broadcast, getRole, isBorrowed } = useSharingSessions();
  const { startSession, endSession } = useHostSharingSession(
    dispatch,
    getCharacter,
  );

  // Persist the current character now. A character we joined remotely is owned
  // (and persisted) by the host, so we must not write a divergent copy — and a
  // sheet borrowed from a DM in a play session is the same situation with a
  // different transport.
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
        // Only clear the dirty flag if no newer edit landed while the write
        // was in flight — clearing unconditionally would erase that edit's
        // unsaved marker.
        if (editSeq.current === seq) setUnsavedChanges(false);
        setSaveError(false);
      })
      .catch((error) => {
        // Keep unsavedChanges true so the edit isn't silently treated as
        // persisted; surface the failure via the save indicator — and say
        // *which* failure, because "sign in again" and "check your
        // connection" call for different clicks.
        console.error("Failed to save character", error);
        setSaveError(isDriveAuthError(error) ? "auth" : "error");
      });
  }, [character, getRole, isBorrowed, save]);

  // Persist an explicit character without blocking on the write. The wizards
  // and the between-backend moves dispatch a whole character and used to hold
  // their modal (or the picker) hostage until the datastore round-trip came
  // back — seconds, on Drive. Instead: the entry is staged into the reactive
  // list immediately, the dirty flag goes up, and the same indicators autosave
  // uses report the write's fate.
  const persistCharacter = useCallback(
    async (next: Character): Promise<boolean> => {
      // Same ownership rule as `persist`: a remote or borrowed sheet is
      // persisted by its host, so there's nothing for us to write — report
      // "done" rather than failure.
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

  // Remember the sheet for the front door's "pick up where you left off". Only
  // sheets this browser can actually reopen: a remotely joined character is the
  // host's, and a borrowed one belongs to a DM whose table may be over, so
  // offering either as a shortcut would be offering a dead link.
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
      // A `replace_character` (e.g. a level-up) is recorded too — its inverse is
      // another replace carrying the current whole character, so one undo
      // reverts the entire change.
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
      // A new character context has no history to carry over.
      if (
        action.type === "load_character" ||
        action.type === "reset_character"
      ) {
        setPast([]);
        setFuture([]);
      }
      editSeq.current++;
      dispatch(action);
      // Dirty only ever *rises* here: a non-dirty dispatch landing while edits
      // are unsaved (a cross-tab apply, a remote echo) must not clear the flag
      // — only a completed save may, or closing the character context, which
      // retires the flag with the sheet it described.
      if (
        action.type === "load_character" ||
        action.type === "reset_character"
      ) {
        setUnsavedChanges(false);
      } else if (isDirty) {
        setUnsavedChanges(true);
      }
      // Only genuine edits travel, and now on *both* transports. Loads and
      // resets are tab-local navigation, and the uuid here is the
      // **pre-dispatch** character's — the one a load has already left. That
      // asymmetry (tab-sync excluded them, the realm didn't) is how a
      // `load_character` carrying a whole *other* sheet got published into a
      // realm it had nothing to do with: the outgoing uuid still matched the
      // session, so the guard in `broadcast` waved it through and every peer
      // loaded somebody else's character. `replace_character` is a real edit —
      // a rest, a level-up — and still travels.
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
    [broadcast],
  );

  // Edits arriving from this browser's other tabs. Applied like a remote edit
  // (no re-publish, no undo entry) and **not dirty** — the tab the edit was
  // made in owns the write to storage, and marking it dirty here would race
  // two tabs' autosaves against each other over the same file. The next local
  // edit in this tab saves the whole character, sibling edits included.
  //
  // A `"local"`-origin message is forwarded into this tab's sharing session,
  // if one is open for that character: that's what lets an edit made in a
  // session-less sibling tab still reach remote peers. `"remote"`-origin
  // messages are applied and go no further — see `tab-sync.ts` for the loop
  // argument.
  const dispatchAndBroadcastRef = useRef(dispatchAndBroadcast);
  dispatchAndBroadcastRef.current = dispatchAndBroadcast;
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;
  useEffect(
    () =>
      subscribeTabEdits((message) => {
        const open = characterRef.current;
        if (!open || open.uuid !== message.uuid) return;
        dispatchAndBroadcastRef.current(message.action, false, true, false);
        if (message.origin === "local") {
          broadcastRef.current(
            message.uuid,
            message.action,
            message.dirtyAction,
          );
        }
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
    // Closing the character retires its dirty/error state with it. These drive
    // the nav save indicator, the "● " title prefix and the beforeunload
    // guard, all of which would otherwise keep warning about unsaved work on a
    // character that is no longer open — and can no longer be saved, since
    // `persist` no-ops without one.
    setUnsavedChanges(false);
    setSaveError(false);
    dispatch(resetCharacter());
  }, []);

  // Swapping storage backends closes the open character. This lives here rather
  // than at the call sites because it was a convention there, and conventions
  // get missed: the Drive sign-in path (`google-auth-initializer`) sets the
  // datastore without resetting, so signing into Drive with a local sheet open
  // left it open — and autosave then wrote that local character into Drive.
  //
  // Only a defined→defined swap resets. Clearing on *any* change would break
  // the remote joiner, who is deliberately handed a character with no datastore
  // at all (see the guard in `sheet-container.tsx`), and the session lobby,
  // which adopts a datastore from `undefined` while the lobby is on screen.
  const previousDatastore = useRef(datastore);
  useEffect(() => {
    const previous = previousDatastore.current;
    previousDatastore.current = datastore;
    if (previous && datastore && previous !== datastore) reset();
  }, [datastore]);

  // startSession/endSession are recreated by their hook on every render; mirror
  // them in refs so the context-facing wrappers can stay stable.
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  // Resolves when the session is live and **rejects with a readable message**
  // when it isn't, so the caller can render an error inline. `silent` is for
  // the automatic Drive bootstrap, which starts a session nobody asked for —
  // there's no UI waiting on it, so it logs instead of surfacing.
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

// `useCharacter()` with `character` narrowed to non-undefined.
//
// Inside the sheet a character is always loaded — `sheet-container.tsx` mounts
// `CharSheet` only when there is one, and `charsheet.tsx` gates its whole
// subtree on it again. Every component below that was nonetheless repeating
// `if (!character) return <></>` purely to satisfy the type-checker: ~37 copies
// of a branch that can't be taken, and whose behaviour if it ever *were* taken
// (a panel silently vanishing) is worse than the bug it hides.
//
// So the invariant is asserted once, here. A violation means a component was
// mounted outside the sheet, which is a wiring mistake rather than a data
// problem — and it surfaces as the `ErrorBoundary` in `sheet-container.tsx`
// naming it, with the raw-JSON download and a way back to the character list,
// instead of an empty rectangle with no explanation.
//
// Use plain `useCharacter()` where "no character" is a real state to render:
// the nav's presence roster, the sheet container itself, effects that no-op.
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
