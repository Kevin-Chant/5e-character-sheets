import { normalizeSessionCode } from "src/lib/play/session";
import { SessionMemory } from "src/lib/play/session-memory";
import { SessionStatus } from "src/lib/hooks/use-play-session";

// Getting back to the table you were already at.
//
// The problem this solves is not a rare one. A phone browser is evicted from
// memory the moment something else wants it — a call, a camera, a map — and
// what comes back is a *fresh page load*: React state gone, socket gone,
// encounter provider re-mounted from localStorage. Before this module the URL
// said `/play`, which names a surface and not a table, so the way back was to
// find the code and paste it, mid-fight, on a phone.
//
// So the session goes in the URL, exactly as the open sheet does at
// `/sheet/<uuid>`, and the answer to "what do I do with a code in the URL"
// lives here, pure, rather than in three conditions inside an effect.
//
// The three answers are genuinely different acts:
//
//  - **Rejoin.** This browser has been at this table before, so it knows what
//    it brought and which seat it sat in. Nothing to ask: reconnect and carry
//    on. This is the tab-eviction case, and it should cost zero taps.
//  - **Lobby.** A code this browser has never seen is an invitation, not a
//    resumption — which sheet to bring is a question, and `/join/<code>` is
//    the surface that asks it.
//  - **Wait.** A connection is already in flight, or we're where we meant to
//    be.

export type RejoinPlan =
  // Already at the table named in the URL.
  | { action: "connected" }
  // Something is in flight, or there is nothing to act on yet.
  | { action: "wait" }
  // Reconnect to a table this browser knows, without asking anything.
  | { action: "rejoin"; code: string; seat: "dm" | "player" }
  // A code we've never used: send it through the invite route, which probes
  // the realm and puts the lobby's questions in front of the player.
  | { action: "lobby"; code: string };

export interface RejoinContext {
  // The code in the URL, if any.
  urlCode?: string;
  status: SessionStatus;
  // What this browser remembers about `urlCode`.
  memory?: SessionMemory;
  // Whether the code was also this browser's last session. A table can be
  // known through `lastSession` alone — the memory list is capped, and an
  // entry can be forgotten — and being the last one we were in is at least as
  // strong a claim to "we've been here".
  wasLast?: boolean;
  // How many times we've already tried to get in on this code, so a table
  // that is genuinely closed doesn't spin. Timing is the caller's; this only
  // decides that there is nothing left to try.
  attempts?: number;
}

// Give up asking after this many tries. A DM whose table has genuinely ended
// shouldn't have a phone in their pocket reconnecting all night, and the
// surface still offers a manual rejoin — this only ends the *automatic* part.
export const MAX_REJOIN_ATTEMPTS = 6;

export function planRejoin({
  urlCode,
  status,
  memory,
  wasLast,
  attempts = 0,
}: RejoinContext): RejoinPlan {
  if (!urlCode) return { action: "wait" };
  const code = normalizeSessionCode(urlCode);
  // Connected is connected, even to a *different* table than the URL names:
  // a live session is never torn down to obey a stale link, so the caller
  // rewrites the address bar to match the session rather than the reverse.
  if (status === "connected") return { action: "connected" };
  if (status === "connecting") return { action: "wait" };
  const known = !!memory || !!wasLast;
  if (!known) return { action: "lobby", code };
  if (attempts >= MAX_REJOIN_ATTEMPTS) return { action: "wait" };
  return {
    action: "rejoin",
    code,
    seat: memory?.seat === "dm" ? "dm" : "player",
  };
}

// How long to wait before the next attempt.
//
// Backing off matters more here than it usually does: the reason we're
// retrying at all is usually that the network is bad, and a phone that has
// just come back from a tunnel will fail its first attempt and succeed on its
// second. The first retry is quick because most drops are momentary; the tail
// is long because the remaining case is a table nobody has reopened yet.
const REJOIN_BACKOFF_MS = [500, 2_000, 5_000, 15_000, 30_000, 60_000];

export function rejoinDelayMs(attempt: number): number {
  return REJOIN_BACKOFF_MS[Math.min(attempt, REJOIN_BACKOFF_MS.length - 1)];
}

// The URL the surface should be showing. The session is the truth — a code
// that connected is a code worth linking to, and one we never got into is not
// worth rewriting the address bar for.
export function playPathFor(sessionCode?: string): string {
  return sessionCode ? `/play/${normalizeSessionCode(sessionCode)}` : "/play";
}
