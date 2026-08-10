import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSettings } from "src/lib/hooks/use-settings";
import { Envelope } from "src/lib/realm/envelope";
import {
  createRealm,
  RealmInstance,
  RealmResult,
  RealmStatus,
} from "src/lib/realm/realm";

// The React face of `realm.ts`, for a layer that wants exactly **one** realm
// for as long as it is mounted — which is the party-session layer, because a
// browser sits at one table.
//
// The transport itself is a plain factory (see the note at the top of
// `realm.ts`): a hook can only ever hold one of a thing, and the character
// layer needs one realm per shared sheet. This wrapper is what's left once that
// moved out — instantiate, keep the handlers current, re-render on status
// changes, dispose on unmount.

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

  // One instance for the lifetime of the component. `useMemo` rather than a
  // lazy ref only because there is nothing to recompute it on: the identity is
  // the point.
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

  // The handlers-through-refs knot both layers used to tie by hand: the
  // subscriptions are registered once, at connect, and would otherwise call the
  // closures that existed at that moment for the rest of the session. Updated
  // during render (not in an effect) so a connect started in the same commit
  // already sees the current ones.
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

  // A component that unmounts with a live interval keeps probing a socket
  // nobody is listening to.
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
