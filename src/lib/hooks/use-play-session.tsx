import { useCallback, useRef, useState } from "react";
// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { Encounter } from "src/lib/play/encounter";
import {
  isValidSessionCode,
  newSessionCode,
  normalizeSessionCode,
  PlaySessionEvent,
  realmForSession,
  SessionMessage,
} from "src/lib/play/session";
import { useSettings } from "src/lib/hooks/use-settings";

// The party session's transport. Everything it *decides* lives in
// `play/session.ts`; this file only moves bytes, which is the split the
// codebase already uses for the character-sharing layer (network paths are
// verified by hand, so the decisions inside them are tested elsewhere).
//
// Conventions inherited from `use-sharing-session.tsx`, all of them load-bearing:
// the connection is a **ref**, not state, so it can be read synchronously right
// after creation; every message carries a `clientId` because nightlife-rabbit
// does not honour WAMP `exclude_me` and publishers receive their own events; and
// teardown hangs off `connection.onclose`.

type Connection = any;

export type SessionStatus = "offline" | "connecting" | "connected" | "error";

interface PlaySessionOptions {
  clientId: string;
  // Applied when a peer sends state. The provider decides how to merge.
  onRemoteState: (encounter: Encounter, fromClientId: string) => void;
  // A peer announced itself: reply with what we have so it can catch up.
  onHello: (fromClientId: string) => void;
  // A peer left: drop what it owned.
  onLeave: (fromClientId: string) => void;
  // Someone wants to play an offered sheet: whoever owns it replies.
  onClaimSheet: (participantId: string, fromClientId: string) => void;
  // A whole sheet arrived. The provider checks it's addressed to us and loads
  // it — everyone else in the realm sees the message and ignores it.
  onSheet: (
    participantId: string,
    character: unknown,
    toClientId: string,
  ) => void;
}

export function usePlaySession({
  clientId,
  onRemoteState,
  onHello,
  onLeave,
  onClaimSheet,
  onSheet,
}: PlaySessionOptions) {
  const {
    settings: { liveEditHost },
  } = useSettings();
  const connectionRef = useRef<Connection | undefined>();
  const sessionRef = useRef<any>();
  const [code, setCode] = useState<string | undefined>();
  const [status, setStatus] = useState<SessionStatus>("offline");
  const [error, setError] = useState<string | undefined>();

  // Handlers are read through refs so the (once-registered) subscription always
  // calls the current closure rather than the one captured at connect time.
  const handlers = useRef({
    onRemoteState,
    onHello,
    onLeave,
    onClaimSheet,
    onSheet,
  });
  handlers.current = { onRemoteState, onHello, onLeave, onClaimSheet, onSheet };

  const publish = useCallback((message: SessionMessage) => {
    const session = sessionRef.current;
    if (!session) return;
    const topic =
      message.kind === "state"
        ? PlaySessionEvent.STATE
        : message.kind === "hello"
          ? PlaySessionEvent.HELLO
          : message.kind === "claimSheet"
            ? PlaySessionEvent.CLAIM_SHEET
            : message.kind === "sheet"
              ? PlaySessionEvent.SHEET
              : PlaySessionEvent.LEAVE;
    try {
      session.publish(topic, [message]);
    } catch {
      // A publish into a realm that has just closed is not worth surfacing —
      // `onclose` is about to move the UI to "offline" anyway.
    }
  }, []);

  const broadcastState = useCallback(
    (encounter: Encounter) => publish({ kind: "state", clientId, encounter }),
    [publish, clientId],
  );

  const requestSheet = useCallback(
    (participantId: string) =>
      publish({ kind: "claimSheet", clientId, participantId }),
    [publish, clientId],
  );

  const sendSheet = useCallback(
    (toClientId: string, participantId: string, character: unknown) =>
      publish({
        kind: "sheet",
        clientId,
        toClientId,
        participantId,
        character,
      }),
    [publish, clientId],
  );

  const connect = useCallback(
    async (sessionCode: string, create: boolean) => {
      const normalized = normalizeSessionCode(sessionCode);
      if (!isValidSessionCode(normalized)) {
        setStatus("error");
        setError("That doesn't look like a session code.");
        return;
      }
      setStatus("connecting");
      setError(undefined);
      const realm = realmForSession(normalized);

      if (create) {
        try {
          const res = await fetch(`${liveEditHost}/openRealm/${realm}`);
          if (res.status !== 200) {
            setStatus("error");
            setError(`The sharing server refused the session (${res.status}).`);
            return;
          }
        } catch {
          setStatus("error");
          setError(
            "Couldn't reach the sharing server. Check the sharing host in Settings.",
          );
          return;
        }
      }

      const connection = new autobahn.Connection({ url: liveEditHost, realm });
      // A connection that closes *before* it ever opened means the realm isn't
      // there — i.e. nobody is hosting this code yet, which is a typo far more
      // often than an outage.
      let opened = false;

      connection.onopen = async (session: any) => {
        opened = true;
        sessionRef.current = session;
        connectionRef.current = connection;
        // **Await the subscriptions before announcing.** `subscribe` is a round
        // trip to the broker, and a `hello` published before it completes gets a
        // reply this client isn't listening for yet — which looks exactly like
        // joining a session nobody is in. It's a race, so it fails
        // intermittently and only with a peer already present.
        await Promise.all([
          session.subscribe(PlaySessionEvent.STATE, (args: any[]) => {
            const message = args?.[0] as SessionMessage | undefined;
            if (message?.kind !== "state" || message.clientId === clientId)
              return;
            handlers.current.onRemoteState(message.encounter, message.clientId);
          }),
          session.subscribe(PlaySessionEvent.HELLO, (args: any[]) => {
            const message = args?.[0] as SessionMessage | undefined;
            if (message?.kind !== "hello" || message.clientId === clientId)
              return;
            handlers.current.onHello(message.clientId);
          }),
          session.subscribe(PlaySessionEvent.LEAVE, (args: any[]) => {
            const message = args?.[0] as SessionMessage | undefined;
            if (message?.kind !== "leave" || message.clientId === clientId)
              return;
            handlers.current.onLeave(message.clientId);
          }),
          session.subscribe(PlaySessionEvent.CLAIM_SHEET, (args: any[]) => {
            const message = args?.[0] as SessionMessage | undefined;
            if (message?.kind !== "claimSheet" || message.clientId === clientId)
              return;
            handlers.current.onClaimSheet(
              message.participantId,
              message.clientId,
            );
          }),
          session.subscribe(PlaySessionEvent.SHEET, (args: any[]) => {
            const message = args?.[0] as SessionMessage | undefined;
            if (message?.kind !== "sheet" || message.clientId === clientId)
              return;
            handlers.current.onSheet(
              message.participantId,
              message.character,
              message.toClientId,
            );
          }),
        ]);
        setCode(normalized);
        setStatus("connected");
        // Announce ourselves; whoever is already here replies with the state.
        publish({ kind: "hello", clientId });
      };

      connection.onclose = () => {
        sessionRef.current = undefined;
        connectionRef.current = undefined;
        setStatus(opened ? "offline" : "error");
        if (!opened) {
          setError(
            create
              ? "The sharing server accepted the session but closed the connection."
              : "No session with that code is open. Check the code, or ask whoever started it to keep their tab open.",
          );
        }
        setCode(undefined);
        return true;
      };

      connection.open();
    },
    [liveEditHost, clientId, publish],
  );

  const host = useCallback(async () => {
    await connect(newSessionCode(), true);
  }, [connect]);

  const join = useCallback(
    async (sessionCode: string) => {
      await connect(sessionCode, false);
    },
    [connect],
  );

  const leave = useCallback(() => {
    publish({ kind: "leave", clientId });
    // Deliberately not closing the realm: in a party session there is no owner,
    // and one player going to bed must not end everyone else's fight. Realms are
    // reclaimed by restarting the sidecar, same as the character-sharing ones.
    connectionRef.current?.close();
    sessionRef.current = undefined;
    connectionRef.current = undefined;
    setCode(undefined);
    setStatus("offline");
  }, [publish, clientId]);

  return {
    code,
    status,
    error,
    host,
    join,
    leave,
    broadcastState,
    requestSheet,
    sendSheet,
  };
}
