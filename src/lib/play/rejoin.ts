import { backoffDelayMs, RECONNECT_JITTER } from "src/lib/realm/backoff";
import { normalizeSessionCode } from "src/lib/play/session";
import { SessionMemory } from "src/lib/play/session-memory";
import { SessionStatus } from "src/lib/hooks/use-play-session";

// Decides what to do with a session code found in the URL (`/play/<code>`),
// e.g. on a fresh page load after a phone browser evicted the tab.
//
//  - rejoin: this browser has been at this table before — reconnect, no ask.
//  - lobby: an unseen code is an invitation; `/join/<code>` asks which sheet.
//  - wait: a connection is in flight, or already there.

export type RejoinPlan =
  | { action: "connected" }
  | { action: "wait" }
  | { action: "rejoin"; code: string; seat: "dm" | "player" }
  | { action: "lobby"; code: string };

export interface RejoinContext {
  urlCode?: string;
  status: SessionStatus;
  memory?: SessionMemory;
  // "Was this our last session" counts as knowing the table even with no
  // memory entry — the memory list is capped and can forget it.
  wasLast?: boolean;
  attempts?: number;
  // Past the cap the retry continues only while the tab is on screen.
  visible?: boolean;
}

// Attempts after which the surface stops promising a reconnect and offers a
// manual button; retrying continues at the tail delay while visible.
export const MAX_REJOIN_ATTEMPTS = 6;

export function planRejoin({
  urlCode,
  status,
  memory,
  wasLast,
  attempts = 0,
  visible = true,
}: RejoinContext): RejoinPlan {
  // "connected" wins even against a different table than the URL names — a
  // live session is never torn down for a stale link — and is answered
  // before the URL is read, so a session started here also stamps the URL.
  if (status === "connected") return { action: "connected" };
  if (!urlCode) return { action: "wait" };
  const code = normalizeSessionCode(urlCode);
  if (status === "connecting") return { action: "wait" };
  const known = !!memory || !!wasLast;
  if (!known) return { action: "lobby", code };
  if (attempts >= MAX_REJOIN_ATTEMPTS && !visible) return { action: "wait" };
  return {
    action: "rejoin",
    code,
    seat: memory?.seat === "dm" ? "dm" : "player",
  };
}

// Fast first retry (most drops are momentary), long tail (the remaining
// case is a table nobody has reopened yet).
const REJOIN_BACKOFF_MS = [500, 2_000, 5_000, 15_000, 30_000, 60_000];

export function rejoinDelayMs(attempt: number): number {
  return backoffDelayMs(attempt, REJOIN_BACKOFF_MS, RECONNECT_JITTER);
}

// The URL the surface should show; only a code we actually connected to.
export function playPathFor(sessionCode?: string): string {
  return sessionCode ? `/play/${normalizeSessionCode(sessionCode)}` : "/play";
}

// The URL's code is only ever replaced by another code, never dropped for a
// session that hasn't reported one yet.
export function shouldRestamp(
  urlCode: string | undefined,
  sessionCode: string | undefined,
): boolean {
  return !!sessionCode && normalizeSessionCode(sessionCode) !== urlCode;
}
