// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { accept, Envelope, stamp } from "src/lib/realm/envelope";

// One WAMP realm, joined. The socket-handling half shared by both realtime
// layers; it doesn't know what the messages mean (encounter vs. character
// sheet), which is what lets each protocol keep its own shape.
//
// A plain factory, not a hook, so several can be held in a `Map` (the
// character layer holds one per shared sheet). `use-realm.tsx` is the React
// wrapper for layers that want exactly one.

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
  message: string;
}

export type RealmResult = { ok: true } | RealmFailed;

export const MESSAGES: Record<RealmFailure, string> = {
  unreachable:
    "Couldn't reach the sharing server. Check the sharing host in Settings.",
  refused: "The sharing server refused the session.",
  absent:
    "No session with that code is open. Check the code, or ask whoever started it to keep their tab open.",
  closed: "The sharing server accepted the session but closed the connection.",
};

// Liveness: a socket can die without a close frame (wifi/mobile handover, NAT
// dropping an idle mapping), leaving `onclose` never firing while nothing
// arrives. Detected by each client registering a procedure named after
// itself and calling it — a round trip over the same socket. nightlife-rabbit
// doesn't exclude a caller from its own registration.
const PING_PROCEDURE = "net.dndcharactersheets.realm.ping.";
const PING_EVERY_MS = 20_000;
// Generous for a phone on a bad connection.
const PING_TIMEOUT_MS = 8_000;

// How long/many messages published into a dead socket are held for replay.
// Short-lived and small deliberately — stale reports are noise, not history.
const QUEUE_MAX_AGE_MS = 30_000;
const QUEUE_MAX = 40;

// How long a goodbye waits to be taken by the broker before the caller stops
// holding a teardown open for it.
const GOODBYE_ACK_MS = 2_000;

// How long a replayable publish waits for the broker's PUBLISHED confirmation
// before assuming it died with the socket (a zombie socket accepts publishes
// without error until the probe notices it's gone). An unconfirmed message is
// queued for reconnect replay; a confirmation arriving after the timeout
// pulls it back out, since replaying a delivered edit after newer ones could
// roll a field back.
const ACK_TIMEOUT_MS = 8_000;

export interface RealmOptions<K extends string> {
  clientId: string;
  // Re-read on every connect so a Settings change applies to the next
  // connection, not a reload.
  liveEditHost: string;
  // Kind -> topic. A table (not a list) so each protocol owns its own topic
  // names (`TOPIC_FOR`).
  topics: Record<K, string>;
  onMessage: (message: Envelope & { kind: K }) => void;
  // Fires when a previously-open connection goes away, including a liveness
  // probe concluding it silently died.
  onClosed?: () => void;
  // Which kinds are worth holding (and replaying on reconnect) when published
  // into a dead socket. Left to the layer, since it depends on what a message
  // means — e.g. a document edit is the only copy of that change and is worth
  // replaying; an encounter broadcast is superseded by the next one and
  // isn't. Absent means queue nothing.
  queueWhileOffline?: (kind: K) => boolean;
}

// Fresh object on change, same object when nothing moved — required by
// useSyncExternalStore.
export interface RealmSnapshot {
  status: RealmStatus;
  error: string | undefined;
  realm: string | undefined;
}

export interface RealmInstance<K extends string> {
  getSnapshot: () => RealmSnapshot;
  subscribe: (listener: () => void) => () => void;
  update: (options: Partial<RealmOptions<K>>) => void;
  connect: (name: string, opts?: { create?: boolean }) => Promise<RealmResult>;
  close: () => void;
  refuse: (message: string) => RealmFailed;
  publish: (
    message: { kind: K; clientId: string; toClientId?: string },
    heldSince?: number,
  ) => void;
  // Publish, resolving once the broker has taken it — for a caller about to
  // tear the realm down, whose message would otherwise race the teardown.
  // Never rejects: a goodbye that didn't leave is not worth an error.
  farewell: (message: { kind: K; clientId: string }) => Promise<void>;
  register: (procedure: string, handler: () => unknown) => Promise<unknown>;
  call: (procedure: string, args?: unknown[]) => Promise<unknown>;
  connected: () => boolean;
  dispose: () => void;
}

export function createRealm<K extends string>(
  initial: RealmOptions<K>,
): RealmInstance<K> {
  let options = initial;

  let connection: Connection | undefined;
  let session: any;

  let snapshot: RealmSnapshot = {
    status: "offline",
    error: undefined,
    realm: undefined,
  };
  const listeners = new Set<() => void>();
  const setState = (next: Partial<RealmSnapshot>) => {
    const merged = { ...snapshot, ...next };
    if (
      merged.status === snapshot.status &&
      merged.error === snapshot.error &&
      merged.realm === snapshot.realm
    ) {
      return;
    }
    snapshot = merged;
    for (const listener of listeners) listener();
  };

  const kinds = () => Object.keys(options.topics) as K[];

  // Messages that didn't provably reach the broker, flushed when the same
  // realm comes back.
  let queued: {
    at: number;
    realm: string;
    message: { kind: K; clientId: string };
  }[] = [];
  // Outlives the socket — a queued message may only replay into the room it
  // was meant for.
  let wantedRealm: string | undefined;

  const enqueue = (
    realm: string,
    message: { kind: K; clientId: string },
    at?: number,
  ) => {
    // `at` survives a failed replay so the age cap can end its cycling.
    const entry = { at: at ?? Date.now(), realm, message };
    queued = [...queued.slice(-(QUEUE_MAX - 1)), entry];
    return entry;
  };
  const unqueue = (entry: { at: number }) => {
    queued = queued.filter((held) => held !== entry);
  };

  const publish: RealmInstance<K>["publish"] = (message, heldSince) => {
    const realm = wantedRealm;
    const replayable = !!realm && !!options.queueWhileOffline?.(message.kind);
    const live = session;
    if (!live) {
      if (replayable) enqueue(realm!, message, heldSince);
      return;
    }
    try {
      if (!replayable) {
        live.publish(options.topics[message.kind], [stamp(message)]);
        return;
      }
      const ack = live.publish(
        options.topics[message.kind],
        [stamp(message)],
        {},
        { acknowledge: true },
      );
      // Both deferred holds re-check wantedRealm — a deliberate close() means
      // nothing is worth replaying and its queue-clearing already ran.
      let held: { at: number } | undefined;
      const timer = setTimeout(() => {
        if (wantedRealm !== realm) return;
        held = enqueue(realm!, message, heldSince);
      }, ACK_TIMEOUT_MS);
      Promise.resolve(ack).then(
        () => {
          clearTimeout(timer);
          if (held) unqueue(held);
        },
        () => {
          clearTimeout(timer);
          if (!held && wantedRealm === realm) {
            enqueue(realm!, message, heldSince);
          }
        },
      );
    } catch {
      if (replayable) enqueue(realm!, message, heldSince);
    }
  };

  // nightlife-rabbit answers PUBLISHED before it dispatches the event, but
  // both happen in one turn and the subscribers' writes are queued by the
  // time the ack is sent — so the ack is the signal that the message is past
  // the point a `closeRealm` could overtake it.
  const farewell: RealmInstance<K>["farewell"] = (message) => {
    const live = session;
    if (!live) return Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ack = live.publish(
        options.topics[message.kind],
        [stamp(message)],
        {},
        { acknowledge: true },
      );
      return Promise.race([
        Promise.resolve(ack).then(
          () => undefined,
          () => undefined,
        ),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, GOODBYE_ACK_MS);
        }),
      ]).finally(() => clearTimeout(timer));
    } catch {
      return Promise.resolve();
    }
  };

  // Replays held messages, oldest first, dropping stale ones or those meant
  // for another room. Routed back through publish, so an unconfirmed replay
  // is held again (age cap stops it cycling forever).
  const flushQueue = (realm: string) => {
    const now = Date.now();
    const pending = queued;
    queued = [];
    for (const entry of pending) {
      if (entry.realm !== realm) continue;
      if (now - entry.at > QUEUE_MAX_AGE_MS) continue;
      publish(entry.message, entry.at);
    }
  };

  // Used for the character layer's FULL_SYNC RPC. Always a promise the caller
  // must handle: the broker rejects a procedure name already held
  // (procedure_already_exists) — e.g. a second tab hosting the same character.
  const register: RealmInstance<K>["register"] = (procedure, handler) => {
    if (!session) return Promise.reject(new Error("Not connected to a realm."));
    return Promise.resolve(session.register(procedure, handler));
  };

  const call: RealmInstance<K>["call"] = (procedure, args = []) => {
    if (!session) return Promise.resolve(undefined);
    return session.call(procedure, args);
  };

  // Monotonic id per connect attempt, bumped by connect/close. Handles
  // supersession for attempts still in flight (the identity check in
  // `onclose` handles it for already-opened connections).
  let generation = 0;

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const probe = async (): Promise<boolean> => {
    const live = session;
    if (!live) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answer = live.call(`${PING_PROCEDURE}${options.clientId}`, []);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS);
      });
      await Promise.race([answer, timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  // Declares a connection dead that never said so via onclose.
  const declareDead = () => {
    stopHeartbeat();
    try {
      connection?.close();
    } catch {
      // Already gone either way.
    }
    session = undefined;
    connection = undefined;
    setState({ realm: undefined, status: "offline" });
    options.onClosed?.();
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeat = setInterval(async () => {
      if (!session) return;
      if (await probe()) return;
      // Never declare dead on one failure — a resumed tab or a single
      // dropped frame fails a probe that's actually fine.
      if (!session) return;
      if (await probe()) return;
      declareDead();
    }, PING_EVERY_MS);
  };

  const fail = (reason: RealmFailure): RealmFailed => {
    setState({ status: "error", error: MESSAGES[reason] });
    return { ok: false, reason, message: MESSAGES[reason] };
  };

  // Reports through the same status/error as a real connect failure, for a
  // code that's rejected before trying to connect.
  const refuse = (message: string): RealmFailed => {
    setState({ status: "error", error: message });
    return { ok: false, reason: "absent", message };
  };

  // Resolves when the realm is actually joined, not when the attempt started.
  const connect: RealmInstance<K>["connect"] = async (name, opts) => {
    // Supersede whatever was open on this instance. An attempt that hasn't
    // opened yet has no connection to close, so the generation counter
    // handles it: a stale onopen closes itself instead of stealing the
    // session from its replacement.
    const gen = ++generation;
    stopHeartbeat();
    try {
      connection?.close();
    } catch {
      // Already closing.
    }
    session = undefined;
    connection = undefined;
    // Recorded before the attempt succeeds — anything published while in
    // flight belongs to this room, and the queue needs to know that.
    wantedRealm = name;
    setState({ status: "connecting", error: undefined });

    const host = options.liveEditHost;
    if (opts?.create) {
      try {
        const res = await fetch(`${host}/openRealm/${name}`);
        if (res.status !== 200) return fail("refused");
      } catch {
        return fail("unreachable");
      }
    }

    const attempt: Connection = new autobahn.Connection({
      url: host,
      realm: name,
    });
    // Closing before ever opening means nobody is hosting this realm.
    let opened = false;

    return new Promise<RealmResult>((resolve) => {
      attempt.onopen = async (live: any) => {
        // Superseded while opening — bow out without touching shared state.
        if (gen !== generation) {
          try {
            attempt.close();
          } catch {
            // Already closing.
          }
          resolve({ ok: false, reason: "closed", message: MESSAGES.closed });
          return;
        }
        opened = true;
        session = live;
        connection = attempt;
        try {
          // Await subscriptions before resolving — otherwise a caller
          // publishing right after resolve (e.g. a sync request) can get an
          // answer before it's listening.
          await Promise.all(
            kinds().map((kind) =>
              live.subscribe(options.topics[kind], (args: any[]) => {
                const result = accept(args?.[0], {
                  clientId: options.clientId,
                  kinds: kinds(),
                });
                if (!result.ok) return;
                options.onMessage(result.message);
              }),
            ),
          );
        } catch {
          // Socket went away mid-subscribe, or the broker refused one — a
          // half-subscribed session is worse than none, so fail outright.
          try {
            attempt.close();
          } catch {
            // Already closing.
          }
          if (gen === generation) {
            session = undefined;
            connection = undefined;
            resolve(fail("closed"));
          } else {
            resolve({
              ok: false,
              reason: "closed",
              message: MESSAGES.closed,
            });
          }
          return;
        }
        // Registered per client id so two tabs in one realm don't collide.
        let probeRegistered = false;
        try {
          await live.register(`${PING_PROCEDURE}${options.clientId}`, () =>
            Date.now(),
          );
          probeRegistered = true;
        } catch {
          // Registration refused costs us the liveness check, not the
          // session. Heartbeat only starts if registration succeeded —
          // otherwise probing a name we don't hold would fail or time out
          // and wrongly declare a healthy connection dead.
        }
        // Superseded while the round trips above were in flight.
        if (gen !== generation) {
          resolve({ ok: false, reason: "closed", message: MESSAGES.closed });
          return;
        }
        setState({ realm: name, status: "connected" });
        if (probeRegistered) startHeartbeat();
        flushQueue(name);
        resolve({ ok: true });
      };

      attempt.onclose = () => {
        // A connection no longer ours (closed deliberately or superseded)
        // must not report itself — onClosed means only "the connection you
        // still had went away".
        const current = connection === attempt;
        if (current) {
          stopHeartbeat();
          session = undefined;
          connection = undefined;
          setState({ realm: undefined });
        }
        if (!opened) {
          const reason: RealmFailure = opts?.create ? "closed" : "absent";
          resolve(
            gen === generation
              ? fail(reason)
              : { ok: false, reason, message: MESSAGES[reason] },
          );
        } else if (current) {
          setState({ status: "offline" });
          options.onClosed?.();
        }
        // Suppress autobahn's own reconnect so it can't race the app's own.
        return true;
      };

      attempt.open();
    });
  };

  const close = () => {
    // Invalidates any attempt still in flight so it can't resurrect a session.
    generation++;
    stopHeartbeat();
    connection?.close();
    session = undefined;
    connection = undefined;
    queued = [];
    wantedRealm = undefined;
    setState({ realm: undefined, status: "offline", error: undefined });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (next) => {
      options = { ...options, ...next };
    },
    connect,
    close,
    refuse,
    publish,
    farewell,
    register,
    call,
    connected: () => !!session,
    dispose: () => {
      stopHeartbeat();
      try {
        connection?.close();
      } catch {
        // Already gone — all we wanted.
      }
      session = undefined;
      connection = undefined;
      listeners.clear();
    },
  };
}
