import { UUID } from "crypto";
import type {
  SharePresenceEntry,
  SharePresenceSelf,
} from "src/lib/share-presence";
import { Action } from "src/lib/hooks/reducers/actions";
import { Character } from "src/lib/types/character";

// Storage backend interface, dispatch signature, and option-list shapes.

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
  // Optional sharing support (currently Google Drive only).
  isShared?: (uuid: UUID) => boolean;
  // "owner" for a shareable doc we created, "recipient" for one shared with
  // us, undefined when not shared. Drives auto-host vs. auto-join for a live session.
  getShareRole?: (uuid: UUID) => "owner" | "recipient" | undefined;
  promoteCharacter?: (uuid: UUID) => Promise<void>;
  shareCharacter?: (uuid: UUID, email: string) => Promise<void>;
  listShares?: (uuid: UUID) => Promise<ShareGrant[]>;
  revokeShare?: (uuid: UUID, grantId: string) => Promise<void>;
  getDocumentLink?: (uuid: UUID) => string | undefined;
  // Re-sendable link that walks a recipient through adding a shared document
  // (Drive's own notification email lands in spam); grants nothing itself.
  getImportLink?: (uuid: UUID) => string | undefined;
  // Editor-presence heartbeat for shared docs with no live session: record
  // that we're editing and return the other current editors. (Drive only.)
  heartbeatSharePresence?: (
    uuid: UUID,
    self: SharePresenceSelf,
  ) => Promise<SharePresenceEntry[]>;
  clearSharePresence?: (uuid: UUID, clientId: string) => Promise<void>;
  // Adopt `revision` as the base for the next write — the resolution arm of
  // a save the store refused with a `SaveConflictError`.
  acceptRemoteRevision?: (uuid: UUID, revision: string) => void;
  // `hint` names the file an import link was for, letting the store skip the
  // picker if already imported. Returns undefined if nothing was picked.
  importSharedCharacter?: (hint?: ImportHint) => Promise<Character | undefined>;
}

// Backend-neutral: the Drive permission id is opaque to the UI.
export interface ShareGrant {
  id: string;
  email?: string;
  name?: string;
  // Drive's role vocabulary ("owner", "writer", "reader").
  role: string;
  isOwner: boolean;
}

// Both fields advisory: fileId may be inaccessible yet, name is a search term only.
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
