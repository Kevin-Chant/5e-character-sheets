import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSettings } from "src/lib/hooks/use-settings";
import { Envelope } from "src/lib/realm/envelope";
import {
  createRealm,
  RealmInstance,
  RealmResult,
  RealmStatus,
} from "src/lib/realm/realm";

// React wrapper over realm.ts for a layer that wants exactly one realm for
// as long as it is mounted (the party-session layer).

export type {
  RealmStatus,
  RealmFailure,
  RealmFailed,
  RealmResult,
} from "src/lib/realm/realm";

export interface UseRealmOptions<K extends string> {
  clientId: string;
  topics: Record<K, string>;
  onMessage: (message: Envelope & { kind: K }) => void;
  onClosed?: () => void;
  queueWhileOffline?: (kind: K) => boolean;
}

export function useRealm<K extends string>({
  clientId,
  topics,
  onMessage,
  onClosed,
  queueWhileOffline,
}: UseRealmOptions<K>) {
  const {
    settings: { liveEditHost },
  } = useSettings();

  // One instance for the lifetime of the component.
  const instanceRef = useRef<RealmInstance<K>>();
  if (!instanceRef.current) {
    instanceRef.current = createRealm<K>({
      clientId,
      liveEditHost,
      topics,
      onMessage,
      onClosed,
      queueWhileOffline,
    });
  }
  const instance = instanceRef.current;

  // Updated during render (not an effect) so a connect started in the same
  // commit sees current handlers — subscriptions are registered once, at
  // connect, and would otherwise close over stale callbacks.
  instance.update({
    clientId,
    liveEditHost,
    topics,
    onMessage,
    onClosed,
    queueWhileOffline,
  });

  const { status, error, realm } = useSyncExternalStore(
    instance.subscribe,
    instance.getSnapshot,
  );

  useEffect(() => () => instance.dispose(), [instance]);

  return useMemo(
    () => ({
      status: status as RealmStatus,
      error,
      realm,
      connect: instance.connect,
      close: instance.close,
      refuse: instance.refuse,
      publish: instance.publish,
      register: instance.register,
      call: instance.call,
      connected: instance.connected,
    }),
    [instance, status, error, realm],
  );
}

export type { RealmInstance } from "src/lib/realm/realm";
export type UseRealmResult<K extends string> = ReturnType<typeof useRealm<K>>;
export type { RealmResult as RealmConnectResult };
