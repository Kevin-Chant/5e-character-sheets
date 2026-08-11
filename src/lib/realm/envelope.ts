// Common envelope shape shared by the character-sharing and party-session
// realtime protocols. Both stamp `clientId` (broker doesn't honour WAMP
// `exclude_me`, so self-echo must be filtered) and `toClientId` for addressed
// messages; validated here once instead of per-layer.

// Bump when a message shape changes in a way an older client would misread.
// v2: party bootstrap became addressed syncRequest/syncResponse instead of
//   broadcast hello/state.
// v3: encounter convergence moved to per-lane counters; older/unversioned
//   messages are now dropped as "stale" too (they carry no lane counters and
//   would merge wrong), not just newer ones.
// v4: character edits carry the uuid of the character they edit; an
//   unversioned dispatch can't be routed safely, so it's dropped as "stale".
// A version bump reloads both layers since they share PROTOCOL_VERSION.
export const PROTOCOL_VERSION = 4;

export interface Envelope {
  // Also the topic key — see each layer's `TOPIC_FOR`.
  kind: string;
  clientId: string;
  v?: number;
  // Addressed, not private: everyone receives it, non-addressees drop it here.
  toClientId?: string;
}

export type RejectionReason =
  | "malformed"
  | "self"
  | "future"
  | "stale"
  | "unknown-kind"
  | "not-ours";

export type Accepted<M> =
  | { ok: true; message: M }
  | { ok: false; reason: RejectionReason };

// Stamps an outgoing message with PROTOCOL_VERSION.
export function stamp<M extends { kind: string; clientId: string }>(
  message: M,
): M & { v: number } {
  return { ...message, v: PROTOCOL_VERSION };
}

// Validates an inbound message before any handler sees it. Self-echo is
// checked before kind, so a subscriber that doesn't handle its own published
// kind still reports "self" rather than "unknown-kind".
export function accept<K extends string>(
  raw: unknown,
  options: { clientId: string; kinds: readonly K[] },
): Accepted<Envelope & { kind: K }> {
  if (!raw || typeof raw !== "object")
    return { ok: false, reason: "malformed" };
  const message = raw as Partial<Envelope>;
  if (
    typeof message.kind !== "string" ||
    typeof message.clientId !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (message.clientId === options.clientId)
    return { ok: false, reason: "self" };
  // Absent version is treated as older than any real version.
  const version = message.v ?? 0;
  if (version !== PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: version > PROTOCOL_VERSION ? "future" : "stale",
    };
  }
  if (!options.kinds.includes(message.kind as K)) {
    return { ok: false, reason: "unknown-kind" };
  }
  if (message.toClientId && message.toClientId !== options.clientId) {
    return { ok: false, reason: "not-ours" };
  }
  return { ok: true, message: message as Envelope & { kind: K } };
}
