import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { UUID } from "crypto";
import {
  Action,
  loadPersistedCharacter,
  resetCharacter,
} from "../hooks/reducers/actions";
import { Character, Dispatch } from "../types";
import { randomUUID } from "../browser";
import { useSettings } from "./use-settings";
import { useRealm } from "src/lib/realm/use-realm";
import { usePresence } from "src/lib/realm/use-presence";
import { PresenceEntry } from "src/lib/realm/presence";
import { realmForCharacter } from "src/lib/session-codes";
import { publishTabEdit } from "src/lib/tab-sync";

// Character co-editing: one shared sheet, several browsers, over a realm named
// for the character's uuid.
//
// Sockets, subscriptions, self-echo, versioning and teardown live in
// `useRealm`, shared with the party-session layer — this file is the protocol
// and the roles. Two things are deliberately *not* shared with that layer:
//
// - **Sync is an RPC, not ask-the-room.** An owned document has one host who
//   can be asked (`FULL_SYNC`), which gives a definite failure when the host
//   is absent — the Drive auto-join retry loop depends on that — and no
//   revision race where there was a single source of truth all along.
// - **The roles are asymmetric.** The host owns persistence and serves the
//   sheet; a joiner plays a copy it must never save (a divergent fork), which
//   is the role check in `CharacterContext`'s lazy-save.
//
// **One sharing session at a time.** The old provider kept a uuid-keyed map of
// connections, but the support was illusory: incoming edits were dispatched
// into whatever character was *open*, and `FULL_SYNC` served the open
// character whatever realm asked — so a session only ever worked while its
// character stayed on screen. One-at-a-time is the same capability stated
// honestly, and it lets `broadcast` check the uuid instead of trusting the
// caller. The public API stays uuid-keyed; a uuid that isn't the active
// session's answers "no session".

const BASE_APPNAME = "net.dndcharactersheets";

export const SessionEvent = {
  DISPATCH: BASE_APPNAME + ".dispatch",
  FULL_SYNC: BASE_APPNAME + ".fullsync",
  CLOSE_SESSION: BASE_APPNAME + ".closesession",
  PRESENCE: BASE_APPNAME + ".presence",
  LEAVE: BASE_APPNAME + ".leave",
};

// Whether this client opened the realm (host, owns persistence) or joined a
// friend's realm (remote, the host owns persistence).
type SessionRole = "host" | "remote";

// A participant's self-chosen name/color, and the dot-path of the field they
// currently have open (null when they aren't editing anything).
export interface Identity {
  name: string;
  color: string;
}
export interface SharingPresence extends Identity {
  field: string | null;
}
export type Participant = PresenceEntry<SharingPresence>;

export type SharingMessage =
  // A single edit, replayed by every peer with `suppressBroadcast` so it isn't
  // re-published into a loop.
  | {
      kind: "dispatch";
      clientId: string;
      action: Action;
      dirtyAction?: boolean;
    }
  // The host is closing the realm; joiners drop the now-dead character.
  | { kind: "closeSession"; clientId: string }
  // Who this tab is and what it has open. Heartbeated — see `usePresence`.
  | ({ kind: "presence"; clientId: string } & SharingPresence)
  | { kind: "leave"; clientId: string };

export const TOPIC_FOR: Record<SharingMessage["kind"], string> = {
  dispatch: SessionEvent.DISPATCH,
  closeSession: SessionEvent.CLOSE_SESSION,
  presence: SessionEvent.PRESENCE,
  leave: SessionEvent.LEAVE,
};

const samePresence = (a: SharingPresence, b: SharingPresence) =>
  a.name === b.name && a.color === b.color && a.field === b.field;

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

// What the provider needs from the layers below it in the tree. The character
// (and its dispatch) live in `CharacterContext`, which mounts *under* this
// provider — so the hooks below hand these up through refs each render, the
// same knot the encounter provider ties with its transport.
interface SessionBindings {
  dispatch?: Dispatch;
  getCharacter?: () => Character | undefined;
}

interface SharingSessionsContextData {
  clientId: string;
  getRole: (uuid: UUID) => SessionRole | undefined;
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
  // Tears down the live session for a character: closes the realm server-side
  // (host only), closes the connection, and forgets it. Safe to call when no
  // session is open. Returns `true` if the server close failed.
  teardownSession: (uuid: UUID) => Promise<boolean>;
  // Sheets picked up from a DM in a play session. A borrowed sheet is played,
  // never persisted: the DM owns the stored copy, and lazy-save writing it into
  // the player's datastore would fork it — same reason a remotely-joined
  // character isn't saved. Lives here rather than on the encounter because the
  // save gate is in `CharacterContext`, and this is the context above it.
  markBorrowed: (uuid: UUID) => void;
  isBorrowed: (uuid: UUID) => boolean;
  // The socket went away without anyone asking it to, and we're trying to get
  // it back. Distinct from "no session": the session is still what this tab is
  // in, and the sheet on screen is still the shared one — see `reconnect`.
  reconnecting: boolean;
  // The plumbing the two role hooks below stand on. Not for components.
  bind: (bindings: SessionBindings) => void;
  hostSession: () => Promise<void>;
  joinCharacterSession: (uuid: UUID) => Promise<void>;
  fetchRemoteCharacter: () => Promise<Character | undefined>;
  disconnectRemote: () => void;
}

export const SharingSessionsContext =
  React.createContext<SharingSessionsContextData>({
    clientId: "",
    getRole: () => undefined,
    reconnecting: false,
    broadcast: () => {},
    defaultIdentity: { name: "", color: "" },
    setDefaultIdentity: () => {},
    resetDefaultIdentity: () => {},
    getIdentity: () => ({ name: "", color: "" }),
    setSessionIdentity: () => {},
    getParticipants: () => [],
    getFieldEditor: () => undefined,
    broadcastSelection: () => {},
    teardownSession: async () => false,
    markBorrowed: () => {},
    isBorrowed: () => false,
    bind: () => {},
    hostSession: async () => {},
    joinCharacterSession: async () => {},
    fetchRemoteCharacter: async () => undefined,
    disconnectRemote: () => {},
  });

export function SharingSessionsContextProvider(props: React.PropsWithChildren) {
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
  // Reads refs so once-registered handlers stay current.
  const getIdentity = useCallback(
    (uuid: UUID): Identity =>
      sessionIdentitiesRef.current[uuid] ?? defaultIdentityRef.current,
    [],
  );

  // Stable id identifying this browser tab, used to drop our own echoed edits.
  const clientIdRef = useRef<string>(randomUUID());
  // Borrowed play-session sheets, by uuid. A ref, not state: the save gate
  // reads it inside callbacks and the set is written before the character
  // loads, so nothing needs to re-render on change.
  const borrowedRef = useRef<Set<UUID>>(new Set());
  const {
    settings: { liveEditHost },
  } = useSettings();

  // The session, singular. `undefined` is "not sharing anything".
  const [active, setActive] = useState<
    { uuid: UUID; role: SessionRole } | undefined
  >();
  const activeRef = useRef(active);
  activeRef.current = active;

  // Handed up from CharacterContext (which mounts below us) via `bind`.
  const bindingsRef = useRef<Required<SessionBindings>>({
    dispatch: () => {},
    getCharacter: () => undefined,
  });

  // The field this tab has open, which travels with presence.
  const [mySelection, setMySelection] = useState<string | null>(null);

  // Bridge into the message handler, which is registered before the presence
  // hook (built on the transport) exists.
  const presenceRef = useRef<
    | {
        saw: (clientId: string, payload: SharingPresence) => void;
        left: (clientId: string) => void;
      }
    | undefined
  >();
  // Peers we've already heard from, to tell a newcomer's first announcement
  // from a heartbeat.
  const knownPeersRef = useRef(new Set<string>());
  const announceNowRef = useRef<() => void>(() => {});
  // Trying to get a dropped connection back. See `reconnect`.
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectingRef = useRef(false);

  // A joiner's session is genuinely over: the host said so (`closeSession`),
  // or we tried to get back in for long enough that "the network hiccupped" is
  // no longer a credible story. The character on screen is the host's and now
  // unreachable, so it goes.
  //
  // **This used to fire on the first dropped socket**, which on a phone is a
  // routine event — a wifi handover, a tunnel, a backgrounded tab — and it cost
  // the player their borrowed sheet and told them, wrongly, that their friend
  // had ended the session. Everything about it is unchanged except when it
  // runs: only after `reconnect` has exhausted its attempts, or on the host's
  // explicit goodbye.
  const endedRemotely = useCallback(() => {
    activeRef.current = undefined;
    setActive(undefined);
    setReconnecting(false);
    setMySelection(null);
    knownPeersRef.current.clear();
    bindingsRef.current.dispatch(resetCharacter(), false, true);
    window.alert("The sharing session has ended.");
  }, []);

  // Getting back into a session that went away without saying goodbye.
  //
  // The trigger is `onClosed`, which now also covers a socket that died
  // silently (the liveness probe in `useRealm`). Those two together are the
  // ordinary phone experience, and the old behaviour — end the session, wipe
  // the borrowed sheet, alert — was wrong for both.
  //
  // **The retry is also the diagnosis.** There is no message that distinguishes
  // "the host closed the realm" from "my connection dropped", but there is an
  // experiment: try to rejoin. A realm that answers was never gone and this was
  // our own network; a realm that keeps reporting `absent` for half a minute is
  // one nobody is hosting. The host's deliberate `closeSession` still short-
  // circuits all of this, so a real goodbye is instant and only an *unannounced*
  // disappearance pays the wait.
  const RECONNECT_BACKOFF_MS = [500, 1_500, 3_000, 5_000, 8_000, 12_000];
  const realmRef = useRef<{
    connect: (
      name: string,
      opts?: { create?: boolean },
    ) => Promise<{ ok: boolean }>;
    register: (procedure: string, handler: () => unknown) => Promise<unknown>;
    call: (procedure: string, args?: unknown[]) => Promise<unknown>;
    close: () => void;
  }>();

  const reconnect = useCallback(async () => {
    const was = activeRef.current;
    if (!was || reconnectingRef.current) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    for (const delay of RECONNECT_BACKOFF_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Superseded: the tab deliberately left, hosted something else, or
      // joined elsewhere while we were waiting. Whatever it did wins.
      if (activeRef.current !== was) break;
      const result = await realmRef.current?.connect(
        realmForCharacter(was.uuid),
        // A host recreates the room it owns; a joiner must not, or a table
        // whose host is gone would be silently replaced by an empty realm
        // serving nothing.
        { create: was.role === "host" },
      );
      if (!result?.ok) continue;
      if (was.role === "host") {
        // Registrations die with the session that made them, so the thing
        // joiners depend on has to be put back. **And checked**: the broker
        // rejects a name another session still holds — its cleanup of our old
        // registration can lag the reconnect, and a sibling tab may hold it
        // outright. A host that isn't serving `FULL_SYNC` isn't back, whatever
        // its socket says, so a rejection spends this attempt and the ladder
        // continues into the window where the stale registration has been
        // freed.
        try {
          await realmRef.current?.register(SessionEvent.FULL_SYNC, () => {
            const open = bindingsRef.current.getCharacter();
            return open?.uuid === activeRef.current?.uuid ? open : undefined;
          });
        } catch {
          realmRef.current?.close();
          continue;
        }
      } else {
        // Whatever the host changed while we were away. Our own queued edits
        // were flushed by `connect` before this call went out, so what comes
        // back already includes them.
        try {
          const fresh = (await realmRef.current?.call(
            SessionEvent.FULL_SYNC,
          )) as Character | undefined;
          if (fresh && fresh.uuid === was.uuid) {
            bindingsRef.current.dispatch(
              loadPersistedCharacter(fresh),
              false,
              true,
            );
          }
        } catch {
          // The host is back but didn't answer. The connection is what
          // mattered; the next edit either way keeps us in step.
        }
      }
      knownPeersRef.current.clear();
      announceNowRef.current();
      reconnectingRef.current = false;
      setReconnecting(false);
      return;
    }
    reconnectingRef.current = false;
    setReconnecting(false);
    // Out of tries. For a joiner that is the end of the session — the realm
    // isn't answering and the sheet on screen belongs to someone we can't
    // reach. A host keeps their own character; there is nothing to lose but
    // the sharing.
    if (activeRef.current !== was) return;
    if (was.role === "remote") {
      endedRemotely();
    } else {
      activeRef.current = undefined;
      setActive(undefined);
      knownPeersRef.current.clear();
    }
  }, [endedRemotely]);

  const realm = useRealm<SharingMessage["kind"]>({
    clientId: clientIdRef.current,
    topics: TOPIC_FOR,
    // An edit is the one message here worth holding through a blip: it is the
    // only copy of that change, and the layer has no revision convergence to
    // rediscover it with. Presence re-announces itself on the next beat, and
    // `closeSession` published into a dead socket is a goodbye nobody needs.
    queueWhileOffline: (kind) => kind === "dispatch",
    onMessage: (raw) => {
      const message = raw as SharingMessage;
      switch (message.kind) {
        case "dispatch": {
          applyRemoteEdit(bindingsRef.current.dispatch, message);
          // A peer's edit is news to this browser's other tabs too. Tagged
          // `"remote"` so no sibling forwards it back into the realm it just
          // came from — see `tab-sync.ts`.
          const uuid = activeRef.current?.uuid;
          if (uuid) {
            publishTabEdit({
              uuid,
              action: message.action,
              dirtyAction: message.dirtyAction,
              origin: "remote",
            });
          }
          return;
        }
        case "closeSession":
          // The host is closing the realm on purpose. Beat the socket's own
          // death to the cleanup so the alert says "ended", once.
          if (activeRef.current?.role === "remote") {
            realm.close();
            endedRemotely();
          }
          return;
        case "presence": {
          const from = message.clientId;
          const isNew = !knownPeersRef.current.has(from);
          knownPeersRef.current.add(from);
          presenceRef.current?.saw(from, {
            name: message.name,
            color: message.color,
            field: message.field ?? null,
          });
          // A newcomer's first announcement is also their "hello": answer it
          // directly so they see our chip and field highlight now, not on our
          // next heartbeat. Terminates — the answer isn't new to them twice.
          if (isNew) announceNowRef.current();
          return;
        }
        case "leave":
          knownPeersRef.current.delete(message.clientId);
          presenceRef.current?.left(message.clientId);
          return;
      }
    },
    // Only a connection we *still had* going away lands here — a deliberate
    // `close()` (teardown, superseding) does its own cleanup inline.
    // The connection we still had went away, and nobody asked it to. That is
    // a network event far more often than it is a decision, so it starts a
    // reconnect rather than ending anything — for the host too, whose realm
    // has to be back for the joiners retrying into it to find anything.
    onClosed: () => {
      if (!activeRef.current) return;
      void reconnect();
    },
  });
  realmRef.current = {
    connect: realm.connect,
    register: realm.register,
    call: realm.call,
    close: realm.close,
  };

  const publish = realm.publish as (message: SharingMessage) => void;

  // What we announce: the active session's identity plus the open field.
  const activeUuid = active?.uuid;
  const identity = useMemo(
    () =>
      activeUuid
        ? (sessionIdentities[activeUuid] ?? defaultIdentity)
        : defaultIdentity,
    [activeUuid, sessionIdentities, defaultIdentity],
  );
  const payload = useMemo<SharingPresence>(
    () => ({ name: identity.name, color: identity.color, field: mySelection }),
    [identity.name, identity.color, mySelection],
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const announce = useCallback(
    (p: SharingPresence) =>
      publish({ kind: "presence", clientId: clientIdRef.current, ...p }),
    [publish],
  );
  announceNowRef.current = () => announce(payloadRef.current);

  // The roster, heartbeats and pruning come with the shared hook — this layer
  // is where they were born, and now it gets them back from the same place the
  // play layer does. Renaming or opening a field changes `payload`, which
  // re-announces by itself.
  const presence = usePresence<SharingPresence>({
    connected: realm.status === "connected",
    payload,
    announce,
    same: samePresence,
  });
  presenceRef.current = { saw: presence.saw, left: presence.left };

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

  // Drop the session without ceremony — used when a new one supersedes it.
  const quietClose = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = undefined;
    setActive(undefined);
    setMySelection(null);
    knownPeersRef.current.clear();
    realm.close();
  }, [realm.close]);

  // Host: open the realm named for the character and serve it. Throws readable
  // messages — the sharing button renders them inline.
  const hostSession = useCallback(async (): Promise<void> => {
    const character = bindingsRef.current.getCharacter();
    if (!character) throw new Error("No character was found to share.");
    const uuid = character.uuid;
    const current = activeRef.current;
    if (current?.uuid === uuid && current.role === "host") return;
    quietClose();
    const result = await realm.connect(realmForCharacter(uuid), {
      create: true,
    });
    if (!result.ok) throw new Error(result.message);
    // Serve the current character to anyone who joins — but only while the
    // shared character is the open one. The old layer served whatever sheet
    // happened to be open, which handed a joiner the wrong character the
    // moment the host switched; no answer is the honest failure.
    //
    // The registration is awaited and its failure ends the attempt: the broker
    // rejects a procedure another session already holds, which is what a
    // second tab hosting the same character hits. Pressing on regardless made
    // that tab a zombie host — connected, presence-visible, and unable to
    // answer the one call joiners bootstrap through. Staying solo is honest
    // (and cheap: sibling tabs converge over tab-sync either way).
    try {
      await realm.register(SessionEvent.FULL_SYNC, () => {
        const open = bindingsRef.current.getCharacter();
        return open?.uuid === activeRef.current?.uuid ? open : undefined;
      });
    } catch {
      realm.close();
      throw new Error(
        "This character is already being shared from another tab or window.",
      );
    }
    activeRef.current = { uuid, role: "host" };
    setActive(activeRef.current);
  }, [realm.connect, realm.register, realm.close, quietClose]);

  // Joiner: connect to a friend's realm. The sheet itself is pulled separately
  // (`fetchRemoteCharacter`) so the Drive bootstrap can decide what to do with
  // it — confirm over unsaved work, or load it silently.
  const joinCharacterSession = useCallback(
    async (uuid: UUID): Promise<void> => {
      const current = activeRef.current;
      if (current?.uuid === uuid && current.role === "remote") return;
      quietClose();
      const result = await realm.connect(realmForCharacter(uuid), {
        create: false,
      });
      if (!result.ok) throw new Error(result.message);
      activeRef.current = { uuid, role: "remote" };
      setActive(activeRef.current);
    },
    [realm.connect, quietClose],
  );

  const fetchRemoteCharacter = useCallback(
    () => realm.call(SessionEvent.FULL_SYNC) as Promise<Character | undefined>,
    [realm.call],
  );

  // A joiner bowing out on purpose — "keep editing solo". No alert, no
  // character reset: the copy on screen is exactly what they chose to keep.
  const disconnectRemote = useCallback(() => {
    if (activeRef.current?.role !== "remote") return;
    publish({ kind: "leave", clientId: clientIdRef.current });
    quietClose();
  }, [publish, quietClose]);

  // Asks the live-edit server to tear down the realm. Returns `true` if the
  // request failed (callers treat that as "the session is still open").
  const closeRealmOnServer = useCallback(
    async (uuid: UUID): Promise<boolean> => {
      const res = await fetch(
        `${liveEditHost}/closeRealm/${realmForCharacter(uuid)}`,
      );
      if (res.status !== 204) {
        window.alert("Failed to close sharing session, please try again later");
        return true;
      }
      return false;
    },
    [liveEditHost],
  );

  const teardownSession = useCallback(
    async (uuid: UUID): Promise<boolean> => {
      const current = activeRef.current;
      if (!current || current.uuid !== uuid) return false;
      let failed = false;
      if (current.role === "host") {
        // Best-effort: tell joiners we're closing before the realm disappears.
        publish({ kind: "closeSession", clientId: clientIdRef.current });
        failed = await closeRealmOnServer(uuid);
      } else {
        // Joiners politely announce departure so peers drop our chip.
        publish({ kind: "leave", clientId: clientIdRef.current });
      }
      quietClose();
      return failed;
    },
    [publish, closeRealmOnServer, quietClose],
  );

  // Memoized on the state it exposes; the inline closures below are rebuilt
  // exactly when that state changes, so they always see current values.
  const providerData: SharingSessionsContextData = React.useMemo(
    () => ({
      clientId: clientIdRef.current,
      getRole: (uuid) => (active?.uuid === uuid ? active.role : undefined),
      reconnecting,
      defaultIdentity,
      setDefaultIdentity,
      resetDefaultIdentity,
      getIdentity,
      setSessionIdentity,
      getParticipants: (uuid) => (active?.uuid === uuid ? presence.roster : []),
      getFieldEditor: (uuid, field) =>
        active?.uuid === uuid
          ? presence.roster.find((p) => p.field === field)
          : undefined,
      broadcastSelection: (uuid, field) => {
        if (activeRef.current?.uuid === uuid) setMySelection(field);
      },
      markBorrowed: (uuid) => {
        borrowedRef.current.add(uuid);
      },
      isBorrowed: (uuid) => borrowedRef.current.has(uuid),
      // Publish a local edit to everyone else in the realm. No-op when the
      // active session isn't this character's — which is the guard that used
      // to be missing: an edit to some *other* open sheet must not travel
      // into the shared one's realm.
      broadcast: (uuid, action, dirtyAction) => {
        if (activeRef.current?.uuid !== uuid) return;
        publish({
          kind: "dispatch",
          clientId: clientIdRef.current,
          action,
          dirtyAction,
        });
      },
      teardownSession,
      bind: (bindings) => {
        if (bindings.dispatch) bindingsRef.current.dispatch = bindings.dispatch;
        if (bindings.getCharacter)
          bindingsRef.current.getCharacter = bindings.getCharacter;
      },
      hostSession,
      joinCharacterSession,
      fetchRemoteCharacter,
      disconnectRemote,
    }),
    [
      active,
      reconnecting,
      presence.roster,
      defaultIdentity,
      setDefaultIdentity,
      resetDefaultIdentity,
      getIdentity,
      setSessionIdentity,
      teardownSession,
      hostSession,
      joinCharacterSession,
      fetchRemoteCharacter,
      disconnectRemote,
      publish,
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

/**
 * Apply an edit that arrived from a peer. The load-bearing rule: it must be
 * replayed with `suppressBroadcast` (the third argument) or it would be
 * re-published, ping-ponging between peers forever. The self-echo check that
 * used to live beside this is the envelope's job now (`realm/envelope.ts`).
 *
 * Exported for tests — the provider needs a live WAMP connection, but this
 * decision doesn't.
 */
export function applyRemoteEdit(
  dispatch: Dispatch,
  message: { action: Action; dirtyAction?: boolean },
) {
  dispatch(message.action, message.dirtyAction, true);
}

/**
 * Host side: opens a realm for the current character and serves its initial
 * state. Edits flow over the shared realm (see `useSharingSessions`).
 */
export function useHostSharingSession(
  dispatch: Dispatch,
  getCharacter: () => Character | undefined,
) {
  const { bind, hostSession, teardownSession } = useSharingSessions();
  // Re-bound every render, so the provider (which mounts above the character)
  // always applies edits and serves syncs against the current sheet.
  bind({ dispatch, getCharacter });
  const uuid = getCharacter()?.uuid;

  return {
    startSession: hostSession,
    endSession: useCallback(
      async (): Promise<boolean> => (uuid ? teardownSession(uuid) : false),
      [teardownSession, uuid],
    ),
  };
}

/**
 * Joiner side: connects to a friend's realm, pulls the current character, and
 * keeps it in sync until either side disconnects.
 */
export function useRemoteSharingSession(dispatch: Dispatch) {
  const { bind, joinCharacterSession, fetchRemoteCharacter, disconnectRemote } =
    useSharingSessions();
  bind({ dispatch });

  return {
    joinSession: joinCharacterSession,
    getCharacter: fetchRemoteCharacter,
    disconnect: disconnectRemote,
  };
}
