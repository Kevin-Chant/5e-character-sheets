import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UUID } from "crypto";
// @ts-ignore
import autobahn from "autobahn-browser";
import { Action } from "../hooks/reducers/actions";
import { Character } from "../types";
import { useSettings } from "./use-settings";

const BASE_APPNAME = "net.dndcharactersheets";

export const SessionEvent = {
  DISPATCH: BASE_APPNAME + ".dispatch",
  FULL_SYNC: BASE_APPNAME + ".fullsync",
  CLOSE_SESSION: BASE_APPNAME + ".closesession",
};

interface SharingSessionsContextData {
  getConnection: (uuid: UUID) => autobahn.Connectio | undefined;
  saveConnection: (uuid: UUID, connection: autobahn.Connection) => void;
  disconnect: (uuid: UUID) => void;
  endSession: (uuid: UUID) => Promise<boolean>;
}

export const SharingSessionsContext =
  React.createContext<SharingSessionsContextData>({
    getConnection: (_uuid) => console.log("Calling default getConnection"),
    saveConnection: (_uuid, _connection) =>
      console.log("Calling default saveConnection"),
    disconnect: (_uuid) => console.log("Calling default disconnect"),
    endSession: async (_uuid) => {
      console.log("Calling default endSession");
      return false;
    },
  });

export function SharingSessionsContextProvider(props: React.PropsWithChildren) {
  const [openConnections, setOpenConnections] = useState<
    Record<UUID, autobahn.Connection>
  >({});
  const {
    settings: { liveEditHost },
  } = useSettings();

  const providerData = {
    getConnection: (uuid: UUID) => openConnections[uuid],
    saveConnection: (uuid: UUID, connection: autobahn.Connection) => {
      setOpenConnections((currentOpenConnections) => ({
        ...currentOpenConnections,
        [uuid]: connection,
      }));
    },
    disconnect: (uuid: UUID) => {
      console.log("Calling context provider's disconnect");
      openConnections[uuid].close();
      setOpenConnections((currentOpenConnections) => ({
        ...currentOpenConnections,
        [uuid]: undefined,
      }));
    },
    endSession: async (uuid: UUID) => {
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
  suppressBroadcast?: boolean
) => void;

export function useHostSharingSession(
  dispatch: Dispatch,
  getCharacter: () => Character | undefined
) {
  const { getConnection, saveConnection, endSession } = useSharingSessions();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const uuid = getCharacter()?.uuid;
  const [connection, setConnection] = useState<autobahn.Connection | undefined>(
    uuid ? getConnection(uuid) : undefined
  );
  const endCurrentSessionIfExists = useCallback<() => Promise<boolean>>(() => {
    if (uuid) {
      return endSession(uuid);
    }
    return new Promise((resolve) => resolve(false));
  }, [endSession, uuid]);

  const startSession = async () => {
    console.log("Starting sharing session");
    const uuid = getCharacter()?.uuid;
    if (!uuid) {
      alert(
        "Failed to start sharing session. No character was found to share!"
      );
      return;
    }
    const realmName = generateRealm(uuid);
    console.log("Trying to generate live session at", liveEditHost, realmName);
    const res = await fetch(`${liveEditHost}/openRealm/${realmName}`);
    console.log("Res status is", res.status);
    if (res.status !== 200) {
      // TODO: better error handling
      alert("Failed to start sharing session, please try again later");
      return undefined;
    }
    const innerConnection = new autobahn.Connection({
      url: liveEditHost,
      realm: realmName,
    });
    setConnection(innerConnection);
    innerConnection.onopen = (session: any) => {
      session.subscribe(
        SessionEvent.DISPATCH,
        (args: [a: Action, da?: boolean]) => {
          dispatch(args[0], args[1], true);
        }
      );
      // TODO: move this somewhere with access to the character reference
      session.register(SessionEvent.FULL_SYNC, getCharacter);
    };
    await innerConnection.open();
    saveConnection(uuid, innerConnection);
  };

  return {
    startSession,
    endSession: endCurrentSessionIfExists,
    broadcast: (action: Action, dirtyAction?: boolean) =>
      broadcast(connection, action, dirtyAction),
  };
}

export function useRemoteSharingSession(dispatch: Dispatch) {
  const {
    getConnection,
    saveConnection,
    disconnect: disconnectUuid,
  } = useSharingSessions();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const [connection, setConnection] = useState<autobahn.Connection | undefined>(
    undefined
  );
  const [disconnect, setDisconnect] = useState<() => void>(() => {});

  const joinSession = async (uuid: UUID) => {
    const innerDisconnect = () => {
      console.log("Calling curried disconnect");
      disconnectUuid(uuid);
    };
    if (connection) {
      return new Promise((res) => res(connection));
    }
    const openConnection = getConnection(uuid);
    if (openConnection) {
      setConnection(openConnection);
      return new Promise((res) => res(openConnection));
    }
    const innerConnection = new autobahn.Connection({
      url: liveEditHost,
      realm: generateRealm(uuid),
    });
    setConnection(innerConnection);
    innerConnection.onopen = (session: autobahn.Connection.session) => {
      console.log("Started opening new connection");
      session.subscribe(
        SessionEvent.DISPATCH,
        (args: [a: Action, da?: boolean]) => {
          dispatch(args[0], args[1], true);
        }
      );
      session.subscribe(SessionEvent.CLOSE_SESSION, () => {
        console.log("Session called CLOSE_SESSION event. Disconnecting");
        innerDisconnect();
        // TODO: statefully remove character from list on sidebar
      });
      saveConnection(uuid, connection);
      console.log("Finished opening new connection");
    };
    await innerConnection.open();
  };

  return {
    getCharacter: () => connection && syncRemoteCharacter(connection),
    joinSession,
    broadcast: (action: Action, dirtyAction?: boolean) =>
      broadcast(connection, action, dirtyAction),
    disconnect,
  };
}

function broadcast(
  connection: autobahn.Connection,
  action: Action,
  dirtyAction?: boolean
) {
  connection.session.publish(SessionEvent.DISPATCH, [action, dirtyAction]);
}

function callRemoteFn(
  connection: autobahn.Connection,
  event: string,
  args: any[]
): Promise<any> {
  return connection.session.call(event, args);
}

function syncRemoteCharacter(
  connection: autobahn.Connection
): Promise<Character> {
  console.log("Trying to load remote character");
  return callRemoteFn(connection, SessionEvent.FULL_SYNC, []);
}

function generateRealm(uuid: UUID) {
  return uuid.replaceAll("-", "");
}
