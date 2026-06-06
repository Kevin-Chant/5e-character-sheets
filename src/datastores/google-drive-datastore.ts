import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  createFile,
  deleteFile,
  getFileContents,
  listAppDataFiles,
  listSharedCharacterFiles,
  SHARED_MARKER_KEY,
  SHARED_UUID_KEY,
  shareFileByEmail,
  updateFile,
} from "src/lib/google-drive";
import { Character, Datastore } from "src/lib/types";

interface KnownFile {
  fileId: string;
  // true once promoted to a first-class, shareable My Drive document;
  // false while it lives privately in the appDataFolder.
  shared: boolean;
}

// TODO: maybe move local cache to separate file & share across datastores
let knownFiles: Record<UUID, KnownFile> = {};
const localCache: Record<UUID, Character> = {};

const sharedFileName = (character: Character) =>
  `${character.name || "Unnamed character"}.5echar`;

const populateKnownFiles = async () => {
  const [appDataFiles, sharedFiles] = await Promise.all([
    listAppDataFiles(),
    listSharedCharacterFiles(),
  ]);
  const next: Record<UUID, KnownFile> = {};
  for (const file of appDataFiles) {
    if (file.name && file.id) {
      next[file.name as UUID] = { fileId: file.id, shared: false };
    }
  }
  // Shared documents win over a stale appData copy with the same uuid.
  for (const file of sharedFiles) {
    const uuid = file.appProperties?.[SHARED_UUID_KEY] as UUID | undefined;
    if (uuid && file.id) {
      next[uuid] = { fileId: file.id, shared: true };
    }
  }
  knownFiles = next;
};

const readThroughCache = async (uuid: UUID): Promise<Character | undefined> => {
  if (localCache[uuid]) {
    return localCache[uuid];
  } else if (!knownFiles[uuid]) {
    return undefined;
  }
  const contents = await getFileContents(knownFiles[uuid].fileId);
  if (!contents) {
    console.warn(
      "Drive file",
      knownFiles[uuid].fileId,
      "had no contents; skipping",
    );
    return;
  }
  const character = JSON.parse(contents);
  localCache[uuid] = character;
  return character;
};

const writeThroughCache = async (character: Character) => {
  localCache[character.uuid] = character;
  let known = knownFiles[character.uuid];
  if (!known) {
    // New characters start private in the appDataFolder.
    const fileId = await createFile(character.uuid);
    known = { fileId, shared: false };
    knownFiles[character.uuid] = known;
  }
  await updateFile(known.fileId, JSON.stringify(character));
};

// Promotes a private appData character into a first-class My Drive document
// that can be shared with other people. The private copy is removed so the
// promoted document is the single source of truth.
const promoteCharacter = async (uuid: UUID) => {
  const character = localCache[uuid] ?? (await readThroughCache(uuid));
  if (!character) {
    throw new Error("Could not find the character to promote.");
  }
  const previous = knownFiles[uuid];
  if (previous?.shared) return; // already promoted

  const fileId = await createFile(sharedFileName(character), {
    appProperties: { [SHARED_MARKER_KEY]: "true", [SHARED_UUID_KEY]: uuid },
  });
  await updateFile(fileId, JSON.stringify(character));
  knownFiles[uuid] = { fileId, shared: true };

  if (previous && !previous.shared) {
    await deleteFile(previous.fileId);
  }
};

const shareCharacter = async (uuid: UUID, email: string) => {
  const known = knownFiles[uuid];
  if (!known?.shared) {
    throw new Error("Make the character shareable before sharing it.");
  }
  await shareFileByEmail(known.fileId, email);
};

const GoogleDriveDatastore: Datastore = {
  name: "Google Drive (cloud-synced) sheet",
  savedSheetsCopy: "Characters saved in Google Drive:",
  debounceWait: 5000,
  initializeDatastore: async () => {
    await populateKnownFiles();
    const promises = Object.keys(knownFiles).map((uuid) =>
      readThroughCache(uuid as UUID),
    );
    await Promise.all(promises);
  },
  saveToDatastore: writeThroughCache,
  loadFromDatastore: readThroughCache,
  listEntriesInDatastore: (): Character[] => {
    return Object.values(localCache);
  },
  deleteFromDatastore: (uuid: UUID) => {
    deleteFile(knownFiles[uuid].fileId).then(() => {
      delete localCache[uuid];
      delete knownFiles[uuid];
    });
  },
  createCharacter: async () => {
    const newDefaultCharacter = defaultCharacter;
    newDefaultCharacter.uuid = crypto.randomUUID() as UUID;
    await writeThroughCache(newDefaultCharacter);
    return newDefaultCharacter;
  },
  isShared: (uuid: UUID) => !!knownFiles[uuid]?.shared,
  promoteCharacter,
  shareCharacter,
};

export default GoogleDriveDatastore;
