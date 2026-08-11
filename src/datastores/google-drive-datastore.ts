import { UUID } from "crypto";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  createFile,
  deleteFile,
  fileViewLink,
  getFileAppProperties,
  getFileContents,
  listAppDataFiles,
  listFilePermissions,
  listSharedCharacterFiles,
  patchFileAppProperties,
  pickSharedCharacters,
  removeFilePermission,
  renameFile,
  SHARED_MARKER_KEY,
  SHARED_UUID_KEY,
  shareFileByEmail,
  trashFile,
  updateFile,
} from "src/lib/google-drive";
import {
  computePresenceUpdate,
  EDITOR_PREFIX,
  SharePresenceSelf,
} from "src/lib/share-presence";
import {
  importLinkFor,
  pickerQueryFor,
  shareEmailMessage,
} from "src/lib/drive-import-link";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { Character, Datastore, ImportHint, ShareGrant } from "src/lib/types";
import { randomUUID } from "src/lib/browser";

interface KnownFile {
  fileId: string;
  // true once promoted to a first-class, shareable My Drive document; false
  // while private in the appDataFolder.
  shared: boolean;
  // Drive filename of a shared document, tracked to rename on Drive when the
  // character's name changes. Unused for private appData files (named by uuid).
  name?: string;
}

// Shared documents this user imported (via the Picker) but didn't create;
// can't be rediscovered by query, so persisted here to survive reloads.
const IMPORTED_INDEX_NAME = "imported-shared-characters.json";
type ImportedIndex = Record<UUID, { fileId: string; name: string }>;

// TODO: maybe move local cache to separate file & share across datastores
let knownFiles: Record<UUID, KnownFile> = {};
const localCache: Record<UUID, Character> = {};
let importedIndex: ImportedIndex = {};
let importedIndexFileId: string | undefined;

const sharedFileName = (character: Character) =>
  `${character.name || "Unnamed character"}.5echar`;

const parseImportedIndex = async (fileId: string): Promise<ImportedIndex> => {
  const contents = await getFileContents(fileId);
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

// Everything this account holds, in one sweep. Kept separate from the module
// caches so it can also answer for a Drive account that isn't the active
// datastore (e.g. Settings reached from a localStorage session).
interface DriveDiscovery {
  files: Record<UUID, KnownFile>;
  index: ImportedIndex;
  indexFileId?: string;
  counts: DriveCharacterCounts;
}

const discoverDriveFiles = async (): Promise<DriveDiscovery> => {
  const [appDataFiles, sharedFiles] = await Promise.all([
    listAppDataFiles(),
    listSharedCharacterFiles(),
  ]);
  const files: Record<UUID, KnownFile> = {};
  let indexFileId: string | undefined;
  for (const file of appDataFiles) {
    // The index is bookkeeping, not a character.
    if (file.name === IMPORTED_INDEX_NAME) {
      indexFileId = file.id ?? undefined;
      continue;
    }
    if (file.name && file.id) {
      files[file.name as UUID] = { fileId: file.id, shared: false };
    }
  }
  const privateCount = Object.keys(files).length;
  // Shared documents win over a stale appData copy with the same uuid.
  for (const file of sharedFiles) {
    const uuid = file.appProperties?.[SHARED_UUID_KEY] as UUID | undefined;
    if (uuid && file.id) {
      files[uuid] = { fileId: file.id, shared: true, name: file.name };
    }
  }
  // Imported (shared-with-me) documents the query can't surface for us.
  const index = indexFileId ? await parseImportedIndex(indexFileId) : {};
  let importedCount = 0;
  for (const [uuid, entry] of Object.entries(index) as [
    UUID,
    ImportedIndex[UUID],
  ][]) {
    // A document we own answers the shared query too, so importing a link to
    // your own file would otherwise count it twice.
    if (!files[uuid]) {
      files[uuid] = { fileId: entry.fileId, shared: true, name: entry.name };
      importedCount++;
    }
  }
  return {
    files,
    index,
    indexFileId,
    counts: { privateCount, sharedCount: sharedFiles.length, importedCount },
  };
};

const populateKnownFiles = async () => {
  const discovery = await discoverDriveFiles();
  knownFiles = discovery.files;
  importedIndex = discovery.index;
  importedIndexFileId = discovery.indexFileId;
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
  // Best-effort: the importer may only have read access to a shared document.
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

  if (known.shared) {
    const desiredName = sharedFileName(character);
    if (known.name !== desiredName) {
      await renameFile(known.fileId, desiredName);
      known.name = desiredName;
    }
  }
};

// Promotes a private appData character into a first-class, shareable My
// Drive document; the private copy is removed.
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

// Best-effort: metadata failures yield "no others" rather than blocking editing.
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
  // Rides Drive's own notification email; only the note pointing back here is ours (drive-import-link).
  const link = importLinkFor(window.location.origin, known.fileId, known.name);
  const name = localCache[uuid]?.name ?? "";
  await shareFileByEmail(known.fileId, email, shareEmailMessage(name, link));
};

const listShares = async (uuid: UUID): Promise<ShareGrant[]> => {
  const known = knownFiles[uuid];
  if (!known?.shared) return [];
  const permissions = await listFilePermissions(known.fileId);
  return permissions.map((permission) => ({
    id: permission.id,
    email: permission.emailAddress,
    name: permission.displayName,
    role: permission.role,
    isOwner: permission.role === "owner",
  }));
};

const revokeShare = async (uuid: UUID, grantId: string) => {
  const known = knownFiles[uuid];
  if (!known?.shared) {
    throw new Error("This character isn't a shared document.");
  }
  await removeFilePermission(known.fileId, grantId);
};

// Lets the user pick character documents shared with them (via the Google
// Picker), backed by the owner's Drive file. Recorded in the appData index
// to persist across reloads. Returns the last imported character.
//
// If the `hint`'s file is already imported, the Picker never opens — a
// second click on the same link opens rather than re-imports. Otherwise the
// hint's name narrows the Picker to one file (as close to preselection as
// `drive.file` allows).
const importSharedCharacter = async (
  hint?: ImportHint,
): Promise<Character | undefined> => {
  if (hint?.fileId) {
    const already = (Object.keys(importedIndex) as UUID[]).find(
      (uuid) => importedIndex[uuid].fileId === hint.fileId,
    );
    if (already)
      return localCache[already] ?? (await readThroughCache(already));
  }
  const picked = await pickSharedCharacters(pickerQueryFor(hint?.name));
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

export interface DriveCharacterCounts {
  // Hidden in appDataFolder; nobody else can see these.
  privateCount: number;
  // Promoted to first-class My Drive documents — shareable, and yours.
  sharedCount: number;
  // Someone else's document, imported via the Picker.
  importedCount: number;
}

export const countDriveCharacters = async (): Promise<DriveCharacterCounts> =>
  (await discoverDriveFiles()).counts;

// Every character in the account, for a backup file. Reads fresh rather than
// the module cache, so a backup can't silently omit an unopened character.
export const loadAllDriveCharacters = async (): Promise<Character[]> => {
  const { files } = await discoverDriveFiles();
  const loaded = await Promise.all(
    Object.values(files).map(async ({ fileId }) => {
      const contents = await getFileContents(fileId);
      if (!contents) return undefined;
      try {
        const result = hydrateCharacter(JSON.parse(contents));
        return result.ok ? result.character : undefined;
      } catch (err) {
        console.error(
          "Drive file",
          fileId,
          "could not be read for export",
          err,
        );
        return undefined;
      }
    }),
  );
  return loaded.filter((character): character is Character => !!character);
};

const GoogleDriveDatastore: Datastore = {
  name: "Google Drive (cloud-synced) sheet",
  savedSheetsCopy: "Characters saved in Google Drive:",
  debounceWait: 5000,
  initializeDatastore: async () => {
    // These caches are module-level and outlive sign-out/account switches;
    // reset them or a second sign-in would list/write the previous account's cache.
    knownFiles = {};
    importedIndex = {};
    importedIndexFileId = undefined;
    for (const key of Object.keys(localCache)) delete localCache[key as UUID];
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
      // An imported (shared-with-me) document isn't ours to delete — forget it, don't touch the owner's file.
      const entry = importedIndex[uuid];
      delete importedIndex[uuid];
      try {
        await writeImportedIndex();
      } catch (err) {
        // Restore so caches match what a reload would rediscover.
        importedIndex[uuid] = entry;
        throw err;
      }
    } else if (known.shared) {
      // Recoverable from Drive's trash for 30 days — `files.delete` is permanent.
      await trashFile(known.fileId);
    } else {
      // Private appData files have no reachable trash; still propagate a
      // failed delete rather than clearing the caches anyway.
      await deleteFile(known.fileId);
    }
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
    if (importedIndex[uuid]) return "recipient";
    if (knownFiles[uuid]?.shared) return "owner";
    return undefined;
  },
  promoteCharacter,
  shareCharacter,
  listShares,
  revokeShare,
  getDocumentLink: (uuid: UUID) => {
    const known = knownFiles[uuid];
    // Only promoted documents have a page in the Drive UI.
    return known?.shared ? fileViewLink(known.fileId) : undefined;
  },
  getImportLink: (uuid: UUID) => {
    const known = knownFiles[uuid];
    if (!known?.shared) return undefined;
    return importLinkFor(window.location.origin, known.fileId, known.name);
  },
  heartbeatSharePresence,
  clearSharePresence,
  importSharedCharacter,
};

export default GoogleDriveDatastore;
