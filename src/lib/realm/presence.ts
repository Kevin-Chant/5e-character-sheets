// Who is connected right now, by whatever each layer needs to call them.
//
// **Transient per-connection state, deliberately not part of any shared
// document.** It isn't persisted and isn't merged: putting liveness into a
// document that converges by revision would mean deciding who is awake by
// comparing counters, which is a category error. It exists because a client
// without a row of its own — a sheetless player waiting to be handed a
// character, someone else editing a sheet — is otherwise invisible.
//
// Both layers had a roster; only one had a heartbeat. The character layer
// re-announces every 10s and drops a peer unheard-from for 30s, so a tab that
// died without saying goodbye eventually stops being listed. The play layer
// had the roster and no heartbeat at all, so a crashed player sat in the DM's
// "hand a sheet to…" picker until the session turned over. This is the
// character layer's model, made generic over what a layer announces.

// Re-announce this often; forget a peer unheard-from for this long. The
// timeout is three heartbeats on purpose — one dropped beat must not flap an
// active editor out of the list.
export const HEARTBEAT_MS = 10_000;
export const PRESENCE_TTL_MS = 30_000;

// An entry is whatever the layer announces, plus who said it. Flattened rather
// than nested so a consumer reads `entry.name`, which is what both layers'
// rosters already looked like.
export type PresenceEntry<P> = P & { clientId: string };

// Upsert, order-stable: a heartbeat arrives every 10s per peer, and reshuffling
// a dropdown the DM is looking at — or returning a new array that re-renders
// it — is the cost of getting this wrong. Unchanged means the *same array*.
export function withPresence<P extends object>(
  roster: PresenceEntry<P>[],
  clientId: string,
  payload: P,
  same: (a: P, b: P) => boolean,
): PresenceEntry<P>[] {
  const existing = roster.find((c) => c.clientId === clientId);
  if (existing && same(existing, payload)) return roster;
  if (!existing) return [...roster, { ...payload, clientId }];
  return roster.map((c) =>
    c.clientId === clientId ? { ...payload, clientId } : c,
  );
}

export function withoutPresence<P extends object>(
  roster: PresenceEntry<P>[],
  clientId: string,
): PresenceEntry<P>[] {
  if (!roster.some((c) => c.clientId === clientId)) return roster;
  return roster.filter((c) => c.clientId !== clientId);
}

// Drop everyone we haven't heard from inside the timeout. `lastSeen` is kept
// outside the roster (see `use-presence`) precisely so that a heartbeat which
// changes nothing else doesn't have to produce a new array.
export function prunePresence<P extends object>(
  roster: PresenceEntry<P>[],
  lastSeen: Map<string, number>,
  now: number,
  ttlMs: number = PRESENCE_TTL_MS,
): PresenceEntry<P>[] {
  const stale = roster.filter(
    (c) => now - (lastSeen.get(c.clientId) ?? 0) > ttlMs,
  );
  if (stale.length === 0) return roster;
  const gone = new Set(stale.map((c) => c.clientId));
  return roster.filter((c) => !gone.has(c.clientId));
}
