import React, {
  useCallback,
  useContext,
  useEffect,
  useReducer,
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
import { createRealm, RealmInstance } from "src/lib/realm/realm";
import { backoffDelayMs, RECONNECT_JITTER } from "src/lib/realm/backoff";
import {
  createPresenceStore,
  PresenceStore,
} from "src/lib/realm/presence-store";
import { PresenceEntry } from "src/lib/realm/presence";
import { realmForCharacter } from "src/lib/session-codes";
import { publishTabEdit, subscribeTabEdits } from "src/lib/tab-sync";
import { isDriveAuthError } from "src/lib/google-auth";
import reducer from "./reducers/reducer";

// Character co-editing: one shared sheet, several browsers, over a realm named
// for the character's uuid. Sockets/subscriptions/self-echo/teardown live in
// `useRealm`; this file is the protocol and roles.
//
// Sync is an RPC (`FULL_SYNC` against the host), not ask-the-room. Roles are
// asymmetric: host owns persistence, a joiner never saves its copy.
//
// One session per character (see the `Session` map below): a session outlives
// the sheet that opened it, so every message/reconnect/save must name and
// check the character it's for rather than trust whatever is on screen.

const BASE_APPNAME = "net.dndcharactersheets";

export const SessionEvent = {
  DISPATCH: BASE_APPNAME + ".dispatch",
  FULL_SYNC: BASE_APPNAME + ".fullsync",
  CLOSE_SESSION: BASE_APPNAME + ".closesession",
  PRESENCE: BASE_APPNAME + ".presence",
  LEAVE: BASE_APPNAME + ".leave",
};

// Whether this client opened the realm (host) or joined a friend's (remote).
type SessionRole = "host" | "remote";

// A participant's self-chosen name/color, plus the field they have open
// (null when not editing anything).
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
      // Which character this edit is for — the routing key for which of the
      // open sessions it belongs to; also re-checked against the session's
      // own uuid since the broker is unauthenticated.
      uuid: UUID;
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

// What the provider needs from the layers below it. `CharacterContext` mounts
// under this provider, so these are handed up through refs each render.
interface SessionBindings {
  dispatch?: Dispatch;
  getCharacter?: () => Character | undefined;
  // Read/write the stored copy of a character that isn't the open sheet —
  // lets a background edit be folded into it and a sync request answered
  // without opening it.
  loadStored?: (uuid: UUID) => Promise<Character | undefined>;
  saveStored?: (character: Character) => Promise<void>;
}

interface SharingSessionsContextData {
  clientId: string;
  getRole: (uuid: UUID) => SessionRole | undefined;
  broadcast: (uuid: UUID, action: Action, dirtyAction?: boolean) => void;
  // Persisted default presence identity, and the resolved identity for a
  // given session (override, else default).
  defaultIdentity: Identity;
  setDefaultIdentity: (identity: Identity) => void;
  resetDefaultIdentity: () => void;
  getIdentity: (uuid: UUID) => Identity;
  setSessionIdentity: (uuid: UUID, identity: Identity) => void;
  getParticipants: (uuid: UUID) => Participant[];
  getFieldEditor: (uuid: UUID, field: string) => Participant | undefined;
  // Publish which field this tab now has open (null when it closes the editor).
  broadcastSelection: (uuid: UUID, field: string | null) => void;
  // Closes the realm server-side (host only) and the connection; safe when no
  // session is open. Returns `true` if the server close failed.
  teardownSession: (uuid: UUID) => Promise<boolean>;
  // Sheets picked up from a DM in a play session — played, never persisted,
  // same reason a remotely-joined character isn't saved.
  markBorrowed: (uuid: UUID) => void;
  isBorrowed: (uuid: UUID) => boolean;
  // A socket dropped unasked and we're trying to get it back (see `reconnect`).
  reconnecting: boolean;
  // Characters whose background fold-and-save failed (a peer edited a sheet
  // we host but aren't looking at, and the write didn't land).
  backgroundSaveErrors: { uuid: UUID; kind: "auth" | "error" }[];
  retryBackgroundSaves: () => void;
  // Plumbing the two role hooks below stand on. Not for components.
  bind: (bindings: SessionBindings) => void;
  hostSession: () => Promise<void>;
  joinCharacterSession: (uuid: UUID) => Promise<void>;
  fetchRemoteCharacter: (uuid: UUID) => Promise<Character | undefined>;
  disconnectRemote: (uuid: UUID) => void;
}

export const SharingSessionsContext =
  React.createContext<SharingSessionsContextData>({
    clientId: "",
    getRole: () => undefined,
    reconnecting: false,
    backgroundSaveErrors: [],
    retryBackgroundSaves: () => {},
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

// One live session per shared character, keyed by uuid — a browser can host
// or join several at once.
interface Session {
  uuid: UUID;
  role: SessionRole;
  realm: RealmInstance<SharingMessage["kind"]>;
  presence: PresenceStore<SharingPresence>;
  // Peers heard from, per session, to tell a newcomer's first announcement
  // from a heartbeat.
  knownPeers: Set<string>;
  // The field this tab has open in this session's sheet.
  selection: string | null;
  // Reconnect campaign in progress (see `reconnect`); `reconnectRunning`
  // guards against starting it twice for one session.
  reconnecting: boolean;
  reconnectRunning: boolean;
  // Last payload announced + prior connection state, so the announce effect
  // only publishes on an actual change.
  announced?: SharingPresence;
  wasConnected: boolean;
  teardown: () => void;
}

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
  const liveEditHostRef = useRef(liveEditHost);
  liveEditHostRef.current = liveEditHost;

  // Ref (not state): handlers/reconnect/connect run outside React and need to
  // read the current map synchronously. `bump` turns a change into a render.
  const sessionsRef = useRef(new Map<UUID, Session>());
  // `tick` is the only thing in `providerData`'s dep list that actually
  // changes — the map's identity and the dispatch never do, so it's what
  // forces the memo to rebuild.
  const [tick, forceRender] = useReducer((n: number) => n + 1, 0);
  const bump = useCallback(() => forceRender(), []);

  // Handed up from CharacterContext (which mounts below us) via `bind`.
  const bindingsRef = useRef<Required<SessionBindings>>({
    dispatch: () => {},
    getCharacter: () => undefined,
    loadStored: async () => undefined,
    saveStored: async () => {},
  });

  // Edits for a character this browser isn't looking at. Queued and chained
  // per uuid (not just called) so two edits in the same tick don't both
  // read-modify-write storage and clobber each other; different characters
  // still run in parallel.
  const backgroundWrites = useRef(new Map<UUID, Promise<void>>());
  // Edits whose fold-and-save failed, by character, oldest first — held
  // rather than logged since they're the only copy of that change. Capped so
  // a sheet nobody can write to has bounded memory cost.
  const MAX_HELD_EDITS = 100;
  const failedEdits = useRef(
    new Map<UUID, { action: Action; dirtyAction?: boolean }[]>(),
  );
  const [backgroundErrors, setBackgroundErrors] = useState<
    Record<UUID, "auth" | "error">
  >({});
  const applyBackgroundEdit = useCallback(
    (uuid: UUID, message: { action: Action; dirtyAction?: boolean }) => {
      const previous = backgroundWrites.current.get(uuid) ?? Promise.resolve();
      const next = previous
        .then(async () => {
          // Sheet may have opened while queued — check inside the chain, not
          // before it, and defer to the ordinary dispatch path if so.
          if (bindingsRef.current.getCharacter()?.uuid === uuid) {
            applyRemoteEdit(bindingsRef.current.dispatch, message, uuid);
            return;
          }
          const stored = await bindingsRef.current.loadStored(uuid);
          // Re-check after the (possibly Drive) round trip — it may have
          // opened during the load, making `stored` stale.
          if (bindingsRef.current.getCharacter()?.uuid === uuid) {
            applyRemoteEdit(bindingsRef.current.dispatch, message, uuid);
            return;
          }
          if (!stored) return;
          const updated = reducer(stored, message.action);
          if (!updated) return;
          await bindingsRef.current.saveStored(updated);
          // A write that lands retires whatever the last one failed with.
          failedEdits.current.delete(uuid);
          setBackgroundErrors((prev) => {
            if (!(uuid in prev)) return prev;
            const rest = { ...prev };
            delete rest[uuid];
            return rest;
          });
        })
        .catch((error) => {
          // Don't let a failed write poison the chain for later edits — the
          // next one reads storage fresh.
          console.error("Background edit failed for", uuid, error);
          const held = failedEdits.current.get(uuid) ?? [];
          failedEdits.current.set(uuid, [
            ...held.slice(-(MAX_HELD_EDITS - 1)),
            message,
          ]);
          setBackgroundErrors((prev) => ({
            ...prev,
            [uuid]: isDriveAuthError(error) ? "auth" : "error",
          }));
        });
      backgroundWrites.current.set(uuid, next);
    },
    [],
  );

  // Replay held edits in order, per character. Clear first: a retry that
  // fails again re-sets the flag from the same failure path.
  const retryBackgroundSaves = useCallback(() => {
    const held = failedEdits.current;
    failedEdits.current = new Map();
    setBackgroundErrors({});
    for (const [uuid, edits] of held) {
      for (const edit of edits) applyBackgroundEdit(uuid, edit);
    }
  }, [applyBackgroundEdit]);

  // Late-bound so the transport's handlers, which are built before these
  // exist, can reach the current ones. The same knot the encounter provider
  // ties with its own transport.
  const handleMessageRef = useRef<
    (session: Session, m: SharingMessage) => void
  >(() => {});
  const reconnectRef = useRef<(session: Session) => Promise<void>>(
    async () => {},
  );
  const applyBackgroundEditRef = useRef<
    (uuid: UUID, message: { action: Action; dirtyAction?: boolean }) => void
  >(() => {});

  // Forget a session and tear it down. Idempotent — a session already
  // replaced for the same uuid tears itself down without evicting the new one.
  const dropSession = useCallback(
    (session: Session) => {
      if (sessionsRef.current.get(session.uuid) === session) {
        sessionsRef.current.delete(session.uuid);
      }
      session.teardown();
      bump();
    },
    [bump],
  );

  const makeSession = useCallback(
    (uuid: UUID, role: SessionRole): Session => {
      const session: Session = {
        uuid,
        role,
        knownPeers: new Set<string>(),
        selection: null,
        reconnecting: false,
        reconnectRunning: false,
        wasConnected: false,
        teardown: () => {},
      } as unknown as Session;

      session.realm = createRealm<SharingMessage["kind"]>({
        clientId: clientIdRef.current,
        liveEditHost: liveEditHostRef.current,
        topics: TOPIC_FOR,
        // Only edits are worth queueing through a blip — the only copy of
        // that change. Presence re-announces on the next beat; a queued
        // `closeSession` is a stale goodbye nobody needs.
        queueWhileOffline: (kind) => kind === "dispatch",
        onMessage: (raw) =>
          handleMessageRef.current(session, raw as SharingMessage),
        // Fires only for an unrequested drop (deliberate `close()` cleans up
        // inline) — starts a reconnect rather than ending the session.
        onClosed: () => {
          if (sessionsRef.current.get(uuid) !== session) return;
          void reconnectRef.current(session);
        },
      });

      session.presence = createPresenceStore<SharingPresence>({
        payload: { name: "", color: "", field: null },
        announce: (p) =>
          session.realm.publish({
            kind: "presence",
            clientId: clientIdRef.current,
            ...p,
          }),
        same: samePresence,
      });

      const offRealm = session.realm.subscribe(bump);
      const offPresence = session.presence.subscribe(bump);
      session.teardown = () => {
        offRealm();
        offPresence();
        session.presence.setConnected(false);
        session.presence.dispose();
        session.realm.close();
        session.realm.dispose();
      };
      return session;
    },
    [bump],
  );

  // A joiner's session is over: host said so (`closeSession`), or `reconnect`
  // exhausted its attempts. Only resets the sheet if it's the one on screen —
  // a room ending in the background must not clear what the user is looking at.
  const endedRemotely = useCallback(
    (session: Session) => {
      dropSession(session);
      if (bindingsRef.current.getCharacter()?.uuid === session.uuid) {
        bindingsRef.current.dispatch(resetCharacter(), false, true);
      }
      window.alert("The sharing session has ended.");
    },
    [dropSession],
  );

  applyBackgroundEditRef.current = applyBackgroundEdit;

  handleMessageRef.current = (session, message) => {
    switch (message.kind) {
      case "dispatch": {
        // Re-check the uuid: the broker is unauthenticated, so a hand-rolled
        // message naming another character would otherwise be applied to it.
        if (message.uuid !== session.uuid) return;
        // Open sheet: apply via reducer. Host, sheet not open: fold into
        // storage. Joined session, sheet not open: drop it — the host owns
        // that document, and folding here would fork it; reopening re-joins
        // and pulls FULL_SYNC.
        const open = bindingsRef.current.getCharacter();
        if (open?.uuid === message.uuid) {
          applyRemoteEdit(bindingsRef.current.dispatch, message, open.uuid);
        } else if (session.role === "host") {
          applyBackgroundEditRef.current(message.uuid, message);
        }
        // Forward to sibling tabs, tagged "remote" so none re-publishes it
        // back into the realm it came from (see tab-sync.ts).
        publishTabEdit({
          uuid: message.uuid,
          action: message.action,
          dirtyAction: message.dirtyAction,
          origin: "remote",
        });
        return;
      }
      case "closeSession":
        // The host is closing the realm on purpose. Beat the socket's own death
        // to the cleanup so the alert says "ended", once.
        if (session.role === "remote") {
          session.realm.close();
          endedRemotely(session);
        }
        return;
      case "presence": {
        const from = message.clientId;
        const isNew = !session.knownPeers.has(from);
        session.knownPeers.add(from);
        session.presence.saw(from, {
          name: message.name,
          color: message.color,
          field: message.field ?? null,
        });
        // A newcomer's first announcement is also their "hello": answer it
        // directly so they see our chip and field highlight now, not on our
        // next heartbeat. Terminates — the answer isn't new to them twice.
        if (isNew) session.presence.announceNow();
        return;
      }
      case "leave":
        session.knownPeers.delete(message.clientId);
        session.presence.left(message.clientId);
        return;
    }
  };

  // Getting back into a session that went away without saying goodbye
  // (`onClosed`, including a silently-dead socket per the liveness probe in
  // realm.ts). No message distinguishes "host closed it" from "network
  // dropped", so the retry itself is the diagnosis: a realm that answers was
  // never gone; one that stays `absent` for ~30s isn't hosted anymore. A
  // deliberate `closeSession` still short-circuits this.
  const RECONNECT_BACKOFF_MS = [500, 1_500, 3_000, 5_000, 8_000, 12_000];
  reconnectRef.current = async (session: Session) => {
    if (session.reconnectRunning) return;
    // Superseded or torn down while we were being called.
    if (sessionsRef.current.get(session.uuid) !== session) return;
    session.reconnectRunning = true;
    session.reconnecting = true;
    bump();
    const stillOurs = () => sessionsRef.current.get(session.uuid) === session;
    const finish = () => {
      session.reconnectRunning = false;
      session.reconnecting = false;
      bump();
    };
    for (let attempt = 0; attempt < RECONNECT_BACKOFF_MS.length; attempt++) {
      const delay = backoffDelayMs(
        attempt,
        RECONNECT_BACKOFF_MS,
        RECONNECT_JITTER,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Superseded while waiting (left, hosted/joined elsewhere) — that wins.
      if (!stillOurs()) return finish();
      const result = await session.realm.connect(
        realmForCharacter(session.uuid),
        // A joiner must not recreate a table whose host is gone.
        { create: session.role === "host" },
      );
      if (!result.ok) continue;
      if (session.role === "host") {
        // Registrations die with the session; re-register FULL_SYNC. The
        // broker can reject a name a stale registration (ours or a sibling
        // tab's) still holds — that spends this attempt, ladder continues.
        try {
          await session.realm.register(SessionEvent.FULL_SYNC, () =>
            serveSyncRef.current(session),
          );
        } catch {
          session.realm.close();
          continue;
        }
      } else {
        // Pull the host's current state (queued edits were already flushed by
        // `connect`). Check both `fresh.uuid` (host answered the right
        // character) and the open sheet's uuid (we're still looking at it) —
        // a session outlives the sheet that opened it, so only the second
        // check would let this replace an unrelated open sheet.
        try {
          const fresh = (await session.realm.call(SessionEvent.FULL_SYNC)) as
            | Character
            | undefined;
          const open = bindingsRef.current.getCharacter();
          if (
            fresh &&
            fresh.uuid === session.uuid &&
            open?.uuid === fresh.uuid
          ) {
            bindingsRef.current.dispatch(
              loadPersistedCharacter(fresh),
              false,
              true,
            );
          }
        } catch {
          // Connected but no answer — next edit keeps us in step regardless.
        }
      }
      session.knownPeers.clear();
      session.announced = undefined;
      return finish();
    }
    // Out of tries: for a joiner this ends the session; a host keeps its own
    // character and just loses the sharing.
    finish();
    if (!stillOurs()) return;
    if (session.role === "remote") {
      endedRemotely(session);
    } else {
      dropSession(session);
    }
  };

  // What FULL_SYNC serves: the open sheet if it's this session's character,
  // otherwise the stored copy (the host may be serving a character it isn't
  // looking at).
  const serveSyncRef = useRef(async (session: Session) => {
    const open = bindingsRef.current.getCharacter();
    if (open?.uuid === session.uuid) return open;
    // Wait on the same per-uuid chain as the writes so a sync never reads a
    // stored copy mid-fold.
    await backgroundWrites.current.get(session.uuid);
    return bindingsRef.current.loadStored(session.uuid);
  });

  // Keep each session's presence in step with its transport and re-announce
  // on change. Runs every render; cheap since the payload is compared first.
  useEffect(() => {
    for (const session of sessionsRef.current.values()) {
      const connected = session.realm.getSnapshot().status === "connected";
      session.presence.setConnected(connected);
      const identity = getIdentity(session.uuid);
      const payload: SharingPresence = {
        name: identity.name,
        color: identity.color,
        field: session.selection,
      };
      session.presence.update({ payload });
      const justConnected = connected && !session.wasConnected;
      session.wasConnected = connected;
      if (!connected) {
        session.announced = undefined;
        continue;
      }
      if (
        justConnected ||
        !session.announced ||
        !samePresence(session.announced, payload)
      ) {
        session.announced = payload;
        session.presence.announceNow();
      }
    }
  });

  // Publish a local edit to that character's realm; no session for the uuid
  // is a no-op.
  const broadcast = useCallback(
    (uuid: UUID, action: Action, dirtyAction?: boolean) => {
      const session = sessionsRef.current.get(uuid);
      if (!session) return;
      // Transport's publish type covers only the envelope; cast to the
      // layer's own message shape.
      (session.realm.publish as (m: SharingMessage) => void)({
        kind: "dispatch",
        clientId: clientIdRef.current,
        uuid,
        action,
        dirtyAction,
      });
    },
    [],
  );

  // Forward a sibling tab's edit into whichever of our realms it belongs to.
  // Lives here (not `CharacterContext`) because the session map is what knows
  // which realm a uuid maps to. "remote"-origin messages aren't forwarded —
  // they already arrived over a realm; re-sending would loop (tab-sync.ts).
  useEffect(
    () =>
      subscribeTabEdits((message) => {
        if (message.origin !== "local") return;
        broadcast(message.uuid, message.action, message.dirtyAction);
      }),
    [broadcast],
  );

  // Every socket goes when the provider does.
  useEffect(() => {
    const sessions = sessionsRef.current;
    return () => {
      for (const session of sessions.values()) session.teardown();
      sessions.clear();
    };
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

  // Host: open the realm named for the character and serve it. Throws readable
  // messages — the sharing button renders them inline.
  const hostSession = useCallback(async (): Promise<void> => {
    const character = bindingsRef.current.getCharacter();
    if (!character) throw new Error("No character was found to share.");
    const uuid = character.uuid;
    const existing = sessionsRef.current.get(uuid);
    if (existing?.role === "host") return;
    // Joined this character and now hosting it: the old membership goes first.
    if (existing) dropSession(existing);

    const session = makeSession(uuid, "host");
    sessionsRef.current.set(uuid, session);
    bump();
    const result = await session.realm.connect(realmForCharacter(uuid), {
      create: true,
    });
    if (!result.ok) {
      dropSession(session);
      throw new Error(result.message);
    }
    // The broker rejects a FULL_SYNC registration another session already
    // holds — a second tab hosting the same character. Fail rather than
    // become a zombie host that can't answer joiners.
    try {
      await session.realm.register(SessionEvent.FULL_SYNC, () =>
        serveSyncRef.current(session),
      );
    } catch {
      dropSession(session);
      throw new Error(
        "This character is already being shared from another tab or window.",
      );
    }
    bump();
  }, [dropSession, makeSession, bump]);

  // Joiner: connect to a friend's realm. The sheet itself is pulled separately
  // (`fetchRemoteCharacter`) so the Drive bootstrap can decide what to do with
  // it — confirm over unsaved work, or load it silently.
  const joinCharacterSession = useCallback(
    async (uuid: UUID): Promise<void> => {
      const existing = sessionsRef.current.get(uuid);
      if (existing?.role === "remote") return;
      if (existing) dropSession(existing);

      const session = makeSession(uuid, "remote");
      sessionsRef.current.set(uuid, session);
      bump();
      const result = await session.realm.connect(realmForCharacter(uuid), {
        create: false,
      });
      if (!result.ok) {
        // Must leave no trace — `getRole` answering "remote" here would read
        // to the Drive bootstrap as "already handled" and never retry.
        dropSession(session);
        throw new Error(result.message);
      }
      bump();
    },
    [dropSession, makeSession, bump],
  );

  // The host's current copy of one shared character; result checked against
  // the uuid asked for, same as the reconnect path.
  const fetchRemoteCharacter = useCallback(
    async (uuid: UUID): Promise<Character | undefined> => {
      const session = sessionsRef.current.get(uuid);
      if (session?.role !== "remote") return undefined;
      const fresh = (await session.realm.call(SessionEvent.FULL_SYNC)) as
        | Character
        | undefined;
      return fresh && fresh.uuid === uuid ? fresh : undefined;
    },
    [],
  );

  // A joiner bowing out on purpose — "keep editing solo". No alert, no
  // character reset: the copy on screen is exactly what they chose to keep.
  const disconnectRemote = useCallback(
    (uuid: UUID) => {
      const session = sessionsRef.current.get(uuid);
      if (session?.role !== "remote") return;
      session.realm.publish({ kind: "leave", clientId: clientIdRef.current });
      dropSession(session);
    },
    [dropSession],
  );

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
      const session = sessionsRef.current.get(uuid);
      if (!session) return false;
      let failed = false;
      if (session.role === "host") {
        // Awaited, not fired: closing the realm on the server races the
        // goodbye through the broker, and a joiner that loses that race sits
        // on a frozen sheet until the reconnect campaign gives up on it.
        await session.realm.farewell({
          kind: "closeSession",
          clientId: clientIdRef.current,
        });
        failed = await closeRealmOnServer(uuid);
      } else {
        // Joiners politely announce departure so peers drop our chip.
        await session.realm.farewell({
          kind: "leave",
          clientId: clientIdRef.current,
        });
      }
      dropSession(session);
      return failed;
    },
    [closeRealmOnServer, dropSession],
  );

  // Rebuilt when anything a consumer reads changes — which `bump` forces on
  // every session event, so the closures below always see the current map.
  const sessions = sessionsRef.current;
  const providerData: SharingSessionsContextData = React.useMemo(
    () => ({
      clientId: clientIdRef.current,
      getRole: (uuid) => sessions.get(uuid)?.role,
      // Any session getting itself back. Nothing keys off *which* one — the
      // banner it drives is about this browser's connection, not a sheet's.
      reconnecting: [...sessions.values()].some((s) => s.reconnecting),
      defaultIdentity,
      setDefaultIdentity,
      resetDefaultIdentity,
      getIdentity,
      setSessionIdentity,
      getParticipants: (uuid) =>
        sessions.get(uuid)?.presence.getSnapshot().roster ?? [],
      getFieldEditor: (uuid, field) =>
        sessions
          .get(uuid)
          ?.presence.getSnapshot()
          .roster.find((p) => p.field === field),
      broadcastSelection: (uuid, field) => {
        const session = sessions.get(uuid);
        if (!session || session.selection === field) return;
        session.selection = field;
        // The announce effect publishes it — it already knows how to tell a
        // changed payload from a re-render.
        bump();
      },
      markBorrowed: (uuid) => {
        borrowedRef.current.add(uuid);
      },
      isBorrowed: (uuid) => borrowedRef.current.has(uuid),
      broadcast,
      backgroundSaveErrors: Object.entries(backgroundErrors).map(
        ([uuid, kind]) => ({ uuid: uuid as UUID, kind }),
      ),
      retryBackgroundSaves,
      teardownSession,
      bind: (bindings) => {
        if (bindings.dispatch) bindingsRef.current.dispatch = bindings.dispatch;
        if (bindings.getCharacter)
          bindingsRef.current.getCharacter = bindings.getCharacter;
        if (bindings.loadStored)
          bindingsRef.current.loadStored = bindings.loadStored;
        if (bindings.saveStored)
          bindingsRef.current.saveStored = bindings.saveStored;
      },
      hostSession,
      joinCharacterSession,
      fetchRemoteCharacter,
      disconnectRemote,
    }),
    [
      sessions,
      broadcast,
      backgroundErrors,
      retryBackgroundSaves,
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
      bump,
      // Not read above; forces the memo to rebuild (see note on `tick`).
      tick,
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
 * Apply an edit from a peer with `suppressBroadcast` so it isn't re-published
 * into a loop; dropped if `message.uuid` doesn't match `targetUuid` (the
 * session outlived the sheet it named). Exported for tests.
 */
export function applyRemoteEdit(
  dispatch: Dispatch,
  message: { uuid?: UUID; action: Action; dirtyAction?: boolean },
  targetUuid?: UUID,
) {
  if (message.uuid && targetUuid && message.uuid !== targetUuid) return;
  dispatch(message.action, message.dirtyAction, true);
}

/**
 * Host side: opens a realm for the current character and serves its initial
 * state. Edits flow over the shared realm (see `useSharingSessions`).
 */
export function useHostSharingSession(
  dispatch: Dispatch,
  getCharacter: () => Character | undefined,
  storage?: {
    loadStored: (uuid: UUID) => Promise<Character | undefined>;
    saveStored: (character: Character) => Promise<void>;
  },
) {
  const { bind, hostSession, teardownSession } = useSharingSessions();
  // Re-bound every render so the provider always applies edits/syncs against
  // the current sheet.
  bind({ dispatch, getCharacter, ...storage });
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
