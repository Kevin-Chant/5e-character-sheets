import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createPresenceStore,
  PresenceStore,
  PresenceStoreOptions,
} from "src/lib/realm/presence-store";

// React wrapper over presence-store.ts for a layer that wants exactly one
// roster for as long as it is mounted.

export interface UsePresenceOptions<
  P extends object,
> extends PresenceStoreOptions<P> {
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

  // Keeps the beat's options current — it's registered once at connect.
  store.update({ payload, announce, same });

  const { roster, quiet } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  useEffect(() => {
    store.setConnected(connected);
  }, [store, connected]);

  // Announce on connect and whenever the payload changes.
  useEffect(() => {
    if (!connected) return;
    announce(payload);
  }, [connected, payload, announce]);

  useEffect(() => () => store.dispose(), [store]);

  return useMemo(
    () => ({
      roster,
      quiet,
      saw: store.saw,
      touch: store.touch,
      left: store.left,
      reset: store.reset,
    }),
    [store, roster, quiet],
  );
}
