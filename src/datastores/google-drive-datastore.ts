import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  createFile,
  deleteFile,
  getFileAppProperties,
  getFileContents,
  listAppDataFiles,
  listSharedCharacterFiles,
  patchFileAppProperties,
  pickSharedCharacters,
  renameFile,
  SHARED_MARKER_KEY,
  SHARED_UUID_KEY,
  shareFileByEmail,
  updateFile,
} from "src/lib/google-drive";
import {
  computePresenceUpdate,
  EDITOR_PREFIX,
  SharePresenceSelf,
} from "src/lib/share-presence";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { Character, Datastore } from "src/lib/types";
import { randomUUID } from "src/lib/browser";

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
  const fileId = knownFiles[uuid].fileId;
  const contents = await getFileContents(fileId);
  if (!contents) {
    console.warn("Drive file", fileId, "had no contents; skipping");
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (err) {
    console.error("Drive file", fileId, "was not valid JSON; skipping", err);
    return;
  }
  const result = hydrateCharacter(raw);
  if (!result.ok) {
    console.error("Drive file", fileId, "could not be loaded", result.errors);
    return;
  }
  localCache[uuid] = result.character;
  // Persist the upgrade back so the bump is durable (best-effort; the importer
  // may only have read access to a shared document).
  if (result.migrated) {
    try {
      await updateFile(fileId, JSON.stringify(result.character));
    } catch (err) {
      console.error("Could not write migrated character back to Drive", err);
    }
  }
  return result.character;
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

// Records our editor heartbeat on the shared file (pruning long-dead ones) and
// returns the other editors currently on it. Best-effort: metadata failures
// just yield "no others" rather than blocking editing.
const heartbeatSharePresence = async (uuid: UUID, self: SharePresenceSelf) => {
  const known = knownFiles[uuid];
  if (!known?.shared) return [];
  try {
    const current = await getFileAppProperties(known.fileId);
    const { patch, others } = computePresenceUpdate(current, self, Date.now());
    await patchFileAppProperties(known.fileId, patch);
    return others;
  } catch (err) {
    console.error("Editor-presence heartbeat failed", err);
    return [];
  }
};

const clearSharePresence = async (uuid: UUID, clientId: string) => {
  const known = knownFiles[uuid];
  if (!known?.shared) return;
  try {
    await patchFileAppProperties(known.fileId, {
      [EDITOR_PREFIX + clientId]: null,
    });
  } catch (err) {
    console.error("Failed to clear editor presence", err);
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
    const result = hydrateCharacter(data);
    if (!result.ok) {
      console.error(
        "Picked Drive file",
        file.id,
        "is not a character",
        result.errors,
      );
      continue;
    }
    const character = result.character;
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
    const newDefaultCharacter = structuredClone(defaultCharacter);
    newDefaultCharacter.uuid = randomUUID();
    await writeThroughCache(newDefaultCharacter);
    return newDefaultCharacter;
  },
  isShared: (uuid: UUID) => !!knownFiles[uuid]?.shared,
  getShareRole: (uuid: UUID) => {
    // Imported (shared-with-me) documents live in the importedIndex; those are
    // owned by someone else, so we join their session rather than host it.
    if (importedIndex[uuid]) return "recipient";
    // A promoted document we created (and can share) — we host.
    if (knownFiles[uuid]?.shared) return "owner";
    return undefined;
  },
  promoteCharacter,
  shareCharacter,
  heartbeatSharePresence,
  clearSharePresence,
  importSharedCharacter,
};

export default GoogleDriveDatastore;
