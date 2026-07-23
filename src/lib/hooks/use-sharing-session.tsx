import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { UUID } from "crypto";
// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { Action, resetCharacter } from "../hooks/reducers/actions";
import { Character, Dispatch, DispatchPayload } from "../types";
import { randomUUID } from "../browser";
import { useSettings } from "./use-settings";

const BASE_APPNAME = "net.dndcharactersheets";

export const SessionEvent = {
  DISPATCH: BASE_APPNAME + ".dispatch",
  FULL_SYNC: BASE_APPNAME + ".fullsync",
  CLOSE_SESSION: BASE_APPNAME + ".closesession",
  PRESENCE: BASE_APPNAME + ".presence",
  LEAVE: BASE_APPNAME + ".leave",
};

// autobahn is untyped, so a Connection is effectively `any`.
type Connection = any;

// Whether this client opened the realm (host, owns persistence) or joined a
// friend's realm (remote, the host owns persistence).
type SessionRole = "host" | "remote";

interface OpenSession {
  connection: Connection;
  role: SessionRole;
}

// A participant's self-chosen name/color and the dot-path of the field they
// currently have open (null when they aren't editing anything).
export interface Identity {
  name: string;
  color: string;
}
export interface Participant extends Identity {
  clientId: string;
  field: string | null;
}

// A presence broadcast. `hello` is sent on join and prompts everyone already in
// the realm to reply with an `update` so the newcomer learns the full roster.
type PresenceMessage = Participant & { kind: "hello" | "update" };

// Idle tabs emit a keep-alive this often; a peer we haven't heard from within
// the timeout is treated as gone and dropped from the roster. The timeout is 3x
// the interval so a single dropped beat doesn't flap an active editor away.
const HEARTBEAT_MS = 10_000;
const PRESENCE_TIMEOUT_MS = 30_000;

const IDENTITY_STORAGE_KEY = "live-edit-identity";
const PRESENCE_PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Identity;
  } catch {
    // Corrupt/blocked storage — fall through to a fresh identity.
  }
  return {
    name: `Unnamed Editor ${Math.floor(Math.random() * 99) + 1}`,
    color:
      PRESENCE_PALETTE[Math.floor(Math.random() * PRESENCE_PALETTE.length)],
  };
}

interface SharingSessionsContextData {
  clientId: string;
  getConnection: (uuid: UUID) => Connection | undefined;
  getRole: (uuid: UUID) => SessionRole | undefined;
  saveConnection: (
    uuid: UUID,
    connection: Connection,
    role: SessionRole,
  ) => void;
  forgetConnection: (uuid: UUID) => void;
  broadcast: (uuid: UUID, action: Action, dirtyAction?: boolean) => void;
  // The persisted default presence identity (name + highlight color), and the
  // resolved identity for a given session (override, else default).
  defaultIdentity: Identity;
  setDefaultIdentity: (identity: Identity) => void;
  resetDefaultIdentity: () => void;
  getIdentity: (uuid: UUID) => Identity;
  setSessionIdentity: (uuid: UUID, identity: Identity) => void;
  // Other participants in a character's live session, and the peer (if any)
  // currently editing a given field path.
  getParticipants: (uuid: UUID) => Participant[];
  getFieldEditor: (uuid: UUID, field: string) => Participant | undefined;
  // Publish which field this tab now has open (null when it closes the editor).
  broadcastSelection: (uuid: UUID, field: string | null) => void;
  // Wire presence onto a freshly opened session and announce ourselves.
  joinPresence: (session: any, uuid: UUID) => void;
  // Announce we're leaving a session and drop its roster locally.
  leavePresence: (uuid: UUID) => void;
  // Tears down the live session for a character: closes the realm server-side
  // (host only), closes the connection, and forgets it. Safe to call when no
  // session is open. Returns `true` if the server close failed.
  teardownSession: (uuid: UUID) => Promise<boolean>;
}

export const SharingSessionsContext =
  React.createContext<SharingSessionsContextData>({
    clientId: "",
    getConnection: () => undefined,
    getRole: () => undefined,
    saveConnection: () => {},
    forgetConnection: () => {},
    broadcast: () => {},
    defaultIdentity: { name: "", color: "" },
    setDefaultIdentity: () => {},
    resetDefaultIdentity: () => {},
    getIdentity: () => ({ name: "", color: "" }),
    setSessionIdentity: () => {},
    getParticipants: () => [],
    getFieldEditor: () => undefined,
    broadcastSelection: () => {},
    joinPresence: () => {},
    leavePresence: () => {},
    teardownSession: async () => false,
  });

export function SharingSessionsContextProvider(props: React.PropsWithChildren) {
  const [openSessions, setOpenSessions] = useState<Record<UUID, OpenSession>>(
    {},
  );
  // Mirror of openSessions readable synchronously from presence handlers, whose
  // closures would otherwise see a stale snapshot.
  const openSessionsRef = useRef(openSessions);
  openSessionsRef.current = openSessions;
  // Roster of other participants, keyed by character uuid then clientId.
  const [presence, setPresence] = useState<
    Record<UUID, Record<string, Participant>>
  >({});
  // The persisted default identity, plus optional per-session overrides keyed by
  // character uuid — so a user can present differently (or under different
  // names) in each session they host or join. Overrides are ephemeral: a session
  // with none falls back to the default.
  const [defaultIdentity, setDefaultIdentityState] =
    useState<Identity>(loadIdentity);
  const defaultIdentityRef = useRef(defaultIdentity);
  defaultIdentityRef.current = defaultIdentity;
  const [sessionIdentities, setSessionIdentities] = useState<
    Record<UUID, Identity>
  >({});
  const sessionIdentitiesRef = useRef(sessionIdentities);
  sessionIdentitiesRef.current = sessionIdentities;

  // The identity this tab presents in a given session (override, else default).
  // Reads refs so presence handlers registered in subscribe() closures stay
  // current.
  const getIdentity = useCallback(
    (uuid: UUID): Identity =>
      sessionIdentitiesRef.current[uuid] ?? defaultIdentityRef.current,
    [],
  );
  // Our own current field selection per session, so a reply to a newcomer's
  // "hello" reflects what we're actually editing.
  const mySelectionRef = useRef<Record<UUID, string | null>>({});
  // Last time we heard from each peer, used to prune ones that vanished without
  // a clean leave (e.g. a closed tab).
  const lastSeenRef = useRef<Record<UUID, Record<string, number>>>({});
  // Stable id identifying this browser tab, used to drop our own echoed edits.
  const clientIdRef = useRef<string>(randomUUID());
  const {
    settings: { liveEditHost },
  } = useSettings();

  const forgetConnection = useCallback((uuid: UUID) => {
    setOpenSessions((current) => {
      const next = { ...current };
      delete next[uuid];
      return next;
    });
    setPresence((current) => {
      if (!current[uuid]) return current;
      const next = { ...current };
      delete next[uuid];
      return next;
    });
    delete lastSeenRef.current[uuid];
  }, []);

  const setDefaultIdentity = useCallback((next: Identity) => {
    setDefaultIdentityState(next);
    try {
      localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Persisting identity is best-effort; an unwritable store isn't fatal.
    }
  }, []);

  // Restore the default identity to a fresh generated one (used by Settings'
  // "reset to defaults"). Per-session overrides are left untouched.
  const resetDefaultIdentity = useCallback(() => {
    try {
      localStorage.removeItem(IDENTITY_STORAGE_KEY);
    } catch {
      // Best-effort; if storage is unwritable we still reset in-memory below.
    }
    setDefaultIdentityState(loadIdentity());
  }, []);

  const setSessionIdentity = useCallback((uuid: UUID, next: Identity) => {
    setSessionIdentities((prev) => ({ ...prev, [uuid]: next }));
  }, []);

  const applyPresence = useCallback((uuid: UUID, msg: PresenceMessage) => {
    (lastSeenRef.current[uuid] ||= {})[msg.clientId] = Date.now();
    setPresence((prev) => ({
      ...prev,
      [uuid]: {
        ...(prev[uuid] || {}),
        [msg.clientId]: {
          clientId: msg.clientId,
          name: msg.name,
          color: msg.color,
          field: msg.field,
        },
      },
    }));
  }, []);

  const removePresence = useCallback((uuid: UUID, clientId: string) => {
    if (lastSeenRef.current[uuid]) delete lastSeenRef.current[uuid][clientId];
    setPresence((prev) => {
      if (!prev[uuid]?.[clientId]) return prev;
      const nextForUuid = { ...prev[uuid] };
      delete nextForUuid[clientId];
      return { ...prev, [uuid]: nextForUuid };
    });
  }, []);

  const publishPresence = (session: any, msg: PresenceMessage) => {
    session?.publish(SessionEvent.PRESENCE, [msg]);
  };

  const myPresence = useCallback(
    (uuid: UUID, kind: "hello" | "update"): PresenceMessage => {
      const { name, color } = getIdentity(uuid);
      return {
        kind,
        clientId: clientIdRef.current,
        name,
        color,
        field: mySelectionRef.current[uuid] ?? null,
      };
    },
    [getIdentity],
  );

  const joinPresence = useCallback(
    (session: any, uuid: UUID) => {
      session.subscribe(SessionEvent.PRESENCE, ([msg]: [PresenceMessage]) => {
        if (msg.clientId === clientIdRef.current) return;
        applyPresence(uuid, msg);
        // Reply over the same connection so the newcomer learns about us.
        if (msg.kind === "hello") {
          publishPresence(session, myPresence(uuid, "update"));
        }
      });
      session.subscribe(SessionEvent.LEAVE, ([clientId]: [string]) => {
        removePresence(uuid, clientId);
      });
      publishPresence(session, myPresence(uuid, "hello"));
    },
    [applyPresence, myPresence, removePresence],
  );

  const broadcastSelection = useCallback(
    (uuid: UUID, field: string | null) => {
      mySelectionRef.current[uuid] = field;
      const session = openSessionsRef.current[uuid]?.connection?.session;
      publishPresence(session, { ...myPresence(uuid, "update"), field });
    },
    [myPresence],
  );

  const leavePresence = useCallback((uuid: UUID) => {
    const session = openSessionsRef.current[uuid]?.connection?.session;
    session?.publish(SessionEvent.LEAVE, [clientIdRef.current]);
    delete mySelectionRef.current[uuid];
    delete lastSeenRef.current[uuid];
    setPresence((prev) => {
      if (!prev[uuid]) return prev;
      const next = { ...prev };
      delete next[uuid];
      return next;
    });
  }, []);

  // Renaming/recoloring mid-session (default or a per-session override): re-
  // announce to every open session so peers update our chip and highlight.
  useEffect(() => {
    (Object.keys(openSessionsRef.current) as UUID[]).forEach((uuid) =>
      broadcastSelection(uuid, mySelectionRef.current[uuid] ?? null),
    );
  }, [defaultIdentity, sessionIdentities, broadcastSelection]);

  // Single timer for the provider's lifetime: emit a keep-alive on each open
  // session and drop peers that have gone silent past the timeout. Any received
  // presence message already refreshes a peer's last-seen, so active editors
  // rarely need a dedicated beat.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      (Object.keys(openSessionsRef.current) as UUID[]).forEach((uuid) => {
        broadcastSelection(uuid, mySelectionRef.current[uuid] ?? null);
        Object.entries(lastSeenRef.current[uuid] || {}).forEach(
          ([clientId, seenAt]) => {
            if (now - seenAt > PRESENCE_TIMEOUT_MS)
              removePresence(uuid, clientId);
          },
        );
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [broadcastSelection, removePresence]);

  // Asks the live-edit server to tear down the realm. Returns `true` if the
  // request failed (callers treat that as "the session is still open").
  const closeRealm = useCallback(
    async (uuid: UUID): Promise<boolean> => {
      const realmName = generateRealm(uuid);
      const res = await fetch(`${liveEditHost}/closeRealm/${realmName}`);
      if (res.status !== 204) {
        window.alert("Failed to close sharing session, please try again later");
        return true;
      }
      return false;
    },
    [liveEditHost],
  );

  // Memoized on the state it exposes (sessions, roster, identity); the inline
  // closures below are rebuilt exactly when that state changes, so they always
  // see current values.
  const providerData: SharingSessionsContextData = React.useMemo(
    () => ({
      clientId: clientIdRef.current,
      getConnection: (uuid) => openSessions[uuid]?.connection,
      getRole: (uuid) => openSessions[uuid]?.role,
      saveConnection: (uuid, connection, role) => {
        setOpenSessions((current) => ({
          ...current,
          [uuid]: { connection, role },
        }));
      },
      forgetConnection,
      defaultIdentity,
      setDefaultIdentity,
      resetDefaultIdentity,
      getIdentity,
      setSessionIdentity,
      getParticipants: (uuid) =>
        Object.values(presence[uuid] || {}).filter(
          (p) => p.clientId !== clientIdRef.current,
        ),
      getFieldEditor: (uuid, field) =>
        Object.values(presence[uuid] || {}).find(
          (p) => p.clientId !== clientIdRef.current && p.field === field,
        ),
      broadcastSelection,
      joinPresence,
      leavePresence,
      // Publish a local edit to everyone else in the realm. No-op when there is
      // no open session for this character.
      broadcast: (uuid, action, dirtyAction) => {
        const connection = openSessions[uuid]?.connection;
        if (!connection?.session) return;
        const payload: DispatchPayload = {
          action,
          dirtyAction,
          senderId: clientIdRef.current,
        };
        connection.session.publish(SessionEvent.DISPATCH, payload);
      },
      teardownSession: async (uuid) => {
        const session = openSessions[uuid];
        if (!session) return false;
        const { connection, role } = session;
        let failed = false;
        if (role === "host") {
          // Best-effort: tell joiners we're closing before the realm disappears.
          connection?.session?.publish(SessionEvent.CLOSE_SESSION, []);
          failed = await closeRealm(uuid);
        } else {
          // Joiners politely announce departure so peers drop our chip/highlight.
          leavePresence(uuid);
        }
        connection?.close?.();
        forgetConnection(uuid);
        return failed;
      },
    }),
    [
      openSessions,
      presence,
      defaultIdentity,
      forgetConnection,
      setDefaultIdentity,
      resetDefaultIdentity,
      getIdentity,
      setSessionIdentity,
      broadcastSelection,
      joinPresence,
      leavePresence,
      closeRealm,
    ],
  );

  return (
    <SharingSessionsContext.Provider value={providerData}>
      {props.children}
    </SharingSessionsContext.Provider>
  );
}

export function useSharingSessions() {
  return useContext(SharingSessionsContext);
}

// Applies an incoming edit unless it is an echo of one we sent ourselves.
// Incoming edits are dispatched with suppressBroadcast so they are not
// re-published, which prevents echo loops.
/**
 * The handler for an incoming edit.
 *
 * Two invariants live here, both easy to get wrong and both load-bearing:
 * nightlife-rabbit doesn't honour WAMP's `exclude_me`, so a publisher receives
 * its own events and has to drop them by comparing `senderId` to this tab's
 * `clientId`; and an edit that *is* applied must be replayed with
 * `suppressBroadcast` (the third argument) or it would be re-published,
 * ping-ponging between peers.
 *
 * Exported for tests — the surrounding provider needs a live WAMP connection,
 * but this decision doesn't.
 */
export function makeDispatchHandler(dispatch: Dispatch, clientId: string) {
  return (payload: DispatchPayload) => {
    const { action, dirtyAction, senderId } = payload;
    if (senderId === clientId) return;
    dispatch(action, dirtyAction, true);
  };
}

/**
 * Host side: opens a realm for the current character and serves its initial
 * state. Edits flow over the shared connection (see `useSharingSessions`).
 */
export function useHostSharingSession(
  dispatch: Dispatch,
  getCharacter: () => Character | undefined,
) {
  const {
    clientId,
    getConnection,
    saveConnection,
    teardownSession,
    joinPresence,
  } = useSharingSessions();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const uuid = getCharacter()?.uuid;

  // The live connection is kept in a ref so the teardown flow can reach it
  // synchronously.
  const connectionRef = useRef<Connection | undefined>(
    uuid ? getConnection(uuid) : undefined,
  );

  // Keep the latest character getter reachable from the (once-registered)
  // full-sync handler so joiners always receive the current character.
  const getCharacterRef = useRef(getCharacter);
  getCharacterRef.current = getCharacter;

  const startSession = async () => {
    const characterUuid = getCharacter()?.uuid;
    if (!characterUuid) {
      window.alert(
        "Failed to start sharing session. No character was found to share!",
      );
      return;
    }
    const realmName = generateRealm(characterUuid);
    const res = await fetch(`${liveEditHost}/openRealm/${realmName}`);
    if (res.status !== 200) {
      window.alert("Failed to start sharing session, please try again later");
      return;
    }

    const connection = new autobahn.Connection({
      url: liveEditHost,
      realm: realmName,
    });

    await new Promise<void>((resolve, reject) => {
      connection.onopen = (session: any) => {
        // Apply edits coming from joiners.
        session.subscribe(
          SessionEvent.DISPATCH,
          makeDispatchHandler(dispatch, clientId),
        );
        // Serve the current character to anyone who joins.
        session.register(SessionEvent.FULL_SYNC, () =>
          getCharacterRef.current(),
        );
        connectionRef.current = connection;
        saveConnection(characterUuid, connection, "host");
        joinPresence(session, characterUuid);
        resolve();
      };
      connection.onclose = () => {
        reject(new Error("Failed to open sharing session"));
        return true;
      };
      connection.open();
    });
  };

  const endCurrentSession = useCallback(async (): Promise<boolean> => {
    const failed = uuid ? await teardownSession(uuid) : false;
    connectionRef.current = undefined;
    return failed;
  }, [teardownSession, uuid]);

  return {
    startSession,
    endSession: endCurrentSession,
  };
}

/**
 * Joiner side: connects to a friend's realm, pulls the current character, and
 * keeps it in sync until either side disconnects. Edits flow over the shared
 * connection (see `useSharingSessions`).
 */
export function useRemoteSharingSession(dispatch: Dispatch) {
  const {
    clientId,
    getConnection,
    saveConnection,
    forgetConnection,
    joinPresence,
  } = useSharingSessions();
  const {
    settings: { liveEditHost },
  } = useSettings();

  const connectionRef = useRef<Connection | undefined>(undefined);
  const joinedUuidRef = useRef<UUID | undefined>(undefined);
  // Distinguishes a user-initiated disconnect from the host ending the session.
  const intentionalDisconnectRef = useRef(false);

  const cleanUpAfterClose = useCallback(
    (uuid: UUID, hostClosed: boolean) => {
      connectionRef.current = undefined;
      joinedUuidRef.current = undefined;
      forgetConnection(uuid);
      if (hostClosed) {
        // Clear the now-dead character from view.
        dispatch(resetCharacter(), false, true);
        window.alert("The sharing session has ended.");
      }
    },
    [dispatch, forgetConnection],
  );

  const joinSession = useCallback(
    (uuid: UUID): Promise<Connection> => {
      const existing = connectionRef.current ?? getConnection(uuid);
      if (existing) {
        connectionRef.current = existing;
        joinedUuidRef.current = uuid;
        return Promise.resolve(existing);
      }

      intentionalDisconnectRef.current = false;
      // True once the realm has actually opened. A connection that closes
      // *before* opening (e.g. the host isn't online yet, so the realm doesn't
      // exist) is a quiet probe failure, not a host-ended-the-session event — so
      // auto-join retries don't wipe the open character or alert on every miss.
      let everOpened = false;
      const connection = new autobahn.Connection({
        url: liveEditHost,
        realm: generateRealm(uuid),
      });

      return new Promise<Connection>((resolve, reject) => {
        connection.onopen = (session: any) => {
          everOpened = true;
          // Apply edits streamed from the host (and other joiners).
          session.subscribe(
            SessionEvent.DISPATCH,
            makeDispatchHandler(dispatch, clientId),
          );
          // When the host announces a close, drop our connection; the actual
          // cleanup happens in onclose below.
          session.subscribe(SessionEvent.CLOSE_SESSION, () => {
            connectionRef.current?.close();
          });
          connectionRef.current = connection;
          joinedUuidRef.current = uuid;
          saveConnection(uuid, connection, "remote");
          joinPresence(session, uuid);
          resolve(connection);
        };
        connection.onclose = () => {
          const wasIntentional = intentionalDisconnectRef.current;
          intentionalDisconnectRef.current = false;
          // Only treat a close as "the host ended the session" (clearing the
          // character + alerting) if we had actually joined. A close before the
          // realm ever opened just means no host is there — fail quietly.
          if (everOpened) cleanUpAfterClose(uuid, !wasIntentional);
          // Reject any still-pending open; harmless once resolved.
          reject(new Error("Sharing session connection closed"));
          return true; // suppress autobahn auto-reconnect
        };
        connection.open();
      });
    },
    [
      cleanUpAfterClose,
      clientId,
      dispatch,
      getConnection,
      liveEditHost,
      saveConnection,
    ],
  );

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    connectionRef.current?.close();
  }, []);

  return {
    joinSession,
    getCharacter: (): Promise<Character | undefined> =>
      connectionRef.current
        ? syncRemoteCharacter(connectionRef.current)
        : Promise.resolve(undefined),
    disconnect,
  };
}

function callRemoteFn(
  connection: Connection,
  event: string,
  args: any[],
): Promise<any> {
  return connection.session.call(event, args);
}

function syncRemoteCharacter(connection: Connection): Promise<Character> {
  return callRemoteFn(connection, SessionEvent.FULL_SYNC, []);
}

function generateRealm(uuid: UUID) {
  return uuid.replaceAll("-", "");
}
