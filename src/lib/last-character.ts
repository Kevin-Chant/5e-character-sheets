import { UUID } from "crypto";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "src/lib/local-storage";

// The sheet this browser had open last, so the front door can offer it back in
// one click, before a datastore has loaded on a cold start.
//
// The cached name can go stale (renamed in another tab) — acceptable since the
// uuid is what actually opens the sheet.

export interface LastCharacter {
  uuid: UUID;
  name: string;
  // Not the full `DatastoreMode`: a remotely joined sheet is the host's and
  // is never recorded here.
  mode: "local" | "drive";
}

const LAST_CHARACTER_KEY = "lastCharacter";

export function readLastCharacter(): LastCharacter | undefined {
  const stored = readLocalStorage(LAST_CHARACTER_KEY);
  if (!stored || typeof stored.uuid !== "string" || !stored.mode) {
    return undefined;
  }
  return stored as LastCharacter;
}

export function writeLastCharacter(entry: LastCharacter) {
  writeLocalStorage(LAST_CHARACTER_KEY, entry);
}

export function clearLastCharacter() {
  removeLocalStorage(LAST_CHARACTER_KEY);
}
