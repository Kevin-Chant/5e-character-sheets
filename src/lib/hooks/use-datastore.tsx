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
import { debounce } from "lodash";
import { UUID } from "crypto";
import { useDatastoreSelector } from "./use-datastore-selector";

interface DatastoreContextData {
  saving: boolean;
  characters: Character[];
  save: (character: Character) => void;
  load: (uuid: UUID) => Character | undefined;
  deleteCharacter: (uuid: UUID) => void;
}

export const DatastoreContext = React.createContext<DatastoreContextData>({
  saving: false,
  characters: [],
  save: (character: Character) => {
    console.log("Calling default save");
  },
  load: (uuid: UUID) => {
    console.log("Calling default load");
    return undefined;
  },
  deleteCharacter: (uuid: UUID) => {
    console.log("Calling default deleteCharacter");
  },
});

export function DatastoreContextProvider(props: React.PropsWithChildren) {
  const { datastore } = useDatastoreSelector();
  const [saving, setSaving] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<
    Record<UUID, Character>
  >({});
  const setSaved = useCallback(
    debounce(() => {
      setSaving(false);
    }, 300),
    [setSaving]
  );

  const save = (character: Character) => {
    if (datastore) {
      setSaving(true);
      datastore.saveToDatastore(character);
      const newLocalCharacters = JSON.parse(JSON.stringify(localCharacters));
      newLocalCharacters[character.uuid] = character;
      setLocalCharacters(newLocalCharacters);
      setTimeout(setSaved, 500);
    }
  };

  const load = (uuid: UUID) => {
    if (datastore) {
      return datastore.loadFromDatastore(uuid);
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

  // TODO: remove debug statement or turn into dev-only
  useEffect(() => {
    console.log("Datastore changed", datastore);
    const charList = datastore?.listEntriesInDatastore() || [];
    setLocalCharacters(
      Object.fromEntries(
        charList.map((character) => [character.uuid, character])
      )
    );
  }, [datastore]);

  // usePrompt({ isDirty: unsavedChanges });

  const providerData = {
    saving,
    characters: Object.values(localCharacters),
    save,
    load,
    deleteCharacter,
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
