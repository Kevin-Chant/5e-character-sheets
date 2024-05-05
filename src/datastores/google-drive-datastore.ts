import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  createFile,
  deleteFile,
  getFileContents,
  listFiles,
  updateFile,
} from "src/lib/google-drive";
import { Character, Datastore } from "src/lib/types";

// TODO: maybe move local cache to separate file & share across datastores
let knownFilenames: Record<UUID, string> = {};
let localCache: Record<UUID, Character> = {};

const populateKnownFilenames = async () => {
  const fileList = (await listFiles()).map((file) => [file.name, file.id]);
  console.log("Populating known file names with list", fileList);
  knownFilenames = Object.fromEntries(fileList);
};

const readThroughCache = async (uuid: UUID): Promise<Character | undefined> => {
  if (localCache[uuid]) {
    return localCache[uuid];
  } else if (!knownFilenames[uuid]) {
    return undefined;
  }
  const contents = await getFileContents(knownFilenames[uuid]);
  if (!contents) {
    console.log(
      "Failed to read remote file with id",
      knownFilenames[uuid],
      "as it had no contents"
    );
    return;
  }
  const character = JSON.parse(contents);
  localCache[uuid] = character;
  return character;
};

const writeThroughCache = async (character: Character) => {
  console.log("Calling writeThroughCache for google drive");
  localCache[character.uuid] = character;
  let fileId = knownFilenames[character.uuid];
  if (!fileId) {
    console.log(
      "Creating new file for ",
      character.uuid,
      "because one didn't exist"
    );
    fileId = await createFile(character.uuid);
    knownFilenames[character.uuid] = fileId;
    await updateFile(fileId, JSON.stringify(character));
  } else {
    console.log(
      "Just updating file for",
      character.uuid,
      "because there was already a known file"
    );
    await updateFile(fileId, JSON.stringify(character));
  }
};

const GoogleDriveDatastore: Datastore = {
  name: "Google Drive (cloud-synced) sheet",
  debounceWait: 5000,
  initializeDatastore: async () => {
    await populateKnownFilenames();
    console.log(
      "Grabbing characters for",
      Object.keys(knownFilenames).length,
      "characters"
    );
    const promises = Object.entries(knownFilenames).map(
      async ([uuid, fileId]) => {
        if (!uuid || !fileId) return;
        await readThroughCache(uuid as UUID);
      }
    );
    await Promise.all(promises);
  },
  saveToDatastore: writeThroughCache,
  loadFromDatastore: readThroughCache,
  listEntriesInDatastore: (): Character[] => {
    return Object.values(localCache);
  },
  deleteFromDatastore: (uuid: UUID) => {
    deleteFile(knownFilenames[uuid]).then(() => {
      delete localCache[uuid];
      delete knownFilenames[uuid];
    });
  },
  createCharacter: async () => {
    const newDefaultCharacter = defaultCharacter;
    newDefaultCharacter.uuid = crypto.randomUUID() as UUID;
    await writeThroughCache(newDefaultCharacter);
    return newDefaultCharacter;
  },
};

export default GoogleDriveDatastore;
