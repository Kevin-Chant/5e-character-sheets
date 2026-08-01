import { UUID } from "crypto";
import type {
  SharePresenceEntry,
  SharePresenceSelf,
} from "src/lib/share-presence";
import { Action } from "src/lib/hooks/reducers/actions";
import { Character } from "src/lib/types/character";

// Application-level contracts that aren't part of the persisted character: the
// storage backend interface, the dispatch signatures, and the option-list shape
// the pickers take.

export interface Datastore {
  name: string;
  savedSheetsCopy: string;
  debounceWait: number;
  initializeDatastore: () => Promise<void>;
  saveToDatastore: (character: Character) => Promise<void>;
  loadFromDatastore: (uuid: UUID) => Promise<Character | undefined>;
  listEntriesInDatastore: () => Character[];
  deleteFromDatastore: (uuid: UUID) => void;
  createCharacter?: () => Promise<Character>;
  // Optional sharing support (currently Google Drive only): promote a private
  // character to a first-class document, share it with a person by email, and
  // report whether it has been promoted yet.
  isShared?: (uuid: UUID) => boolean;
  // Which side of a shared document we're on: "owner" for a shareable doc we
  // created, "recipient" for one shared *with* us (imported via the Picker),
  // undefined when it isn't a shared doc. Drives who auto-hosts vs. auto-joins
  // a live session.
  getShareRole?: (uuid: UUID) => "owner" | "recipient" | undefined;
  promoteCharacter?: (uuid: UUID) => Promise<void>;
  shareCharacter?: (uuid: UUID, email: string) => Promise<void>;
  // The link that walks a recipient through adding this shared document. It's
  // the same link the share email carries, exposed so it can be re-sent by
  // hand — Drive's notification is the kind of mail that lands in spam, and
  // "resend it" shouldn't mean re-granting access. Access still comes from
  // `shareCharacter`; this link only leads somewhere for someone who has it.
  getImportLink?: (uuid: UUID) => string | undefined;
  // Editor-presence heartbeat for shared documents with no live session: record
  // that we're editing and return the *other* editors currently on the file.
  // Clear our heartbeat when we stop editing. (Google Drive only.)
  heartbeatSharePresence?: (
    uuid: UUID,
    self: SharePresenceSelf,
  ) => Promise<SharePresenceEntry[]>;
  clearSharePresence?: (uuid: UUID, clientId: string) => Promise<void>;
  // Pick a character document shared with the user and add it to this store,
  // returning it for the caller to open (undefined if nothing was picked). A
  // `hint` names the file an import link was for, so the store can skip the
  // picker for something already imported and narrow it otherwise.
  importSharedCharacter?: (hint?: ImportHint) => Promise<Character | undefined>;
}

// The file an import link points at. Both halves are advisory: the id can name
// a file this browser has no access to yet, and the name is only a search term.
export interface ImportHint {
  fileId?: string;
  name?: string;
}

export type Dispatch = (
  action: Action,
  dirtyAction?: boolean,
  suppressBroadcast?: boolean,
) => void;

export type SingleOptionsList<T = string> = Array<T>;

export type GroupedOptionsList<T = string> = Array<{
  label: string;
  options: T[];
}>;

export type OptionsList<T = string> =
  | SingleOptionsList<T>
  | GroupedOptionsList<T>;
