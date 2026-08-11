import {
  EMPTY_ENCOUNTER,
  Encounter,
  TableDefaults,
  withTableDefaults,
} from "src/lib/play/encounter";

// State machine for a party session's sync handshake: a joiner asks the room
// (`syncRequest`), the room answers (`syncResponse`), and if nobody answers
// inside `SYNC_WINDOW_MS` the machine transitions to "live" anyway. Adoption
// is scoped to one request id, so a stray state broadcast can't be adopted.
// The window ends the waiting, not the listening — a late answer still merges.

// Timeout before concluding the room is empty. The first answer wins and ends
// the wait, so only an empty room pays this cost. 1500ms to survive a slow
// mobile round trip (was 750ms, measured on LAN, too tight for mobile data).
export const SYNC_WINDOW_MS = 1_500;

export type SessionIntent =
  | { kind: "host"; reopening: boolean }
  | { kind: "join" };

export type ConnectionState =
  | { phase: "offline"; error?: string }
  | { phase: "connecting"; intent: SessionIntent }
  | {
      phase: "syncing";
      code: string;
      requestId: string;
      // Only a joiner (or a host reopening) adopts the answer wholesale; a
      // fresh host's state is the room's, so it merges.
      adopting: boolean;
    }
  // `pendingRequestId`: the sync request whose answer missed the window but
  // is still adoptable if it turns up late.
  | {
      phase: "live";
      code: string;
      pendingRequestId?: string;
      adopting?: boolean;
    };

export type ConnectionEvent =
  | { type: "connect"; intent: SessionIntent }
  | { type: "opened"; code: string; requestId: string }
  | { type: "sync-response"; requestId: string }
  | { type: "sync-window-closed"; requestId: string }
  // A local edit means a late answer must merge, not replace.
  | { type: "local-change" }
  | { type: "closed"; error?: string };

export const OFFLINE: ConnectionState = { phase: "offline" };

export function connectionReducer(
  state: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  switch (event.type) {
    case "connect":
      return { phase: "connecting", intent: event.intent };
    case "opened":
      return {
        phase: "syncing",
        code: event.code,
        requestId: event.requestId,
        adopting:
          state.phase === "connecting" &&
          (state.intent.kind === "join" || state.intent.reopening),
      };
    case "sync-response":
      if (
        state.phase === "live" &&
        state.pendingRequestId === event.requestId
      ) {
        // Late answer, consumed; any further answer merges normally.
        return { phase: "live", code: state.code };
      }
      if (state.phase !== "syncing" || state.requestId !== event.requestId) {
        return state;
      }
      return { phase: "live", code: state.code };
    case "sync-window-closed":
      if (state.phase !== "syncing" || state.requestId !== event.requestId) {
        return state;
      }
      // Waiting ends but the offer to adopt carries into `live`, for a late answer.
      return {
        phase: "live",
        code: state.code,
        pendingRequestId: state.requestId,
        adopting: state.adopting,
      };
    case "local-change":
      if (state.phase !== "live" || !state.pendingRequestId) return state;
      return { phase: "live", code: state.code };
    case "closed":
      return { phase: "offline", error: event.error };
  }
}

// Whether an arriving answer should replace our state rather than merge.
// Scoped to the request it answers.
export function adoptsResponse(
  state: ConnectionState,
  requestId: string,
): boolean {
  if (state.phase === "syncing") {
    return state.requestId === requestId && state.adopting;
  }
  return (
    state.phase === "live" &&
    !!state.adopting &&
    state.pendingRequestId === requestId
  );
}

// The stored encounter is per-browser while a code names a table; `belongsTo`
// pairs them so a brand-new game doesn't open onto the previous one's fight.
// Reopening a code keeps its encounter. An encounter with no `belongsTo`
// (built while disconnected) is local prep and carries into a fresh host too.
// Opening a new table is also the one moment the DM's default policy applies:
// joining adopts the room's, and reopening keeps the copy the table already
// made, so a default changed mid-campaign can't reach backwards.
export function encounterForTable(
  stored: Encounter,
  belongsTo: string | undefined,
  intent: SessionIntent,
  defaults: TableDefaults,
): Encounter {
  if (intent.kind === "join" || intent.reopening) return stored;
  return withTableDefaults(belongsTo ? EMPTY_ENCOUNTER : stored, defaults);
}
