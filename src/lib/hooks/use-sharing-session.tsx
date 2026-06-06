import React, { useCallback, useContext, useRef, useState } from "react";
import { UUID } from "crypto";
// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { Action, resetCharacter } from "../hooks/reducers/actions";
import { Character } from "../types";
import { useSettings } from "./use-settings";

const BASE_APPNAME = "net.dndcharactersheets";

export const SessionEvent = {
  DISPATCH: BASE_APPNAME + ".dispatch",
  FULL_SYNC: BASE_APPNAME + ".fullsync",
  CLOSE_SESSION: BASE_APPNAME + ".closesession",
};

// autobahn is untyped, so a Connection is effectively `any`.
type Connection = any;

interface SharingSessionsContextData {
  getConnection: (uuid: UUID) => Connection | undefined;
  saveConnection: (uuid: UUID, connection: Connection) => void;
  forgetConnection: (uuid: UUID) => void;
  endSession: (uuid: UUID) => Promise<boolean>;
}

export const SharingSessionsContext =
  React.createContext<SharingSessionsContextData>({
    getConnection: () => undefined,
    saveConnection: () => {},
    forgetConnection: () => {},
    endSession: async () => false,
  });

export function SharingSessionsContextProvider(props: React.PropsWithChildren) {
  const [openConnections, setOpenConnections] = useState<
    Record<UUID, Connection>
  >({});
  const {
    settings: { liveEditHost },
  } = useSettings();

  const providerData: SharingSessionsContextData = {
    getConnection: (uuid) => openConnections[uuid],
    saveConnection: (uuid, connection) => {
      setOpenConnections((current) => ({ ...current, [uuid]: connection }));
    },
    forgetConnection: (uuid) => {
      setOpenConnections((current) => {
        const next = { ...current };
        delete next[uuid];
        return next;
      });
    },
    // Asks the live-edit server to tear down the realm. Returns `true` if the
    // request failed (callers treat that as "the session is still open").
    endSession: async (uuid) => {
      const realmName = generateRealm(uuid);
      const res = await fetch(`${liveEditHost}/closeRealm/${realmName}`);
      if (res.status !== 204) {
        // TODO: better error handling
        alert("Failed to close sharing session, please try again later");
        return true;
      }
      return false;
    },
  };

  return (
    <SharingSessionsContext.Provider value={providerData}>
      {props.children}
    </SharingSessionsContext.Provider>
  );
}

export function useSharingSessions() {
  return useContext(SharingSessionsContext);
}

// TODO: move this somewhere better
type Dispatch = (
  action: Action,
  dirtyAction?: boolean,
  suppressBroadcast?: boolean,
) => void;

/**
 * Host side: opens a realm for the current character and broadcasts local
 * edits to anyone who has joined.
 */
export function useHostSharingSession(
  dispatch: Dispatch,
  getCharacter: () => Character | undefined,
) {
  const { getConnection, saveConnection, forgetConnection, endSession } =
    useSharingSessions();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const uuid = getCharacter()?.uuid;

  // The live connection is kept in a ref so it can be read synchronously right
  // after it is created (React state would lag a render behind).
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
      alert(
        "Failed to start sharing session. No character was found to share!",
      );
      return;
    }
    const realmName = generateRealm(characterUuid);
    const res = await fetch(`${liveEditHost}/openRealm/${realmName}`);
    if (res.status !== 200) {
      // TODO: better error handling
      alert("Failed to start sharing session, please try again later");
      return;
    }

    const connection = new autobahn.Connection({
      url: liveEditHost,
      realm: realmName,
    });

    await new Promise<void>((resolve, reject) => {
      connection.onopen = (session: any) => {
        // Apply edits coming back from joiners (without re-broadcasting them).
        session.subscribe(
          SessionEvent.DISPATCH,
          (args: [action: Action, dirtyAction?: boolean]) => {
            dispatch(args[0], args[1], true);
          },
        );
        // Serve the current character to anyone who joins.
        session.register(SessionEvent.FULL_SYNC, () =>
          getCharacterRef.current(),
        );
        connectionRef.current = connection;
        saveConnection(characterUuid, connection);
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
    const connection = connectionRef.current;
    // Best-effort: tell joiners we're closing before the realm disappears.
    connection?.session?.publish(SessionEvent.CLOSE_SESSION, []);
    const failed = uuid ? await endSession(uuid) : false;
    connection?.close?.();
    connectionRef.current = undefined;
    if (uuid) forgetConnection(uuid);
    return failed;
  }, [endSession, forgetConnection, uuid]);

  return {
    startSession,
    endSession: endCurrentSession,
    broadcast: (action: Action, dirtyAction?: boolean) =>
      broadcast(connectionRef.current, action, dirtyAction),
  };
}

/**
 * Joiner side: connects to a friend's realm, pulls the current character, and
 * keeps it in sync until either side disconnects.
 */
export function useRemoteSharingSession(dispatch: Dispatch) {
  const { getConnection, saveConnection, forgetConnection } =
    useSharingSessions();
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
      const connection = new autobahn.Connection({
        url: liveEditHost,
        realm: generateRealm(uuid),
      });

      return new Promise<Connection>((resolve, reject) => {
        connection.onopen = (session: any) => {
          // Apply edits streamed from the host (without re-broadcasting them).
          session.subscribe(
            SessionEvent.DISPATCH,
            (args: [action: Action, dirtyAction?: boolean]) => {
              dispatch(args[0], args[1], true);
            },
          );
          // When the host announces a close, drop our connection; the actual
          // cleanup happens in onclose below.
          session.subscribe(SessionEvent.CLOSE_SESSION, () => {
            connectionRef.current?.close();
          });
          connectionRef.current = connection;
          joinedUuidRef.current = uuid;
          saveConnection(uuid, connection);
          resolve(connection);
        };
        connection.onclose = () => {
          const wasIntentional = intentionalDisconnectRef.current;
          intentionalDisconnectRef.current = false;
          cleanUpAfterClose(uuid, !wasIntentional);
          // Reject any still-pending open; harmless once resolved.
          reject(new Error("Sharing session connection closed"));
          return true; // suppress autobahn auto-reconnect
        };
        connection.open();
      });
    },
    [cleanUpAfterClose, dispatch, getConnection, liveEditHost, saveConnection],
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
    broadcast: (action: Action, dirtyAction?: boolean) =>
      broadcast(connectionRef.current, action, dirtyAction),
    disconnect,
  };
}

function broadcast(
  connection: Connection | undefined,
  action: Action,
  dirtyAction?: boolean,
) {
  // No-op when there is no open session (e.g. editing while not sharing).
  if (!connection?.session) return;
  connection.session.publish(SessionEvent.DISPATCH, [action, dirtyAction]);
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
