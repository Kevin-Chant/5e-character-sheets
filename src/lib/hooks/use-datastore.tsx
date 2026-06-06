import React, { useContext, useEffect, useState } from "react";
import { Character } from "src/lib/types";
import { UUID } from "crypto";
import { useDatastoreSelector } from "./use-datastore-selector";

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
  save: () => {
    return new Promise((resolve) => {
      console.log("Calling default save");
      resolve();
    });
  },
  load: () => {
    return new Promise((resolve) => {
      console.log("Calling default load");

      resolve(undefined);
    });
  },
  createCharacter: () => {
    console.log("Calling default createCharacter");
    return new Promise((resolve) => resolve(undefined));
  },
  importCharacter: () => {
    console.log("Calling default importCharacter");
    return new Promise((resolve) => resolve(undefined));
  },
  deleteCharacter: () => {
    console.log("Calling default deleteCharacter");
  },
  debounceWait: 1000,
  characterLoading: false,
  setCharacterLoading: () => {
    console.log("Calling default setCharacterLoading");
  },
});

export function DatastoreContextProvider(props: React.PropsWithChildren) {
  const { datastore } = useDatastoreSelector();
  const [saving, setSaving] = useState(false);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<
    Record<UUID, Character>
  >({});

  const save = async (character: Character) => {
    if (datastore) {
      setSaving(true);
      await datastore.saveToDatastore(character);
      const newLocalCharacters = JSON.parse(JSON.stringify(localCharacters));
      newLocalCharacters[character.uuid] = character;
      setLocalCharacters(newLocalCharacters);
      setSaving(false);
    } else {
      return new Promise<void>((resolve) => resolve(undefined));
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
      const newLocalCharacters = JSON.parse(JSON.stringify(localCharacters));
      delete newLocalCharacters[uuid];
      setLocalCharacters(newLocalCharacters);
    }
  };

  useEffect(() => {
    if (!datastore) {
      // Cleared selection (e.g. joining a remote session): drop the old list.
      setLocalCharacters({});
      return;
    }
    datastore.initializeDatastore().then(() => {
      const charList = datastore.listEntriesInDatastore();
      setLocalCharacters(
        Object.fromEntries(
          charList.map((character) => [character.uuid, character]),
        ),
      );
    });
  }, [datastore]);

  const providerData = {
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
  };

  return (
    <DatastoreContext.Provider value={providerData}>
      {props.children}
    </DatastoreContext.Provider>
  );
}

export function useDatastore() {
  return useContext(DatastoreContext);
}
