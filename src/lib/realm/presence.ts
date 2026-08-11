// Who is connected right now, by whatever each layer needs to call them.
// Transient per-connection state, not part of any shared document — liveness
// doesn't merge by revision.

// Re-announce this often; forget a peer unheard-from for this long. Timeout
// is three heartbeats so one dropped beat doesn't flap an active editor out.
export const HEARTBEAT_MS = 10_000;
export const PRESENCE_TTL_MS = 30_000;

// Heard from inside this window: live. Past it: quiet, not gone.
// Two thresholds because a backgrounded mobile tab throttles timers to ~1/min
// — a single timeout can't both catch a real drop quickly and avoid flapping
// every backgrounded phone.
export const PRESENCE_QUIET_MS = 25_000;

// Roster entries unheard-from inside quietMs. Sorted for stable comparison —
// callers keep the previous array when nothing moved.
export function quietPresences<P extends object>(
  roster: PresenceEntry<P>[],
  lastSeen: Map<string, number>,
  now: number,
  quietMs: number = PRESENCE_QUIET_MS,
): string[] {
  return roster
    .filter((c) => now - (lastSeen.get(c.clientId) ?? 0) > quietMs)
    .map((c) => c.clientId)
    .sort();
}

export function sameClients(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Whatever the layer announces, plus who said it. Flattened so consumers
// read `entry.name` directly.
export type PresenceEntry<P> = P & { clientId: string };

// Upsert, order-stable, so an unchanged beat returns the same array.
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

// Drops everyone unheard-from inside the timeout.
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
