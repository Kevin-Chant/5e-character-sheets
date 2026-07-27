import { UUID } from "crypto";
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "src/lib/local-storage";

// The sheet this browser had open last, so the front door can offer it back in
// one click.
//
// This exists because the home page stopped teleporting returning visitors into
// their last datastore. That redirect was a real convenience for someone who
// only builds characters, and it was paid for by everyone else: a DM with no
// sheets, or a player arriving with an invite link, met a character list. The
// convenience is kept, as an offer rather than a redirect — which means home
// needs to name the sheet *before* a datastore has loaded, and neither the
// datastore nor the character context can tell it that on a cold start.
//
// A name is cached alongside the uuid for exactly that reason. It can go stale
// (rename the sheet in another tab and this label lags by one open), which is
// the right trade for a label on a shortcut: the uuid is what actually opens.

export interface LastCharacter {
  uuid: UUID;
  name: string;
  // Which backend it came from — the shortcut has to re-select one, and Drive
  // needs its OAuth round-trip on the way through. Not the full `DatastoreMode`:
  // a remotely joined sheet is the host's and is never recorded here.
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
