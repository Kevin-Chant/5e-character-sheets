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

// The roster, kept alive by a heartbeat. See `presence.ts` for why liveness is
// not part of any shared document.
//
// **An empty roster is not the same as an empty room**, and nothing here can
// tell you which one you have. Right after connecting, every client's roster is
// empty because the announcements are still in flight.
//
// This is why the DM seat is claimed and merged rather than derived from who is
// present, which is otherwise the tidier design: during that window every
// client would agree that nobody holds the seat, and "an unclaimed seat means
// everyone runs combat" would hand the controls to the whole table on every
// join. Anything that ever *does* want to decide something from this roster
// needs to wait out a heartbeat first, and should say so where it waits.
//
// A plain store rather than a hook, for the same reason `realm.ts` is: the
// character layer holds one of these per shared sheet, and a hook can only hold
// one. `use-presence.tsx` is the React wrapper for the layers that want exactly
// one.

export interface PresenceStoreOptions<P extends object> {
  // What to say about ourselves. Re-announced on every beat, and immediately
  // whenever it changes — opening a character mid-session renames you.
  payload: P;
  // Publish it. The layer owns its own message shape.
  announce: (payload: P) => void;
  // Whether two announcements say the same thing, so an unchanged beat doesn't
  // produce a new array.
  same: (a: P, b: P) => boolean;
  heartbeatMs?: number;
  ttlMs?: number;
  quietMs?: number;
}

export interface PresenceSnapshot<P extends object> {
  roster: PresenceEntry<P>[];
  // Present, but not heard from lately — see `PRESENCE_QUIET_MS`.
  quiet: string[];
}

export interface PresenceStore<P extends object> {
  getSnapshot: () => PresenceSnapshot<P>;
  subscribe: (listener: () => void) => () => void;
  update: (options: Partial<PresenceStoreOptions<P>>) => void;
  // Only beat while there is a connection to beat over. Idempotent: calling it
  // with the value it already has does nothing, so a re-render can't restart
  // the interval.
  setConnected: (connected: boolean) => void;
  // Say who we are now, outside the beat. The owner calls this on connect and
  // whenever the payload changes; peers upsert, so re-announcing is free.
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

  // Outside the roster deliberately: a peer's heartbeat updates this ten times
  // a minute and must not re-render anything looking at the list.
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
      // Announcing on connect is deliberately *not* here: the caller also has
      // to re-announce whenever the payload changes (opening a character
      // mid-session renames you), and doing both would double every join. The
      // owner drives it through `announceNow`.
      //
      // The beat: say we're still here, and forget anyone who hasn't.
      beat = setInterval(() => {
        options.announce(options.payload);
        const now = Date.now();
        const kept = prunePresence(snapshot.roster, lastSeen, now, ttlMs);
        // Read off the *pruned* roster, so a client can never be listed as
        // quiet and forgotten at the same time.
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
    // A peer said *something* — not necessarily who they are.
    //
    // A client publishing an encounter, a roll or a ruling is as alive as one
    // sending a heartbeat, and on a throttled mobile tab it is often the only
    // thing still getting out: the announce interval is capped to about a beat
    // a minute in the background while a publish triggered by a tap goes
    // straight away. So every inbound message refreshes the clock. Deliberately
    // *not* an upsert — we have no payload here, and a client on the roster
    // under a name must not be replaced by one without.
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
