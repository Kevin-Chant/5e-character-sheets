import React, { useCallback, useContext, useEffect, useState } from "react";
import { Character, ImportHint } from "src/lib/types";
import { UUID } from "crypto";
import { useDatastoreSelector } from "./use-datastore-selector";
import { missingProvider } from "src/lib/missing-provider";

interface DatastoreContextData {
  saving: boolean;
  characters: Character[];
  save: (character: Character) => Promise<void>;
  load: (uuid: UUID) => Promise<Character | undefined>;
  createCharacter: () => Promise<Character | undefined>;
  importCharacter: (hint?: ImportHint) => Promise<Character | undefined>;
  deleteCharacter: (uuid: UUID) => void;
  // Put a character into the reactive list *now*, before any write confirms.
  // The entry is marked unsynced until a `save` for its uuid succeeds, so the
  // picker and sidebar can show it immediately (a wizard finish, a move
  // between backends) while being honest that storage hasn't caught up yet.
  stageCharacter: (character: Character) => void;
  // Uuids whose staged list entry has not yet been confirmed written to the
  // active backend.
  unsynced: Set<UUID>;
  debounceWait: number;
  characterLoading: boolean;
  setCharacterLoading: (newValue: boolean) => void;
  // True when the backend couldn't be read at all (offline, expired Drive
  // session). Distinct from an empty list: "you have no characters" and "we
  // couldn't find out" look identical on screen but mean opposite things, and
  // only one of them should be offering you a Create button.
  loadError: boolean;
  // Re-run the backend's init and re-read its list. The list is otherwise
  // fetched exactly once per datastore selection, which leaves no way back
  // from a failed load, and no way to pick up an account switch — the Drive
  // datastore object is the same object either side of one.
  refresh: () => void;
}

export const DatastoreContext = React.createContext<DatastoreContextData>({
  saving: false,
  characters: [],
  save: missingProvider("save", Promise.resolve()),
  load: missingProvider("load", Promise.resolve(undefined)),
  createCharacter: missingProvider(
    "createCharacter",
    Promise.resolve(undefined),
  ),
  importCharacter: missingProvider(
    "importCharacter",
    Promise.resolve(undefined),
  ),
  deleteCharacter: missingProvider("deleteCharacter"),
  stageCharacter: missingProvider("stageCharacter"),
  unsynced: new Set(),
  debounceWait: 1000,
  characterLoading: false,
  setCharacterLoading: missingProvider("setCharacterLoading"),
  loadError: false,
  refresh: missingProvider("refresh"),
});

export function DatastoreContextProvider(props: React.PropsWithChildren) {
  const { datastore } = useDatastoreSelector();
  const [saving, setSaving] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<
    Record<UUID, Character>
  >({});
  const [unsynced, setUnsynced] = useState<Set<UUID>>(new Set());
  const [loadError, setLoadError] = useState(false);
  // Bumping this re-runs the fetch effect for the *same* datastore object.
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const markUnsynced = (uuid: UUID) =>
    setUnsynced((prev) => {
      if (prev.has(uuid)) return prev;
      const next = new Set(prev);
      next.add(uuid);
      return next;
    });
  const clearUnsynced = (uuid: UUID) =>
    setUnsynced((prev) => {
      if (!prev.has(uuid)) return prev;
      const next = new Set(prev);
      next.delete(uuid);
      return next;
    });

  const save = async (character: Character) => {
    if (!datastore) return;
    setSaving(true);
    try {
      await datastore.saveToDatastore(character);
      // Functional update: overlapping saves must not clobber each other's
      // list entries via a stale closure snapshot.
      setLocalCharacters((prev) => ({ ...prev, [character.uuid]: character }));
      // The backend now holds this entry, so any staged badge comes down.
      clearUnsynced(character.uuid);
    } finally {
      setSaving(false);
    }
  };

  const stageCharacter = (character: Character) => {
    setLocalCharacters((prev) => ({ ...prev, [character.uuid]: character }));
    markUnsynced(character.uuid);
  };

  const load = async (uuid: UUID) => {
    if (datastore) {
      const char = await datastore.loadFromDatastore(uuid);
      setCharacterLoading(false);
      return char;
    }
    return new Promise<Character | undefined>((resolve) => {
      setCharacterLoading(false);
      resolve(undefined);
    });
  };

  const createCharacter = async (): Promise<Character | undefined> => {
    if (datastore && datastore.createCharacter) {
      setCharacterLoading(true);
      const character = await datastore.createCharacter();
      setCharacterLoading(false);
      return character;
    }
    return new Promise((resolve) => resolve(undefined));
  };

  const importCharacter = async (
    hint?: ImportHint,
  ): Promise<Character | undefined> => {
    if (datastore?.importSharedCharacter) {
      const character = await datastore.importSharedCharacter(hint);
      if (character) {
        setLocalCharacters((prev) => ({
          ...prev,
          [character.uuid]: character,
        }));
      }
      return character;
    }
    return undefined;
  };

  const deleteCharacter = (uuid: UUID) => {
    if (!datastore) return;
    // Optimistic: the row disappears immediately (deleting is near-instant for
    // localStorage and usually succeeds for Drive). If the backend delete does
    // fail, the entry is restored and the failure surfaced — before this, a
    // failed Drive delete pretended to succeed and the character quietly
    // resurrected on the next reload.
    const removed = localCharacters[uuid];
    setLocalCharacters((prev) => {
      const next = { ...prev };
      delete next[uuid];
      return next;
    });
    clearUnsynced(uuid);
    Promise.resolve(datastore.deleteFromDatastore(uuid)).catch((error) => {
      console.error("Failed to delete character", uuid, error);
      if (removed) {
        setLocalCharacters((prev) => ({ ...prev, [uuid]: removed }));
      }
      alert(
        `Couldn't delete ${removed?.name || "the character"} from storage. ` +
          `Check your connection and try again.`,
      );
    });
  };

  useEffect(() => {
    // Drop the outgoing store's list *before* fetching the new one, whatever
    // we're moving to. The sidebar and picker render this list directly, and a
    // Drive init is several network round-trips — long enough to click a
    // localStorage character out of a list captioned "saved in Google Drive"
    // and have autosave write it into Drive. Clear first, populate after.
    setLocalCharacters({});
    // Staged-but-unconfirmed markers belonged to the outgoing store's list.
    setUnsynced(new Set());
    setLoadError(false);
    if (!datastore) {
      // Cleared selection (e.g. joining a remote session): nothing to fetch,
      // and any in-flight spinner must come down with the list it belonged to.
      setCharacterLoading(false);
      return;
    }
    // Mark loading while the (possibly async, e.g. Drive) list is fetched so
    // the picker can show a spinner instead of flashing its empty state.
    setCharacterLoading(true);
    // A swap mid-fetch must not let the store we left win the race. Local
    // resolves synchronously while Drive takes a round-trip, so a drive→local
    // swap would otherwise see Drive's promise land last and repopulate the
    // list with characters from the backend the user just walked away from.
    let cancelled = false;
    datastore
      .initializeDatastore()
      .then(() => {
        if (cancelled) return;
        const charList = datastore.listEntriesInDatastore();
        setLocalCharacters(
          Object.fromEntries(
            charList.map((character) => [character.uuid, character]),
          ),
        );
        setCharacterLoading(false);
      })
      .catch((error) => {
        // A failed init (expired Drive token, offline) must not strand the
        // spinner. It must also not be mistaken for an empty account: the
        // flag is what lets the picker say "couldn't load" and offer a retry
        // instead of inviting a new character into a store it can't read.
        if (cancelled) return;
        console.error("Failed to initialize datastore", error);
        setLoadError(true);
        setCharacterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datastore, reloadKey]);

  // Memoized so consumers only re-render on real state changes; the callbacks
  // above close over `datastore` (a dep) and use functional setState, so the
  // captured instances stay correct between rebuilds.
  const providerData = React.useMemo(
    () => ({
      saving,
      characterLoading,
      setCharacterLoading,
      characters: Object.values(localCharacters),
      save,
      load,
      createCharacter,
      importCharacter,
      deleteCharacter,
      stageCharacter,
      unsynced,
      debounceWait: datastore?.debounceWait || 1000,
      loadError,
      refresh,
    }),
    [
      saving,
      characterLoading,
      localCharacters,
      unsynced,
      datastore,
      loadError,
      refresh,
    ],
  );

  return (
    <DatastoreContext.Provider value={providerData}>
      {props.children}
    </DatastoreContext.Provider>
  );
}

export function useDatastore() {
  return useContext(DatastoreContext);
}
