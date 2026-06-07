import { readLocalStorage, writeLocalStorage } from "./local-storage";

// Stable tag for the storage mode the user last chose, persisted so returning
// visitors can "jump back in" past the home picker. We persist a tag rather
// than the Datastore object (which isn't serializable) or its display `name`
// (which is a UI string, not a stable key).
export type DatastoreMode = "local" | "drive" | "remote";

const LAST_DATASTORE_KEY = "lastDatastore";

export function readLastDatastore(): DatastoreMode | undefined {
  const value = readLocalStorage(LAST_DATASTORE_KEY);
  return value === "local" || value === "drive" || value === "remote"
    ? value
    : undefined;
}

export function writeLastDatastore(mode: DatastoreMode) {
  writeLocalStorage(LAST_DATASTORE_KEY, mode);
}
