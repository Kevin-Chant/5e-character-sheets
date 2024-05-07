import React, {
  DependencyList,
  EffectCallback,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Action } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { usePrompt } from "src/lib/hooks/use-prompt";
import { Character, Datastore } from "src/lib/types";
import { defaultCharacter } from "../data/default-data";
import { CharacterContextProvider, useCharacter } from "./use-character";
import { UUID } from "crypto";
import { useDatastoreSelector } from "./use-datastore-selector";

interface DatastoreContextData {
  saving: boolean;
  characters: Character[];
  save: (character: Character) => Promise<void>;
  load: (uuid: UUID) => Promise<Character | undefined>;
  createCharacter: () => Promise<Character | undefined>;
  deleteCharacter: (uuid: UUID) => void;
  debounceWait: number;
  characterLoading: boolean;
  setCharacterLoading: (newValue: boolean) => void;
}

export const DatastoreContext = React.createContext<DatastoreContextData>({
  saving: false,
  characters: [],
  save: (character: Character) => {
    return new Promise((resolve) => {
      console.log("Calling default save");
      resolve();
    });
  },
  load: (uuid: UUID) => {
    return new Promise((resolve) => {
      console.log("Calling default load");

      resolve(undefined);
    });
  },
  createCharacter: () => {
    console.log("Calling default createCharacter");
    return new Promise((resolve) => resolve(undefined));
  },
  deleteCharacter: (uuid: UUID) => {
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
    console.log("Running save function within useDatastore");
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

  const deleteCharacter = (uuid: UUID) => {
    if (datastore) {
      datastore.deleteFromDatastore(uuid);
      const newLocalCharacters = JSON.parse(JSON.stringify(localCharacters));
      delete newLocalCharacters[uuid];
      setLocalCharacters(newLocalCharacters);
    }
  };

  // TODO: remove debug statement or turn into dev-only
  useEffect(() => {
    if (!datastore) return;
    datastore.initializeDatastore().then(() => {
      const charList = datastore.listEntriesInDatastore();
      console.log("Listing entries resulted in", charList.length, "characters");
      setLocalCharacters(
        Object.fromEntries(
          charList.map((character) => [character.uuid, character])
        )
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
