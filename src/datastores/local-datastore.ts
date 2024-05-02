import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, Datastore } from "src/lib/types";

const getOrInitializeCharacterFolder = (): Record<UUID, Character> => {
  const charFolder = window.localStorage.getItem("characters");
  return JSON.parse(charFolder || "{}");
};

const saveCharacterFolder = (charFolder: Record<UUID, Character>) => {
  window.localStorage.setItem("characters", JSON.stringify(charFolder));
};

const LocalDatastore: Datastore = {
  name: "Local sheet",
  debounceWait: 1000,
  initializeDatastore: () => {},
  saveToDatastore: (character: Character) => {
    return new Promise((resolve, _reject) => {
      const charFolder = getOrInitializeCharacterFolder();
      charFolder[character.uuid] = character;
      saveCharacterFolder(charFolder);
      resolve();
    });
  },
  loadFromDatastore: (uuid: UUID): Promise<Character | undefined> => {
    return new Promise((resolve, _reject) => {
      const charFolder = getOrInitializeCharacterFolder();
      if (charFolder[uuid]) {
        resolve(charFolder[uuid]);
      }
      resolve(undefined);
    });
  },
  listEntriesInDatastore: (): Character[] => {
    const charFolder = getOrInitializeCharacterFolder();
    return Object.values(charFolder);
  },
  deleteFromDatastore: (uuid: UUID) => {
    const charFolder = getOrInitializeCharacterFolder();
    delete charFolder[uuid];
    saveCharacterFolder(charFolder);
  },
  createCharacter: () => {
    const newDefaultCharacter = defaultCharacter;
    newDefaultCharacter.uuid = crypto.randomUUID() as UUID;
    const charFolder = getOrInitializeCharacterFolder();
    charFolder[newDefaultCharacter.uuid] = newDefaultCharacter;
    saveCharacterFolder(charFolder);
    return newDefaultCharacter;
  },
};

export default LocalDatastore;
