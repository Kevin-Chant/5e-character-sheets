import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEARTBEAT_MS,
  PRESENCE_TTL_MS,
  PresenceEntry,
  prunePresence,
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
}

export function usePresence<P extends object>({
  connected,
  payload,
  announce,
  same,
  heartbeatMs = HEARTBEAT_MS,
  ttlMs = PRESENCE_TTL_MS,
}: UsePresenceOptions<P>) {
  const [roster, setRoster] = useState<PresenceEntry<P>[]>([]);
  // Outside the roster deliberately: a peer's heartbeat updates this ten times
  // a minute and must not re-render anything looking at the list.
  const lastSeen = useRef(new Map<string, number>());

  // Read through refs — the interval below is registered once and would
  // otherwise announce the name we had when it started.
  const current = useRef({ payload, announce, same });
  current.current = { payload, announce, same };

  const saw = useCallback((clientId: string, incoming: P) => {
    lastSeen.current.set(clientId, Date.now());
    setRoster((existing) =>
      withPresence(existing, clientId, incoming, current.current.same),
    );
  }, []);

  const left = useCallback((clientId: string) => {
    lastSeen.current.delete(clientId);
    setRoster((existing) => withoutPresence(existing, clientId));
  }, []);

  const reset = useCallback(() => {
    lastSeen.current.clear();
    setRoster([]);
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
      setRoster((existing) =>
        prunePresence(existing, lastSeen.current, Date.now(), ttlMs),
      );
    }, heartbeatMs);
    return () => clearInterval(beat);
  }, [connected, heartbeatMs, ttlMs, reset]);

  return {
    roster,
    saw,
    left,
    reset,
  };
}
