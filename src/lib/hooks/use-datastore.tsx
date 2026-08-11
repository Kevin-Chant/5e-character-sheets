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
  // Put a character into the reactive list before any write confirms; marked
  // unsynced until `save` for its uuid succeeds.
  stageCharacter: (character: Character) => void;
  // Uuids whose staged entry has not yet been confirmed written.
  unsynced: Set<UUID>;
  debounceWait: number;
  characterLoading: boolean;
  setCharacterLoading: (newValue: boolean) => void;
  // True when the backend couldn't be read at all — distinct from an empty
  // list, so the picker can offer retry instead of "create new".
  loadError: boolean;
  // Re-run init and re-read the list (otherwise fetched once per datastore
  // selection); also how a Drive account switch is picked up.
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
      // Functional update: overlapping saves must not clobber each other via a stale snapshot.
      setLocalCharacters((prev) => ({ ...prev, [character.uuid]: character }));
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
    // Optimistic removal; restore and surface the error if the backend delete fails.
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
    // Clear the outgoing store's list before fetching the new one — a Drive
    // init is several round-trips, long enough for autosave to write a
    // stale-labeled local character into Drive otherwise.
    setLocalCharacters({});
    setUnsynced(new Set());
    setLoadError(false);
    if (!datastore) {
      setCharacterLoading(false);
      return;
    }
    setCharacterLoading(true);
    // Guard against a swap mid-fetch: local resolves synchronously while
    // Drive takes a round-trip, so a drive→local swap could otherwise let
    // Drive's promise land last and repopulate the list from the backend the
    // user left.
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
        if (cancelled) return;
        console.error("Failed to initialize datastore", error);
        setLoadError(true);
        setCharacterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datastore, reloadKey]);

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
