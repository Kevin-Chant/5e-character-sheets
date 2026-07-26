import React, { useContext, useEffect, useState } from "react";
import { Character } from "src/lib/types";
import { UUID } from "crypto";
import { useDatastoreSelector } from "./use-datastore-selector";
import { missingProvider } from "src/lib/missing-provider";

interface DatastoreContextData {
  saving: boolean;
  characters: Character[];
  save: (character: Character) => Promise<void>;
  load: (uuid: UUID) => Promise<Character | undefined>;
  createCharacter: () => Promise<Character | undefined>;
  importCharacter: () => Promise<Character | undefined>;
  deleteCharacter: (uuid: UUID) => void;
  debounceWait: number;
  characterLoading: boolean;
  setCharacterLoading: (newValue: boolean) => void;
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
  debounceWait: 1000,
  characterLoading: false,
  setCharacterLoading: missingProvider("setCharacterLoading"),
});

export function DatastoreContextProvider(props: React.PropsWithChildren) {
  const { datastore } = useDatastoreSelector();
  const [saving, setSaving] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<
    Record<UUID, Character>
  >({});

  const save = async (character: Character) => {
    if (!datastore) return;
    setSaving(true);
    try {
      await datastore.saveToDatastore(character);
      // Functional update: overlapping saves must not clobber each other's
      // list entries via a stale closure snapshot.
      setLocalCharacters((prev) => ({ ...prev, [character.uuid]: character }));
    } finally {
      setSaving(false);
    }
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

  const importCharacter = async (): Promise<Character | undefined> => {
    if (datastore?.importSharedCharacter) {
      const character = await datastore.importSharedCharacter();
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
    if (datastore) {
      datastore.deleteFromDatastore(uuid);
      setLocalCharacters((prev) => {
        const next = { ...prev };
        delete next[uuid];
        return next;
      });
    }
  };

  useEffect(() => {
    // Drop the outgoing store's list *before* fetching the new one, whatever
    // we're moving to. The sidebar and picker render this list directly, and a
    // Drive init is several network round-trips — long enough to click a
    // localStorage character out of a list captioned "saved in Google Drive"
    // and have autosave write it into Drive. Clear first, populate after.
    setLocalCharacters({});
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
        // spinner: an empty list with the create affordance is recoverable,
        // a permanent "Loading..." is not.
        if (cancelled) return;
        console.error("Failed to initialize datastore", error);
        setCharacterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datastore]);

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
      debounceWait: datastore?.debounceWait || 1000,
    }),
    [saving, characterLoading, localCharacters, datastore],
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
