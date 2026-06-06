import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  createFile,
  deleteFile,
  getFileContents,
  listAppDataFiles,
  listSharedCharacterFiles,
  pickSharedCharacters,
  renameFile,
  SHARED_MARKER_KEY,
  SHARED_UUID_KEY,
  shareFileByEmail,
  updateFile,
} from "src/lib/google-drive";
import { Character, Datastore } from "src/lib/types";
import { validateCharacterData } from "src/lib/utils";

interface KnownFile {
  fileId: string;
  // true once promoted to a first-class, shareable My Drive document;
  // false while it lives privately in the appDataFolder.
  shared: boolean;
  // The Drive filename of a shared document; tracked so we can rename it on
  // Drive when the character's name changes. Unused for private appData files
  // (those are named by uuid).
  name?: string;
}

// An appData file recording shared documents this user imported (via the
// Picker) but did not create. They can't be rediscovered by query — the only
// handle we have is the fileId — so we persist it here to survive reloads.
const IMPORTED_INDEX_NAME = "imported-shared-characters.json";
type ImportedIndex = Record<UUID, { fileId: string; name: string }>;

// TODO: maybe move local cache to separate file & share across datastores
let knownFiles: Record<UUID, KnownFile> = {};
const localCache: Record<UUID, Character> = {};
let importedIndex: ImportedIndex = {};
let importedIndexFileId: string | undefined;

const sharedFileName = (character: Character) =>
  `${character.name || "Unnamed character"}.5echar`;

const readImportedIndex = async (): Promise<ImportedIndex> => {
  if (!importedIndexFileId) return {};
  const contents = await getFileContents(importedIndexFileId);
  if (!contents) return {};
  try {
    return JSON.parse(contents);
  } catch (err) {
    console.error("Imported-characters index was not valid JSON", err);
    return {};
  }
};

const writeImportedIndex = async () => {
  if (!importedIndexFileId) {
    importedIndexFileId = await createFile(IMPORTED_INDEX_NAME);
  }
  await updateFile(importedIndexFileId, JSON.stringify(importedIndex));
};

const populateKnownFiles = async () => {
  const [appDataFiles, sharedFiles] = await Promise.all([
    listAppDataFiles(),
    listSharedCharacterFiles(),
  ]);
  const next: Record<UUID, KnownFile> = {};
  for (const file of appDataFiles) {
    // The index is bookkeeping, not a character.
    if (file.name === IMPORTED_INDEX_NAME) {
      importedIndexFileId = file.id ?? undefined;
      continue;
    }
    if (file.name && file.id) {
      next[file.name as UUID] = { fileId: file.id, shared: false };
    }
  }
  // Shared documents win over a stale appData copy with the same uuid.
  for (const file of sharedFiles) {
    const uuid = file.appProperties?.[SHARED_UUID_KEY] as UUID | undefined;
    if (uuid && file.id) {
      next[uuid] = { fileId: file.id, shared: true, name: file.name };
    }
  }
  // Imported (shared-with-me) documents the query can't surface for us.
  importedIndex = await readImportedIndex();
  for (const [uuid, entry] of Object.entries(importedIndex) as [
    UUID,
    ImportedIndex[UUID],
  ][]) {
    if (!next[uuid]) {
      next[uuid] = { fileId: entry.fileId, shared: true, name: entry.name };
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

  // Keep the shared document's Drive filename in sync with the character name.
  if (known.shared) {
    const desiredName = sharedFileName(character);
    if (known.name !== desiredName) {
      await renameFile(known.fileId, desiredName);
      known.name = desiredName;
    }
  }
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

  const name = sharedFileName(character);
  const fileId = await createFile(name, {
    appProperties: { [SHARED_MARKER_KEY]: "true", [SHARED_UUID_KEY]: uuid },
  });
  await updateFile(fileId, JSON.stringify(character));
  knownFiles[uuid] = { fileId, shared: true, name };

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

// Lets the user pick character documents shared with them (via the Google
// Picker) and adds them to this datastore. They're backed by the original
// owner's Drive file — edits and live sessions go through that single source of
// truth — and recorded in the appData index so they persist across reloads.
// Returns the last imported character so the caller can open it.
const importSharedCharacter = async (): Promise<Character | undefined> => {
  const picked = await pickSharedCharacters();
  let imported: Character | undefined;
  for (const file of picked) {
    const contents = await getFileContents(file.id);
    if (!contents) {
      console.warn("Picked Drive file", file.id, "had no contents; skipping");
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(contents);
    } catch (err) {
      console.error("Picked Drive file", file.id, "was not valid JSON", err);
      continue;
    }
    const [valid, errors] = validateCharacterData(data as string);
    if (!valid) {
      console.error("Picked Drive file", file.id, "is not a character", errors);
      continue;
    }
    const character = data as Character;
    const uuid = character.uuid;
    localCache[uuid] = character;
    knownFiles[uuid] = { fileId: file.id, shared: true, name: file.name };
    importedIndex[uuid] = { fileId: file.id, name: file.name };
    imported = character;
  }
  if (imported) await writeImportedIndex();
  return imported;
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
  deleteFromDatastore: async (uuid: UUID) => {
    const known = knownFiles[uuid];
    if (!known) return;
    if (importedIndex[uuid]) {
      // An imported (shared-with-me) document isn't ours to delete — removing
      // it from the sidebar should just forget it, not delete the owner's file.
      delete importedIndex[uuid];
      await writeImportedIndex();
    } else {
      try {
        await deleteFile(known.fileId);
      } catch (err) {
        console.error("Failed to delete Drive file", known.fileId, err);
      }
    }
    // Clear local state regardless of the Drive outcome so the sidebar and
    // caches don't keep a phantom entry.
    delete localCache[uuid];
    delete knownFiles[uuid];
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
  importSharedCharacter,
};

export default GoogleDriveDatastore;
