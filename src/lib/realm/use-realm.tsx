import { useCallback, useRef, useState } from "react";
// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { accept, Envelope, stamp } from "src/lib/realm/envelope";
import { useSettings } from "src/lib/hooks/use-settings";

// One WAMP realm, joined. The half of both realtime layers that is about
// sockets rather than about the game.
//
// Both layers grew their own copy of this — the same connect sequence, the same
// "keep the connection in a ref so it can be read synchronously", the same
// `onclose` returning true to defeat autobahn's auto-reconnect, the same two
// error strings word for word. Two copies is why the good ideas ended up in
// only one of them: the character layer has a presence heartbeat and the play
// layer does not; the play layer awaits its subscriptions before announcing and
// the character layer does not. This is the shared half, so the next good idea
// lands once.
//
// What is deliberately *not* here: what the messages mean. A realm doesn't know
// whether it carries an encounter or a character sheet, which is what lets the
// two protocols keep their genuinely different shapes (a peer mesh with no
// owner; an owned document with a host serving `FULL_SYNC`).

type Connection = any;

export type RealmStatus = "offline" | "connecting" | "connected" | "error";

export type RealmFailure =
  // The sidecar didn't answer at all — wrong host, or it's down.
  | "unreachable"
  // It answered, but refused to open the realm.
  | "refused"
  // Nothing is hosting this realm. Far more often a typo than an outage.
  | "absent"
  // It accepted the realm and then dropped the connection anyway.
  | "closed";

export interface RealmFailed {
  ok: false;
  reason: RealmFailure;
  // Ready to show; the callers were all writing their own copies of these.
  message: string;
}

export type RealmResult = { ok: true } | RealmFailed;

const MESSAGES: Record<RealmFailure, string> = {
  unreachable:
    "Couldn't reach the sharing server. Check the sharing host in Settings.",
  refused: "The sharing server refused the session.",
  absent:
    "No session with that code is open. Check the code, or ask whoever started it to keep their tab open.",
  closed: "The sharing server accepted the session but closed the connection.",
};

export interface UseRealmOptions<K extends string> {
  // This tab's identity, stamped on everything we publish and used to drop our
  // own echo on everything we receive.
  clientId: string;
  // The kinds this realm subscribes to, and the topic each one travels on.
  // Taken as a table rather than a list so the protocol keeps owning its own
  // topic names — `TOPIC_FOR` in each layer.
  topics: Record<K, string>;
  // Called for each message that survives `accept`. Held in a ref internally,
  // so it always sees current state rather than what was captured at connect.
  onMessage: (message: Envelope & { kind: K }) => void;
  // Called when a connection that *had* opened goes away, for whatever reason.
  onClosed?: () => void;
}

export function useRealm<K extends string>({
  clientId,
  topics,
  onMessage,
  onClosed,
}: UseRealmOptions<K>) {
  const {
    settings: { liveEditHost },
  } = useSettings();
  const connectionRef = useRef<Connection | undefined>();
  const sessionRef = useRef<any>();
  const [status, setStatus] = useState<RealmStatus>("offline");
  const [error, setError] = useState<string | undefined>();
  const [realm, setRealm] = useState<string | undefined>();

  // Through refs: the subscriptions are registered once, at connect, and would
  // otherwise call the closures that existed at that moment for the rest of the
  // session. Same knot both layers already tie, tied once.
  const handlers = useRef({ onMessage, onClosed });
  handlers.current = { onMessage, onClosed };
  const kindsRef = useRef<K[]>([]);
  kindsRef.current = Object.keys(topics) as K[];
  const topicsRef = useRef(topics);
  topicsRef.current = topics;

  const publish = useCallback(
    (message: { kind: K; clientId: string; toClientId?: string }) => {
      const session = sessionRef.current;
      if (!session) return;
      try {
        session.publish(topicsRef.current[message.kind], [stamp(message)]);
      } catch {
        // A publish into a realm that has just closed isn't worth surfacing —
        // `onclose` is about to move the UI to offline anyway.
      }
    },
    [],
  );

  // The character layer's `FULL_SYNC`: an owned document has one host who can
  // be *asked*, which is a genuinely different question from the party
  // session's "does anyone here know the state". Exposed rather than wrapped
  // because only one layer has a registrant.
  const register = useCallback((procedure: string, handler: () => unknown) => {
    return sessionRef.current?.register(procedure, handler);
  }, []);

  const call = useCallback((procedure: string, args: unknown[] = []) => {
    if (!sessionRef.current) return Promise.resolve(undefined);
    return sessionRef.current.call(procedure, args);
  }, []);

  const fail = useCallback((reason: RealmFailure): RealmFailed => {
    setStatus("error");
    setError(MESSAGES[reason]);
    return { ok: false, reason, message: MESSAGES[reason] };
  }, []);

  // Refuse before trying — a code that isn't a code. Reported through the same
  // status and error as a real failure, so a caller has one place to look.
  const refuse = useCallback((message: string): RealmFailed => {
    setStatus("error");
    setError(message);
    return { ok: false, reason: "absent", message };
  }, []);

  // **Resolves when the realm is actually joined**, not when the attempt was
  // started. The old versions returned as soon as `connection.open()` had been
  // *called*, so every caller had to re-derive "am I connected yet" by watching
  // a status field from an effect — and anything done straight after the await
  // was running against a socket that wasn't there yet.
  const connect = useCallback(
    async (name: string, opts?: { create?: boolean }): Promise<RealmResult> => {
      setStatus("connecting");
      setError(undefined);

      if (opts?.create) {
        try {
          const res = await fetch(`${liveEditHost}/openRealm/${name}`);
          if (res.status !== 200) return fail("refused");
        } catch {
          return fail("unreachable");
        }
      }

      const connection = new autobahn.Connection({
        url: liveEditHost,
        realm: name,
      });
      // A connection that closes *before* it ever opened means the realm isn't
      // there — nobody is hosting this code yet.
      let opened = false;

      return new Promise<RealmResult>((resolve) => {
        connection.onopen = async (session: any) => {
          opened = true;
          sessionRef.current = session;
          connectionRef.current = connection;
          // **Await the subscriptions before resolving.** `subscribe` is a
          // round trip to the broker, and anything the caller publishes the
          // moment this resolves — a sync request, say — would otherwise get an
          // answer this client isn't listening for yet, which looks exactly
          // like joining an empty room. It's a race, so it fails
          // intermittently and only when a peer is actually there.
          await Promise.all(
            kindsRef.current.map((kind) =>
              session.subscribe(topicsRef.current[kind], (args: any[]) => {
                const result = accept(args?.[0], {
                  clientId,
                  kinds: kindsRef.current,
                });
                if (!result.ok) return;
                handlers.current.onMessage(result.message);
              }),
            ),
          );
          setRealm(name);
          setStatus("connected");
          resolve({ ok: true });
        };

        connection.onclose = () => {
          sessionRef.current = undefined;
          connectionRef.current = undefined;
          setRealm(undefined);
          if (opened) {
            setStatus("offline");
            handlers.current.onClosed?.();
          } else {
            resolve(fail(opts?.create ? "closed" : "absent"));
          }
          // Suppress autobahn's own reconnect: a realm that has genuinely gone
          // must stay gone, or its retry races whatever the app does next.
          return true;
        };

        connection.open();
      });
    },
    [liveEditHost, clientId, fail],
  );

  const close = useCallback(() => {
    connectionRef.current?.close();
    sessionRef.current = undefined;
    connectionRef.current = undefined;
    setRealm(undefined);
    setStatus("offline");
    setError(undefined);
  }, []);

  return {
    status,
    error,
    realm,
    connect,
    close,
    refuse,
    publish,
    register,
    call,
    connected: () => !!sessionRef.current,
  };
}
