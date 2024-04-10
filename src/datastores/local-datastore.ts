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
  saveToDatastore: (character: Character) => {
    const charFolder = getOrInitializeCharacterFolder();
    charFolder[character.uuid] = character;
    saveCharacterFolder(charFolder);
  },
  loadFromDatastore: (uuid: UUID): Character | undefined => {
    const charFolder = getOrInitializeCharacterFolder();
    if (charFolder[uuid]) {
      return charFolder[uuid];
    }
    return undefined;
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
};

export default LocalDatastore;
