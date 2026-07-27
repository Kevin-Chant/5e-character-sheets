import { UUID } from "crypto";
import { readLocalStorage, writeLocalStorage } from "src/lib/local-storage";
import { normalizeSessionCode } from "src/lib/play/session";

// What this browser remembers about the games it has been in.
//
// There is already a memory of joined sessions on the character
// (`Character.playSessions`), and it stays: it travels with the sheet, so a
// player who opens Brakka on a different machine still sees Brakka's games.
// This one answers a different question, and neither can answer the other's:
//
//  - **A DM has no character.** The one persona that most needs a rejoin
//    shortcut is the one with nothing to hang it on.
//  - **The front door renders before any datastore does.** Drive takes an OAuth
//    round-trip and a list fetch; a resume strip that waits for that is a resume
//    strip nobody sees.
//  - **"Which sheet did I bring last time" is a fact about this browser's
//    choice**, not about the sheet — and it's the whole of the returning
//    player's flow, which is otherwise re-answered every week.
//
// So: keyed by code, written only after a connection actually succeeded (a code
// recorded when it's typed is a list of typos), and merged rather than replaced
// so the entry can be filled in by whichever surface knows each part.

export type SessionSeat = "dm" | "player";

export interface SessionMemory {
  code: string;
  // Epoch ms. Orders the list — one uuid looks much like another.
  lastJoined: number;
  seat?: SessionSeat;
  // The sheet this browser played. The name rides along so the resume strip can
  // say "as Brakka" without loading a datastore to look it up.
  playAsUuid?: UUID;
  playAsName?: string;
  // Sheets a DM put into the order without opening.
  broughtUuids?: UUID[];
  // What a sheetless joiner asked to be called.
  displayName?: string;
  // What the DM calls this table. Local to this browser and optional: it exists
  // because a DM who runs two campaigns otherwise gets two rows reading "the
  // game you're running", told apart only by eight characters of uuid. It does
  // not cross the wire — naming a table for everyone is a protocol change, and
  // the person who needs the label is the person who has two of them.
  title?: string;
}

// A game night or two, not a backlog — past that the list stops being a
// shortcut and becomes something to read. Deliberately larger than the
// per-character `REMEMBERED_SESSIONS`, because a DM's list is every table they
// run rather than one character's.
export const REMEMBERED_LOCAL_SESSIONS = 8;

const SESSION_MEMORY_KEY = "playSessionMemory";

// Merge an entry into the list, newest first. Merging (rather than replacing)
// is what lets the connect effect record the code while the lobby records what
// was brought, without either needing to know about the other.
export function recordSession(
  sessions: SessionMemory[],
  entry: SessionMemory,
): SessionMemory[] {
  const code = normalizeSessionCode(entry.code);
  const existing = sessions.find((s) => s.code === code);
  const rest = sessions.filter((s) => s.code !== code);
  return [{ ...existing, ...entry, code }, ...rest].slice(
    0,
    REMEMBERED_LOCAL_SESSIONS,
  );
}

export function dropSession(
  sessions: SessionMemory[],
  code: string,
): SessionMemory[] {
  const normalized = normalizeSessionCode(code);
  return sessions.filter((s) => s.code !== normalized);
}

export function readSessionMemory(): SessionMemory[] {
  const stored = readLocalStorage(SESSION_MEMORY_KEY, []);
  // Anything could be in localStorage — an older shape, or a hand-edit. A
  // resume strip is a convenience, so a bad entry is dropped rather than
  // thrown: the worst case is one missing shortcut.
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (entry): entry is SessionMemory =>
      !!entry &&
      typeof entry.code === "string" &&
      typeof entry.lastJoined === "number",
  );
}

export function rememberSessionLocally(entry: SessionMemory) {
  writeLocalStorage(
    SESSION_MEMORY_KEY,
    recordSession(readSessionMemory(), entry),
  );
}

export function forgetSessionLocally(code: string) {
  writeLocalStorage(SESSION_MEMORY_KEY, dropSession(readSessionMemory(), code));
}

// The sheet this browser last actually played, at any table.
//
// Needed because a code is not durable the way a character is: a realm exists
// only while somebody is connected, so a DM who doesn't deliberately reopen
// last week's code sends a brand-new one every session. Keyed memory has
// nothing to say about a code it has never seen — but "you played Brakka last
// game" is still true, and it's the whole of what the returning player wanted
// remembered.
export function lastPlayedCharacter():
  | { uuid: UUID; name?: string }
  | undefined {
  const played = readSessionMemory().find(
    (entry) => entry.seat !== "dm" && entry.playAsUuid,
  );
  return played?.playAsUuid
    ? { uuid: played.playAsUuid, name: played.playAsName }
    : undefined;
}

export function sessionMemoryFor(code: string): SessionMemory | undefined {
  const normalized = normalizeSessionCode(code);
  return readSessionMemory().find((s) => s.code === normalized);
}
