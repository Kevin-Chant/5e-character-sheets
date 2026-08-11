import { UUID } from "crypto";
import { readLocalStorage, writeLocalStorage } from "src/lib/local-storage";
import { normalizeSessionCode } from "src/lib/play/session";

// What this browser (not the character — see `Character.playSessions`)
// remembers about games it has joined. Needed because a DM has no character
// to hang a memory on, and the front door renders before any datastore does.
// Keyed by code, written only after a connection succeeds, merged rather
// than replaced so different surfaces can each fill in their own part.

export type SessionSeat = "dm" | "player";

export interface SessionMemory {
  code: string;
  lastJoined: number;
  seat?: SessionSeat;
  // Name rides along so the resume strip can say "as Brakka" without a
  // datastore lookup.
  playAsUuid?: UUID;
  playAsName?: string;
  // Sheets a DM put into the order without opening.
  broughtUuids?: UUID[];
  // What a sheetless joiner asked to be called.
  displayName?: string;
  // Local-only label so a DM running two campaigns can tell the rows apart;
  // never crosses the wire.
  title?: string;
}

// Larger than per-character REMEMBERED_SESSIONS: a DM's list spans every
// table they run, not one character's games.
export const REMEMBERED_LOCAL_SESSIONS = 8;

const SESSION_MEMORY_KEY = "playSessionMemory";

// Merge (not replace) so e.g. the connect effect can record the code while
// the lobby separately records what was brought.
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
  // Bad/old-shape entries are dropped, not thrown, since this is a
  // convenience list.
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

// The sheet this browser last played, at any table — independent of code,
// since a realm's code doesn't persist between sessions the way a character
// does.
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
