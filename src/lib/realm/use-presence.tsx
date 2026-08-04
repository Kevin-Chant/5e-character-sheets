import { useCallback, useEffect, useRef, useState } from "react";
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

export interface UsePresenceOptions<P extends object> {
  // Only heartbeat while there is a connection to heartbeat over.
  connected: boolean;
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

export function usePresence<P extends object>({
  connected,
  payload,
  announce,
  same,
  heartbeatMs = HEARTBEAT_MS,
  ttlMs = PRESENCE_TTL_MS,
  quietMs = PRESENCE_QUIET_MS,
}: UsePresenceOptions<P>) {
  const [roster, setRoster] = useState<PresenceEntry<P>[]>([]);
  // On the roster, but not heard from lately. Kept as its own piece of state
  // rather than derived at render time because "how long ago" only changes with
  // the clock, and a consumer that recomputed it per render would show whatever
  // the last unrelated re-render happened to catch.
  const [quiet, setQuiet] = useState<string[]>([]);
  // Outside the roster deliberately: a peer's heartbeat updates this ten times
  // a minute and must not re-render anything looking at the list.
  const lastSeen = useRef(new Map<string, number>());
  // The beat is registered once and reads the roster to prune it; a functional
  // update can't be used for that, because it also has to write the quiet set
  // from the same answer.
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  // Read through refs — the interval below is registered once and would
  // otherwise announce the name we had when it started.
  const current = useRef({ payload, announce, same });
  current.current = { payload, announce, same };

  const saw = useCallback((clientId: string, incoming: P) => {
    lastSeen.current.set(clientId, Date.now());
    setQuiet((existing) =>
      existing.includes(clientId)
        ? existing.filter((id) => id !== clientId)
        : existing,
    );
    setRoster((existing) =>
      withPresence(existing, clientId, incoming, current.current.same),
    );
  }, []);

  // A peer said *something* — not necessarily who they are.
  //
  // A client publishing an encounter, a roll or a ruling is as alive as one
  // sending a heartbeat, and on a throttled mobile tab it is often the only
  // thing still getting out: the announce interval is capped to about a beat a
  // minute in the background while a publish triggered by a tap goes straight
  // away. So every inbound message refreshes the clock. Deliberately *not* an
  // upsert — we have no payload here, and a client on the roster under a name
  // must not be replaced by one without.
  const touch = useCallback((clientId: string) => {
    if (!lastSeen.current.has(clientId)) return;
    lastSeen.current.set(clientId, Date.now());
    setQuiet((existing) =>
      existing.includes(clientId)
        ? existing.filter((id) => id !== clientId)
        : existing,
    );
  }, []);

  const left = useCallback((clientId: string) => {
    lastSeen.current.delete(clientId);
    setQuiet((existing) =>
      existing.includes(clientId)
        ? existing.filter((id) => id !== clientId)
        : existing,
    );
    setRoster((existing) => withoutPresence(existing, clientId));
  }, []);

  const reset = useCallback(() => {
    lastSeen.current.clear();
    setRoster([]);
    setQuiet((existing) => (existing.length === 0 ? existing : []));
  }, []);

  // Announce on connect and whenever what we'd announce changes. Peers upsert,
  // so re-announcing is free.
  useEffect(() => {
    if (!connected) return;
    announce(payload);
  }, [connected, payload, announce]);

  // The beat: say we're still here, and forget anyone who hasn't.
  useEffect(() => {
    if (!connected) {
      reset();
      return;
    }
    const beat = setInterval(() => {
      current.current.announce(current.current.payload);
      const now = Date.now();
      const kept = prunePresence(
        rosterRef.current,
        lastSeen.current,
        now,
        ttlMs,
      );
      setRoster(kept);
      // Read off the *pruned* roster, so a client can never be listed as quiet
      // and forgotten at the same time.
      setQuiet((previous) => {
        const next = quietPresences(kept, lastSeen.current, now, quietMs);
        return sameClients(previous, next) ? previous : next;
      });
    }, heartbeatMs);
    return () => clearInterval(beat);
  }, [connected, heartbeatMs, ttlMs, quietMs, reset]);

  return {
    roster,
    // Present, but not heard from lately — see `PRESENCE_QUIET_MS`.
    quiet,
    saw,
    touch,
    left,
    reset,
  };
}
