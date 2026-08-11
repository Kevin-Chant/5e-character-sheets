import {
  HEARTBEAT_MS,
  PRESENCE_QUIET_MS,
  PRESENCE_TTL_MS,
  PresenceEntry,
  prunePresence,
  quietPresences,
  sameClients,
  withoutPresence,
  withPresence,
} from "src/lib/realm/presence";

// The roster, kept alive by a heartbeat. See `presence.ts` for why liveness
// isn't part of any shared document.
//
// An empty roster isn't the same as an empty room: right after connecting,
// every client's roster is empty because announcements are still in flight.
// Anything deciding something from this roster must wait out a heartbeat
// first (e.g. the DM seat is claimed/merged, not derived from presence).
//
// A plain store, not a hook, so the character layer can hold one per shared
// sheet. `use-presence.tsx` is the React wrapper for single-instance callers.

export interface PresenceStoreOptions<P extends object> {
  // Re-announced on every beat and immediately whenever it changes.
  payload: P;
  announce: (payload: P) => void;
  // Whether two announcements say the same thing, so an unchanged beat
  // doesn't produce a new array.
  same: (a: P, b: P) => boolean;
  heartbeatMs?: number;
  ttlMs?: number;
  quietMs?: number;
}

export interface PresenceSnapshot<P extends object> {
  roster: PresenceEntry<P>[];
  // Present but not heard from lately — see PRESENCE_QUIET_MS.
  quiet: string[];
}

export interface PresenceStore<P extends object> {
  getSnapshot: () => PresenceSnapshot<P>;
  subscribe: (listener: () => void) => () => void;
  update: (options: Partial<PresenceStoreOptions<P>>) => void;
  // Idempotent: setting the same value doesn't restart the interval.
  setConnected: (connected: boolean) => void;
  // Announce outside the beat; owner calls on connect and payload changes.
  announceNow: () => void;
  saw: (clientId: string, incoming: P) => void;
  touch: (clientId: string) => void;
  left: (clientId: string) => void;
  reset: () => void;
  dispose: () => void;
}

export function createPresenceStore<P extends object>(
  initial: PresenceStoreOptions<P>,
): PresenceStore<P> {
  let options = initial;
  const heartbeatMs = initial.heartbeatMs ?? HEARTBEAT_MS;
  const ttlMs = initial.ttlMs ?? PRESENCE_TTL_MS;
  const quietMs = initial.quietMs ?? PRESENCE_QUIET_MS;

  let snapshot: PresenceSnapshot<P> = { roster: [], quiet: [] };
  const listeners = new Set<() => void>();
  const commit = (next: PresenceSnapshot<P>) => {
    if (next.roster === snapshot.roster && next.quiet === snapshot.quiet)
      return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const setRoster = (roster: PresenceEntry<P>[]) =>
    commit({ ...snapshot, roster });
  const setQuiet = (quiet: string[]) => commit({ ...snapshot, quiet });

  // Kept outside the roster so a heartbeat doesn't re-render list consumers.
  const lastSeen = new Map<string, number>();

  const dropQuiet = (clientId: string) => {
    if (!snapshot.quiet.includes(clientId)) return;
    setQuiet(snapshot.quiet.filter((id) => id !== clientId));
  };

  let connected = false;
  let beat: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (beat) clearInterval(beat);
    beat = undefined;
  };

  const reset = () => {
    lastSeen.clear();
    commit({
      roster: snapshot.roster.length === 0 ? snapshot.roster : [],
      quiet: snapshot.quiet.length === 0 ? snapshot.quiet : [],
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (next) => {
      options = { ...options, ...next };
    },
    setConnected: (next) => {
      if (next === connected) return;
      connected = next;
      if (!connected) {
        stop();
        reset();
        return;
      }
      // Connect-time announce is not here — the owner drives it via
      // announceNow to avoid double-announcing on payload change.
      beat = setInterval(() => {
        options.announce(options.payload);
        const now = Date.now();
        const kept = prunePresence(snapshot.roster, lastSeen, now, ttlMs);
        // Read off the pruned roster so nobody is both quiet and forgotten.
        const nextQuiet = quietPresences(kept, lastSeen, now, quietMs);
        commit({
          roster: kept,
          quiet: sameClients(snapshot.quiet, nextQuiet)
            ? snapshot.quiet
            : nextQuiet,
        });
      }, heartbeatMs);
    },
    announceNow: () => options.announce(options.payload),
    saw: (clientId, incoming) => {
      lastSeen.set(clientId, Date.now());
      dropQuiet(clientId);
      setRoster(
        withPresence(snapshot.roster, clientId, incoming, options.same),
      );
    },
    // Any inbound message refreshes the clock (not just heartbeats — useful
    // on throttled mobile tabs). Not an upsert: no payload here, so a named
    // roster entry must not be replaced by an unnamed one.
    touch: (clientId) => {
      if (!lastSeen.has(clientId)) return;
      lastSeen.set(clientId, Date.now());
      dropQuiet(clientId);
    },
    left: (clientId) => {
      lastSeen.delete(clientId);
      dropQuiet(clientId);
      setRoster(withoutPresence(snapshot.roster, clientId));
    },
    reset,
    dispose: () => {
      stop();
      listeners.clear();
    },
  };
}
