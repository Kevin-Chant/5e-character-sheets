import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createPresenceStore,
  PresenceStore,
  PresenceStoreOptions,
} from "src/lib/realm/presence-store";

// The React face of `presence-store.ts`, for a layer that wants exactly one
// roster for as long as it is mounted. The store itself is a plain factory for
// the same reason the transport is — the character layer holds one per shared
// sheet. See the note at the top of `presence-store.ts`.

export interface UsePresenceOptions<
  P extends object,
> extends PresenceStoreOptions<P> {
  // Only heartbeat while there is a connection to heartbeat over.
  connected: boolean;
}

export function usePresence<P extends object>({
  connected,
  payload,
  announce,
  same,
  heartbeatMs,
  ttlMs,
  quietMs,
}: UsePresenceOptions<P>) {
  const storeRef = useRef<PresenceStore<P>>();
  if (!storeRef.current) {
    storeRef.current = createPresenceStore<P>({
      payload,
      announce,
      same,
      heartbeatMs,
      ttlMs,
      quietMs,
    });
  }
  const store = storeRef.current;

  // Read through the store's live options — the beat is registered once and
  // would otherwise announce the name we had when it started.
  store.update({ payload, announce, same });

  const { roster, quiet } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  useEffect(() => {
    store.setConnected(connected);
  }, [store, connected]);

  // Announce on connect and whenever what we'd announce changes. Peers upsert,
  // so re-announcing is free.
  useEffect(() => {
    if (!connected) return;
    announce(payload);
  }, [connected, payload, announce]);

  useEffect(() => () => store.dispose(), [store]);

  return useMemo(
    () => ({
      roster,
      // Present, but not heard from lately — see `PRESENCE_QUIET_MS`.
      quiet,
      saw: store.saw,
      touch: store.touch,
      left: store.left,
      reset: store.reset,
    }),
    [store, roster, quiet],
  );
}
