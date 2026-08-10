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
import {
  createPresenceStore,
  PresenceStore,
} from "src/lib/realm/presence-store";
import { PresenceEntry } from "src/lib/realm/presence";
import { realmForCharacter } from "src/lib/session-codes";
import { publishTabEdit } from "src/lib/tab-sync";
import reducer from "./reducers/reducer";

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
      // **Which character this edit is for.** The realm is named for a
      // character, so this looks redundant — and it was, right up until the
      // session outlived the sheet that opened it. A session is a property of
      // the browser (nothing ends one when you open a different character), so
      // a host with sheet B on screen still holds sheet A's realm, and an edit
      // arriving from A used to be dispatched straight into B — then autosaved
      // there, because the save gate only skips sheets we joined *remotely*.
      // Every sibling path already carried this check (outbound `broadcast`,
      // tab-sync's inbound, the reconnect `FULL_SYNC`); this one didn't,
      // because the message had nothing to check against.
      //
      // In the multi-session layer this stops being only a guard and becomes
      // the routing key: which of N open sessions an arriving edit belongs to.
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

// What the provider needs from the layers below it in the tree. The character
// (and its dispatch) live in `CharacterContext`, which mounts *under* this
// provider — so the hooks below hand these up through refs each render, the
// same knot the encounter provider ties with its transport.
interface SessionBindings {
  dispatch?: Dispatch;
  getCharacter?: () => Character | undefined;
  // The stored copy of *any* character, read and written without opening it.
  //
  // A session is per character, but `CharacterContext` holds exactly one — so
  // for every session whose sheet isn't on screen there was no dispatch target
  // and nothing to serve. That is what made "one session at a time" the honest
  // description of a uuid-keyed API. These two are the way out: the reducer is
  // pure, so an edit for a closed sheet can be folded into its stored copy and
  // written back, and a joiner asking for a sheet we aren't looking at can be
  // answered from the same place.
  loadStored?: (uuid: UUID) => Promise<Character | undefined>;
  saveStored?: (character: Character) => Promise<void>;
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
  fetchRemoteCharacter: (uuid: UUID) => Promise<Character | undefined>;
  disconnectRemote: (uuid: UUID) => void;
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

// One live session per shared character — the map the old `active` field was a
// single slot of.
//
// The public API was always uuid-keyed; what it lacked was anything to key
// *into*. A browser could hold one socket, so every uuid but one answered "no
// session", and the character layer described that honestly as
// "one sharing session at a time". Then a DM who owns the party's sheets opens
// a second one, and the honest limit turns into a hazard: the session outlives
// the sheet that opened it, and the edits it carries land on whatever is on
// screen. Holding several is the fix that removes the mismatch rather than
// guarding it.
interface Session {
  uuid: UUID;
  role: SessionRole;
  realm: RealmInstance<SharingMessage["kind"]>;
  presence: PresenceStore<SharingPresence>;
  // Peers we've heard from, to tell a newcomer's first announcement from a
  // heartbeat. Per session: the same tab can be in several rooms, and a peer
  // in one of them is a stranger to the others.
  knownPeers: Set<string>;
  // The field this tab has open *in this session's sheet*.
  selection: string | null;
  // Trying to get a dropped connection back — see `reconnect`. `running`
  // guards the campaign against being started twice for one session.
  reconnecting: boolean;
  reconnectRunning: boolean;
  // The last payload actually announced, and whether the transport was up at
  // the previous sync. Together they keep the announce effect below from
  // turning every re-render into a publish.
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

  // The sessions, plural. A ref rather than state because every path that
  // touches it — a message handler, a reconnect ladder, an async connect — runs
  // outside React and needs to read the current map synchronously. `bump` is
  // what turns a change into a render.
  const sessionsRef = useRef(new Map<UUID, Session>());
  // `tick` is not decoration: it is the only thing in `providerData`'s dep list
  // that actually moves. The map's identity never changes and neither does the
  // reducer's dispatch, so memoizing on those hands consumers a context value
  // that is `===` forever — the roster stays correct and nothing ever re-reads
  // it, which looks exactly like presence being broken.
  const [tick, forceRender] = useReducer((n: number) => n + 1, 0);
  const bump = useCallback(() => forceRender(), []);

  // Handed up from CharacterContext (which mounts below us) via `bind`.
  const bindingsRef = useRef<Required<SessionBindings>>({
    dispatch: () => {},
    getCharacter: () => undefined,
    loadStored: async () => undefined,
    saveStored: async () => {},
  });

  // Edits that arrived for a character this browser isn't looking at.
  //
  // **Serialized per uuid, and that is the whole reason this is a queue rather
  // than a function.** Each apply is read-modify-write against storage, so two
  // edits landing in the same tick would both read the same stored copy and the
  // second would write over the first — silently, and to a file nobody has open
  // to notice. Chaining on the previous promise makes the reads and writes for
  // one character strictly ordered; different characters still run in parallel.
  const backgroundWrites = useRef(new Map<UUID, Promise<void>>());
  const applyBackgroundEdit = useCallback(
    (uuid: UUID, message: { action: Action; dirtyAction?: boolean }) => {
      const previous = backgroundWrites.current.get(uuid) ?? Promise.resolve();
      const next = previous
        .then(async () => {
          // Opened while we were queued: the in-memory copy is the authority
          // from here, and the ordinary dispatch path owns writing it. Checked
          // *inside* the chain rather than before it, because the sheet can be
          // opened between an edit arriving and its turn coming round.
          const open = bindingsRef.current.getCharacter();
          if (open?.uuid === uuid) {
            applyRemoteEdit(bindingsRef.current.dispatch, message, uuid);
            return;
          }
          const stored = await bindingsRef.current.loadStored(uuid);
          if (!stored) return;
          const updated = reducer(stored, message.action);
          if (!updated) return;
          await bindingsRef.current.saveStored(updated);
        })
        .catch((error) => {
          // A failed background write must not poison the chain for every
          // later edit to the same sheet — the next one reads storage fresh
          // and is the better copy anyway.
          console.error("Background edit failed for", uuid, error);
        });
      backgroundWrites.current.set(uuid, next);
    },
    [],
  );

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

  // Forget a session and give back everything it held. Idempotent: the map
  // check means a session already replaced by a newer one for the same uuid
  // tears itself down without evicting its replacement.
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
        // An edit is the one message here worth holding through a blip: it is
        // the only copy of that change, and the layer has no revision
        // convergence to rediscover it with. Presence re-announces itself on
        // the next beat, and `closeSession` published into a dead socket is a
        // goodbye nobody needs.
        queueWhileOffline: (kind) => kind === "dispatch",
        onMessage: (raw) =>
          handleMessageRef.current(session, raw as SharingMessage),
        // Only a connection we *still had* going away lands here — a deliberate
        // `close()` (teardown, superseding) does its own cleanup inline. That
        // is a network event far more often than it is a decision, so it starts
        // a reconnect rather than ending anything — for the host too, whose
        // realm has to be back for the joiners retrying into it to find
        // anything. A session already dropped is not ours to revive.
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

  // A joiner's session is genuinely over: the host said so (`closeSession`), or
  // we tried to get back in for long enough that "the network hiccupped" is no
  // longer a credible story. The character on screen is the host's and now
  // unreachable, so it goes.
  //
  // **This used to fire on the first dropped socket**, which on a phone is a
  // routine event — a wifi handover, a tunnel, a backgrounded tab — and it cost
  // the player their borrowed sheet and told them, wrongly, that their friend
  // had ended the session. Everything about it is unchanged except when it
  // runs: only after `reconnect` has exhausted its attempts, or on the host's
  // explicit goodbye.
  //
  // **Only resets the sheet if it is the one on screen.** With a single session
  // that was true by construction; holding several, a room ending in the
  // background must not clear the character the user is actually looking at.
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
        // Applied only to the character it names — never to whatever happens
        // to be on screen, which is the whole bug this layer was carrying. The
        // open sheet goes through the reducer in `CharacterContext`; any other
        // is folded into its stored copy and written back, in order.
        const open = bindingsRef.current.getCharacter();
        if (open?.uuid === message.uuid) {
          applyRemoteEdit(bindingsRef.current.dispatch, message, open.uuid);
        } else if (session.role === "host") {
          applyBackgroundEditRef.current(message.uuid, message);
        }
        // The third case — a *joined* session whose sheet isn't open — writes
        // nothing, deliberately. The host owns that document; folding a peer's
        // edit into our copy of it is the fork the save gate exists to prevent
        // (`getRole(uuid) === "remote"` in `CharacterContext`). Nothing is lost
        // by dropping it: reopening the sheet re-joins and pulls `FULL_SYNC`,
        // which is the host's current copy including this edit.
        // A peer's edit is news to this browser's other tabs too. Tagged
        // `"remote"` so no sibling forwards it back into the realm it just came
        // from — see `tab-sync.ts`.
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

  // Getting back into a session that went away without saying goodbye.
  //
  // The trigger is `onClosed`, which now also covers a socket that died
  // silently (the liveness probe in `realm.ts`). Those two together are the
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
    for (const delay of RECONNECT_BACKOFF_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Superseded: the tab deliberately left, hosted something else, or joined
      // elsewhere while we were waiting. Whatever it did wins.
      if (!stillOurs()) return finish();
      const result = await session.realm.connect(
        realmForCharacter(session.uuid),
        // A host recreates the room it owns; a joiner must not, or a table
        // whose host is gone would be silently replaced by an empty realm
        // serving nothing.
        { create: session.role === "host" },
      );
      if (!result.ok) continue;
      if (session.role === "host") {
        // Registrations die with the session that made them, so the thing
        // joiners depend on has to be put back. **And checked**: the broker
        // rejects a name another session still holds — its cleanup of our old
        // registration can lag the reconnect, and a sibling tab may hold it
        // outright. A host that isn't serving `FULL_SYNC` isn't back, whatever
        // its socket says, so a rejection spends this attempt and the ladder
        // continues into the window where the stale registration has been
        // freed.
        try {
          await session.realm.register(SessionEvent.FULL_SYNC, () =>
            serveSyncRef.current(session),
          );
        } catch {
          session.realm.close();
          continue;
        }
      } else {
        // Whatever the host changed while we were away. Our own queued edits
        // were flushed by `connect` before this call went out, so what comes
        // back already includes them.
        try {
          const fresh = (await session.realm.call(SessionEvent.FULL_SYNC)) as
            | Character
            | undefined;
          if (fresh && fresh.uuid === session.uuid) {
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
      session.knownPeers.clear();
      session.announced = undefined;
      return finish();
    }
    // Out of tries. For a joiner that is the end of the session — the realm
    // isn't answering and the sheet on screen belongs to someone we can't
    // reach. A host keeps their own character; there is nothing to lose but
    // the sharing.
    finish();
    if (!stillOurs()) return;
    if (session.role === "remote") {
      endedRemotely(session);
    } else {
      dropSession(session);
    }
  };

  // What a joiner gets. The uuid check is structural rather than a comparison
  // now: the handler belongs to one session, and that session is named for one
  // character.
  //
  // **And it answers for a sheet that isn't open.** The old handler served the
  // open character and `undefined` for anything else, which was honest when a
  // browser could hold one session — the sheet was either on screen or not
  // being shared. Holding several, a host is routinely serving a character it
  // is not looking at, so "the open one" is the wrong question. The right one
  // is "the copy we would persist": the open sheet when it is open, the stored
  // one otherwise, which the background writer above keeps current.
  const serveSyncRef = useRef(async (session: Session) => {
    const open = bindingsRef.current.getCharacter();
    if (open?.uuid === session.uuid) return open;
    // Behind the same per-uuid chain as the writes, so a sync can never read a
    // stored copy halfway through having an edit folded into it.
    await backgroundWrites.current.get(session.uuid);
    return bindingsRef.current.loadStored(session.uuid);
  });

  // Keep every session's roster in step with its own transport, and say who we
  // are whenever that changes. `setConnected` is idempotent and the payload is
  // compared against the last one announced, so running this on every render
  // costs a few object compares and never a stray publish.
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
    // The registration is awaited and its failure ends the attempt: the broker
    // rejects a procedure another session already holds, which is what a second
    // tab hosting the same character hits. Pressing on regardless made that tab
    // a zombie host — connected, presence-visible, and unable to answer the one
    // call joiners bootstrap through. Staying solo is honest (and cheap:
    // sibling tabs converge over tab-sync either way).
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
        // A failed join must leave no trace: `getRole` answering "remote" for a
        // room we never got into is what the Drive bootstrap reads as "already
        // handled", and it would never retry.
        dropSession(session);
        throw new Error(result.message);
      }
      bump();
    },
    [dropSession, makeSession, bump],
  );

  // The host's current copy of one shared character. **Checked against the uuid
  // we asked for**, the same guard the reconnect path has always had: a realm is
  // named for a character, but a host that has moved on can still answer with
  // something else, and loading that blind is how a browser ends up holding a
  // sheet nobody handed it.
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
        // Best-effort: tell joiners we're closing before the realm disappears.
        session.realm.publish({
          kind: "closeSession",
          clientId: clientIdRef.current,
        });
        failed = await closeRealmOnServer(uuid);
      } else {
        // Joiners politely announce departure so peers drop our chip.
        session.realm.publish({ kind: "leave", clientId: clientIdRef.current });
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
      // Publish a local edit to everyone else in that character's realm. A uuid
      // with no session is a no-op, which is the guard that keeps an edit to
      // some *other* open sheet out of a realm it has nothing to do with — and
      // the message carries the uuid so the receiving side can make the same
      // check rather than assuming.
      broadcast: (uuid, action, dirtyAction) => {
        const session = sessions.get(uuid);
        if (!session) return;
        // The transport's publish is typed for the envelope's own fields; the
        // layer's message shape is the layer's business.
        (session.realm.publish as (m: SharingMessage) => void)({
          kind: "dispatch",
          clientId: clientIdRef.current,
          uuid,
          action,
          dirtyAction,
        });
      },
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
      // Not read by any closure above — it is what makes them be rebuilt. See
      // the note on `tick`.
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
 * Apply an edit that arrived from a peer. Two load-bearing rules:
 *
 * - It must be replayed with `suppressBroadcast` (the third argument) or it
 *   would be re-published, ping-ponging between peers forever. The self-echo
 *   check that used to live beside this is the envelope's job now
 *   (`realm/envelope.ts`).
 * - It must land on the character it names. `targetUuid` is the sheet this
 *   dispatch would reach — the open one — and a mismatch means the session
 *   outlived the sheet that opened it, so the edit belongs to a character we
 *   are no longer holding. Dropping is the only safe answer while there is
 *   exactly one dispatch target.
 *
 * Exported for tests — the provider needs a live WAMP connection, but this
 * decision doesn't.
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
  // Re-bound every render, so the provider (which mounts above the character)
  // always applies edits and serves syncs against the current sheet — and,
  // through `storage`, against the ones that aren't open.
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
