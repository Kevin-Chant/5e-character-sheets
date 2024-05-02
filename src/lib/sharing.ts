import { UUID } from "crypto";
// @ts-ignore
import autobahn from "autobahn-browser";
import { Action } from "./hooks/reducers/actions";
import { Character } from "./types";

// TODO: app name
export enum SessionEvent {
  DISPATCH = "com.charsheets.dispatch",
  FULL_SYNC = "com.charsheets.fullsync",
  CLOSE_SESSION = "com.charsheets.closesession",
}

const openConnections: Record<UUID, autobahn.Connection> = {};

export function startSharingSession(
  uuid: UUID,
  dispatch: (
    action: Action,
    dirtyAction?: boolean,
    suppressBroadcast?: boolean
  ) => void,
  getCharacter: () => Character
) {
  // TODO: make standard fetch request to open realm with given UUID
  const newConnection = new autobahn.Connection({
    url: "http://localhost:9000",
    realm: uuid.replaceAll("-", ""),
  });
  newConnection.onopen = (session: any) => {
    // TODO: app name
    session.subscribe(
      SessionEvent.DISPATCH,
      (args: [a: Action, da?: boolean]) => {
        dispatch(args[0], args[1], true);
      }
    );
    // TODO: move this somewhere with access to the character reference
    session.register(SessionEvent.FULL_SYNC, getCharacter);
  };
  newConnection.open();
  openConnections[uuid] = newConnection;
}

export async function joinSharingSession(
  uuid: UUID,
  dispatch: (
    action: Action,
    dirtyAction?: boolean,
    suppressBroadcast?: boolean
  ) => void
): Promise<Character | undefined> {
  if (openConnections[uuid]) {
    return syncRemoteCharacter(uuid);
  }
  const newConnection = new autobahn.Connection({
    url: "http://localhost:9000",
    realm: uuid.replaceAll("-", ""),
  });
  return new Promise((resolve) => {
    newConnection.onopen = (session: any) => {
      console.log("Started opening new connection");
      session.subscribe(
        SessionEvent.DISPATCH,
        (args: [a: Action, da?: boolean]) => {
          dispatch(args[0], args[1], true);
        }
      );
      session.subscribe(SessionEvent.CLOSE_SESSION, () => {
        leaveSharingSession(uuid);
        // TODO: statefully remove character from list on sidebar
      });
      openConnections[uuid] = newConnection;
      resolve(syncRemoteCharacter(uuid));
      console.log("Finished opening new connection");
    };
    newConnection.open();
  });
}

export function leaveSharingSession(uuid: UUID) {
  if (openConnections[uuid]) {
    openConnections[uuid].close();
    delete openConnections[uuid];
  }
}

export function broadcast(uuid: UUID, action: Action, dirtyAction?: boolean) {
  if (openConnections[uuid]) {
    openConnections[uuid].session.publish(SessionEvent.DISPATCH, [
      action,
      dirtyAction,
    ]);
  }
}

export function callRemoteFn(
  uuid: UUID,
  event: SessionEvent,
  args: any[]
): Promise<any> {
  if (openConnections[uuid]) {
    console.log("Calling into connection's session");
    return openConnections[uuid].session.call(event, args);
  }
  return new Promise((resolve) => {
    resolve(undefined);
  });
}

export function syncRemoteCharacter(
  uuid: UUID
): Promise<Character | undefined> {
  console.log("Trying to load remote character");
  return callRemoteFn(uuid, SessionEvent.FULL_SYNC, []);
}

// @ts-ignore
window.openConnections = openConnections;
