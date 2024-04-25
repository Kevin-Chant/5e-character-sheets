import { UUID } from "crypto";
// @ts-ignore
import autobahn from "autobahn-browser";
import { Action } from "./hooks/reducers/actions";

const SessionEvents = {
  DISPATCH: "com.charsheets.dispatch",
  FULL_SYNC: "com.charsheets.fullsync",
};

const openConnections: Record<UUID, autobahn.Connection> = {};

export function startSharingSession(
  uuid: UUID,
  dispatch: (
    action: Action,
    dirtyAction?: boolean,
    suppressBroadcast?: boolean
  ) => void
) {
  const newConnection = new autobahn.Connection({
    url: "http://localhost:9000",
    realm: uuid.replaceAll("-", ""),
  });
  newConnection.onopen = (session: any) => {
    // TODO: app name
    session.subscribe(
      SessionEvents.DISPATCH,
      (args: [a: Action, da?: boolean]) => {
        dispatch(args[0], args[1], true);
      }
    );
    // TODO: move this somewhere with access to the character reference
    session.register(SessionEvents.FULL_SYNC, () => {});
  };
  newConnection.open();
  openConnections[uuid] = newConnection;
}

export function joinSharingSession(
  uuid: UUID,
  dispatch: (
    action: Action,
    dirtyAction?: boolean,
    suppressBroadcast?: boolean
  ) => void
) {
  const newConnection = new autobahn.Connection({
    url: "http://localhost:9000",
    realm: uuid.replaceAll("-", ""),
  });
  newConnection.onopen = (session: any) => {
    // TODO: app name
    session.subscribe(
      SessionEvents.DISPATCH,
      (args: [a: Action, da?: boolean]) => {
        dispatch(args[0], args[1], true);
      }
    );
  };
  newConnection.open();
  openConnections[uuid] = newConnection;
}

export function leaveSharingSession(uuid: UUID) {
  if (openConnections[uuid]) openConnections[uuid].close();
}

export function broadcast(uuid: UUID, action: Action, dirtyAction?: boolean) {
  if (openConnections[uuid]) {
    openConnections[uuid].session.publish(SessionEvents.DISPATCH, [
      action,
      dirtyAction,
    ]);
  }
}

// @ts-ignore
window.openConnections = openConnections;
