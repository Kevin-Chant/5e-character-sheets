import { EMPTY_ENCOUNTER, Encounter } from "src/lib/play/encounter";

// Being in a session, as a state machine.
//
// This is the part of the party session that kept producing bugs, and the
// reason was always the same shape: a boolean ref, armed at one moment and
// cleared at another, where the clearing moment was assumed to arrive.
//
//   - `adoptNextStateRef` was armed on join and cleared by the room's reply. An
//     empty room sends no reply, so on a table nobody else was at it stayed
//     armed for the rest of the evening — ready to swallow the next arrival's
//     stale encounter on top of the fight in progress.
//   - The DM seat was reclaimed only when a peer's state arrived, for the same
//     reason, so a DM walking back into their own quiet table was seated as a
//     player.
//   - Which table the stored encounter belonged to was a separate localStorage
//     key with its own lifetime rule, so a brand-new game opened onto last
//     week's fight.
//
// The fix is not a better flag. It is that **"I am synced" has to be an event
// with an outcome**, and an empty room is one of the outcomes — the one that
// could never be observed before, because the only two things that could
// happen were "a reply arrived" and "nothing has happened yet", and those look
// identical from the inside.
//
// So: a joiner asks the room (`syncRequest`), the room answers
// (`syncResponse`), and if nobody answers inside `SYNC_WINDOW_MS` the state
// machine says so out loud. Adoption is scoped to one request id, which is
// what makes a stray state broadcast — from a latecomer, from a peer's ordinary
// edit — no longer adoptable at all. The window ends the *waiting*, never the
// listening: a late answer still merges the ordinary way.

// How long to wait for anyone to answer before concluding the room is empty.
//
// This is a "give up" timer, not a "collect the best answer" timer: the first
// answer wins the adoption and ends the wait, so a busy table pays nothing for
// this number and only an empty one pays it in full. That's what lets it be
// generous enough to survive a slow broker round trip without anyone noticing.
export const SYNC_WINDOW_MS = 750;

export type SessionIntent =
  // Opening a table. A brand-new code, or reopening one that went quiet.
  | { kind: "host"; reopening: boolean }
  // Walking into somebody else's — the case with an unrelated local history.
  | { kind: "join" };

export type ConnectionState =
  | { phase: "offline"; error?: string }
  | { phase: "connecting"; intent: SessionIntent }
  // Connected, and waiting to hear what the room holds.
  | {
      phase: "syncing";
      code: string;
      requestId: string;
      // Whether the answer replaces our state or merely merges with it. Only a
      // joiner adopts: it has an unrelated local history that would otherwise
      // race the room's on a revision number neither side shares. A host *is*
      // the room.
      adopting: boolean;
    }
  | { phase: "live"; code: string };

export type ConnectionEvent =
  | { type: "connect"; intent: SessionIntent }
  | { type: "opened"; code: string; requestId: string }
  | { type: "sync-response"; requestId: string }
  | { type: "sync-window-closed"; requestId: string }
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
        adopting: state.phase === "connecting" && state.intent.kind === "join",
      };
    // Somebody answered. Whatever it was, the waiting is over — a second answer
    // is an ordinary merge, which is what stops two peers' replies fighting over
    // which one gets adopted.
    case "sync-response":
      if (state.phase !== "syncing" || state.requestId !== event.requestId) {
        return state;
      }
      return { phase: "live", code: state.code };
    // Nobody did. The room is empty and our state stands — which for the DM
    // walking back into their own table is not an edge case but the ordinary
    // Thursday.
    case "sync-window-closed":
      if (state.phase !== "syncing" || state.requestId !== event.requestId) {
        return state;
      }
      return { phase: "live", code: state.code };
    case "closed":
      return { phase: "offline", error: event.error };
  }
}

// Whether an arriving answer should replace our state rather than merge with
// it. Scoped to the request it answers, so an answer to *last* join — or a
// stray one addressed to us after we stopped waiting — cannot.
export function adoptsResponse(
  state: ConnectionState,
  requestId: string,
): boolean {
  return (
    state.phase === "syncing" && state.requestId === requestId && state.adopting
  );
}

// What a table opens with.
//
// The encounter is stored per *browser* while a code names a *table*, so the
// two need pairing: `belongsTo` is the code the stored encounter came from.
// Without it, starting a brand-new game opened straight onto the previous
// game's order, round and monsters — the app looking like it had reopened the
// old session rather than started a new one.
//
// Reopening a code keeps what it has, because that *is* walking back into the
// fight you left. The carve-out is prep: an encounter built with no session
// open belongs to nobody but this browser, so a local edit made while
// disconnected clears `belongsTo` and hosting then keeps the six goblins you
// just lined up.
export function encounterForTable(
  stored: Encounter,
  belongsTo: string | undefined,
  intent: SessionIntent,
): Encounter {
  if (intent.kind === "join" || intent.reopening) return stored;
  return belongsTo ? EMPTY_ENCOUNTER : stored;
}
