import { UUID } from "crypto";
import {
  createFile,
  deleteFile,
  getFileContents,
  listFiles,
  updateFile,
} from "src/lib/google-drive";
import { Character, Datastore } from "src/lib/types";

let knownFilenames: Record<UUID, string> = {};
let localCache: Record<UUID, Character> = {};

const populateKnownFilenames = async () => {
  const fileList = (await listFiles()).map((file) => [file.name, file.id]);
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
  localCache[character.uuid] = character;
  let fileId = knownFilenames[character.uuid];
  if (!fileId) {
    fileId = await createFile(character.uuid);
    knownFilenames[character.uuid] = fileId;
  }
  updateFile(fileId, JSON.stringify(character));
};

const GoogleDriveDatastore: Datastore = {
  name: "Google Drive (cloud-synced) sheet",
  debounceWait: 5000,
  initializeDatastore: async () => {
    populateKnownFilenames();
    Object.entries(knownFilenames).forEach(async ([uuid, fileId]) => {
      if (!uuid || !fileId) return;
      readThroughCache(uuid as UUID);
    });
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
};

export default GoogleDriveDatastore;
