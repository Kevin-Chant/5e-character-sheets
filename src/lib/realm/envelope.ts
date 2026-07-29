// The one shape every realtime message travels in, on either layer.
//
// There are two realtime protocols in this app — characters co-edited over a
// realm named for the character (`use-sharing-session`), and party sessions
// over a realm named for the session code (`use-play-session`) — and they were
// written a year apart with nothing in common but their habits. Both stamp a
// `clientId` on every message and drop their own echo, because the broker does
// not honour WAMP `exclude_me`; both address some messages to one peer by
// putting a `toClientId` in the body and having every other client check it.
// Written twice, those are two chances to forget the check. Written here, they
// are one function that every inbound message passes through before any handler
// sees it.
//
// What this adds beyond what the two layers already did:
//
//   - **A version.** Nothing on the wire carried one, so a client running an
//     older build could hand a newer one a shape it didn't expect, and the only
//     way to find out was a white screen mid-fight. Now an unknown future
//     version is dropped at the boundary.
//   - **A reason.** Rejections are typed rather than a bare `return`, so a test
//     can assert *why* a message was ignored, and a stray one is debuggable.

// Bump when a message shape changes in a way an older client would misread.
//
// 2: the party session's bootstrap became an addressed request/response pair
// (`syncRequest`/`syncResponse`) instead of a broadcast `hello` answered with a
// broadcast `state`. A tab on the old build asks a question nobody is listening
// for any more; making that explicit is what the version is for.
//
// 3: the encounter's convergence model changed — per-lane counters replaced
// the per-row blob rev. This bump also changed the *policy*: an older or
// unversioned message is now dropped too (`stale`), not just a newer one. A
// v2 document carries no lane counters, so merging it would make every one of
// its edits silently lose every lane tie — a client that converges wrongly.
// Dropping it entirely means a mismatched pair of tabs each see an empty room
// and keep their own working state: a fresh join, not a corruption.
export const PROTOCOL_VERSION = 3;

export interface Envelope {
  // The kind is also the topic key — see each layer's `TOPIC_FOR`.
  kind: string;
  // Who sent it. Every message carries one because the broker echoes publishes
  // back to their publisher, so "not mine" is the only way to tell a peer's
  // message from our own.
  clientId: string;
  v?: number;
  // Addressed, not private: everyone receives it (the broker has no private
  // lanes) and everyone but the addressee drops it here.
  toClientId?: string;
}

export type RejectionReason =
  // Not an object, or missing the fields every message must have.
  | "malformed"
  // Our own publish, echoed back to us.
  | "self"
  // A newer client than us. Dropping is the whole point of the version.
  | "future"
  // An older (or unversioned) client. Its documents predate the lane
  // counters, so they cannot merge — see the PROTOCOL_VERSION note.
  | "stale"
  // A kind this subscriber doesn't handle.
  | "unknown-kind"
  // Addressed to somebody else.
  | "not-ours";

export type Accepted<M> =
  | { ok: true; message: M }
  | { ok: false; reason: RejectionReason };

// Stamp an outgoing message. The caller supplies `kind` and `clientId` as part
// of the message (both layers' types already require them); this adds the
// version, so no protocol has to remember to.
export function stamp<M extends { kind: string; clientId: string }>(
  message: M,
): M & { v: number } {
  return { ...message, v: PROTOCOL_VERSION };
}

// Everything an inbound message must survive before a handler sees it.
//
// Order matters only for what a test reads back: self-echo is checked before
// kind so that a subscriber which doesn't handle its own published kind still
// reports "self" rather than "unknown-kind", which is the more useful answer
// when you are staring at a message that went missing.
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
  // Absent means "from before there were versions", which is older than v3.
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
