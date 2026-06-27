import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { readLocalStorage, writeLocalStorage } from "src/lib/local-storage";
import { Character, Datastore } from "src/lib/types";
import { randomUUID } from "src/lib/utils";

const getOrInitializeCharacterFolder = (): Record<UUID, Character> => {
  return readLocalStorage("characters", {});
};

const saveCharacterFolder = (charFolder: Record<UUID, Character>) => {
  writeLocalStorage("characters", charFolder);
};

// Migrate every stored character up to the current schema version, dropping any
// that no longer validate (corrupt). If anything was upgraded, persist the
// folder back so the bump is durable.
const readMigratedFolder = (): Record<UUID, Character> => {
  const charFolder = getOrInitializeCharacterFolder();
  const migrated: Record<UUID, Character> = {};
  let changed = false;
  for (const [uuid, raw] of Object.entries(charFolder)) {
    const result = hydrateCharacter(raw);
    if (!result.ok) {
      console.error(
        "Skipping unloadable stored character",
        uuid,
        result.errors,
      );
      continue;
    }
    migrated[uuid as UUID] = result.character;
    if (result.migrated) changed = true;
  }
  if (changed) saveCharacterFolder(migrated);
  return migrated;
};

const LocalDatastore: Datastore = {
  name: "Local sheet",
  savedSheetsCopy: "Characters saved in your browser:",
  debounceWait: 1000,
  initializeDatastore: () => new Promise((resolve) => resolve()),
  saveToDatastore: (character: Character) => {
    return new Promise((resolve, reject) => {
      try {
        const charFolder = getOrInitializeCharacterFolder();
        charFolder[character.uuid] = character;
        saveCharacterFolder(charFolder);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  },
  loadFromDatastore: (uuid: UUID): Promise<Character | undefined> => {
    return new Promise((resolve) => {
      const charFolder = readMigratedFolder();
      resolve(charFolder[uuid]);
    });
  },
  listEntriesInDatastore: (): Character[] => {
    return Object.values(readMigratedFolder());
  },
  deleteFromDatastore: (uuid: UUID) => {
    const charFolder = getOrInitializeCharacterFolder();
    delete charFolder[uuid];
    saveCharacterFolder(charFolder);
  },
  createCharacter: () => {
    const newDefaultCharacter = structuredClone(defaultCharacter);
    newDefaultCharacter.uuid = randomUUID();
    const charFolder = getOrInitializeCharacterFolder();
    charFolder[newDefaultCharacter.uuid] = newDefaultCharacter;
    saveCharacterFolder(charFolder);
    return new Promise((resolve) => resolve(newDefaultCharacter));
  },
};

export default LocalDatastore;
