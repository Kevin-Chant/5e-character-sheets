// @ts-expect-error - autobahn-browser ships no type declarations
import autobahn from "autobahn-browser";
import { accept, Envelope, stamp } from "src/lib/realm/envelope";

// One WAMP realm, joined. The half of both realtime layers that is about
// sockets rather than about the game.
//
// Both layers grew their own copy of this — the same connect sequence, the same
// "keep the connection where it can be read synchronously", the same `onclose`
// returning true to defeat autobahn's auto-reconnect, the same two error strings
// word for word. Two copies is why the good ideas ended up in only one of them:
// the character layer has a presence heartbeat and the play layer does not; the
// play layer awaits its subscriptions before announcing and the character layer
// does not. This is the shared half, so the next good idea lands once.
//
// What is deliberately *not* here: what the messages mean. A realm doesn't know
// whether it carries an encounter or a character sheet, which is what lets the
// two protocols keep their genuinely different shapes (a peer mesh with no
// owner; an owned document with a host serving `FULL_SYNC`).
//
// **This is a plain factory, not a hook.** It was a hook, and a hook can only
// ever hold one of a thing: one socket, one realm, one connection per component
// that calls it. That was the ceiling under the character layer's
// "one sharing session at a time" — the realms are named per character, so the
// protocol was always ready for several, but the transport could not hold them.
// A factory can be held in a `Map`. `use-realm.tsx` is the React wrapper for the
// layers that genuinely want exactly one (a browser sits at one table), and the
// character layer holds instances directly, one per shared sheet.

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
  // Ready to show; the callers were all writing their own copies of these.
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

// --- Liveness ----------------------------------------------------------------
//
// **A socket can die without saying so, and on a phone that is the common
// case.** Moving between wifi and mobile data, or a NAT dropping an idle
// mapping, leaves a connection that never delivers a close frame: the browser
// still reports it open, `onclose` never fires, and every layer above sits
// there reading "Live" while nothing arrives in either direction. That is the
// worst failure this app has, because it is indistinguishable from a quiet
// table.
//
// Nothing local can detect it — the question is whether packets still make a
// round trip — so the only honest test is to make one. Each client registers a
// procedure named after itself and calls it: the request travels to the broker
// and the invocation comes back, over the same socket, through the same code
// path a real message uses. nightlife-rabbit doesn't exclude a caller from its
// own registration (verified against a local sidecar: 4ms round trip), which is
// what lets a client alone at an empty table check its own connection.
const PING_PROCEDURE = "net.dndcharactersheets.realm.ping.";
// Often enough that a drop is noticed inside a turn, rarely enough to be
// invisible: two tiny frames every twenty seconds.
const PING_EVERY_MS = 20_000;
// A round trip that hasn't landed in this long isn't slow, it's gone. Generous
// for a phone on a bad connection, where a real answer can take seconds.
const PING_TIMEOUT_MS = 8_000;

// How long a message published into a dead socket is worth holding, and how
// many. A roll report from ten seconds ago is still the roll everyone is
// waiting on; one from five minutes ago is noise arriving at the wrong moment,
// so the queue is deliberately short-lived and small rather than durable.
const QUEUE_MAX_AGE_MS = 30_000;
const QUEUE_MAX = 40;

// How long a replayable publish waits for the broker's PUBLISHED confirmation
// before assuming it died with the socket. The same patience as the liveness
// probe, for the same reason: a phone's real answer can take seconds.
//
// The confirmation exists because of the zombie window — a socket that died
// without a close frame accepts publishes without error for the up-to-36s it
// takes the probe to notice, and everything "sent" in that window was simply
// lost. Only the kinds a layer marks replayable pay for the acknowledgement;
// an unconfirmed message is queued for the reconnect replay, and a
// confirmation that arrives *after* the timeout pulls it back out — a late ack
// means it was delivered, and replaying a delivered edit after newer ones
// could roll a field back.
const ACK_TIMEOUT_MS = 8_000;

export interface RealmOptions<K extends string> {
  // This tab's identity, stamped on everything we publish and used to drop our
  // own echo on everything we receive.
  clientId: string;
  // Where the sidecar lives. Re-read on every `connect`, not captured once, so
  // changing the host in Settings takes effect on the next connection rather
  // than on a reload.
  liveEditHost: string;
  // The kinds this realm subscribes to, and the topic each one travels on.
  // Taken as a table rather than a list so the protocol keeps owning its own
  // topic names — `TOPIC_FOR` in each layer.
  topics: Record<K, string>;
  // Called for each message that survives `accept`. Read through the live
  // options every time, so it always sees current state rather than what was
  // captured at connect.
  onMessage: (message: Envelope & { kind: K }) => void;
  // Called when a connection that *had* opened goes away, for whatever reason —
  // including a liveness probe concluding it had gone away without telling us.
  onClosed?: () => void;
  // Which message kinds are worth holding when they're published into a socket
  // that isn't there, and replaying on the next connection to the same realm.
  //
  // Deliberately the layer's decision, not this file's, because it turns on
  // what a message *means*. A shared document's edit is worth replaying (it is
  // the only copy of that change); an encounter broadcast is not (the next one
  // supersedes it, and the merge converges anyway); a sync request is not (its
  // id has expired). Absent means queue nothing, which is the old behaviour.
  queueWhileOffline?: (kind: K) => boolean;
}

// The observable state. A fresh object on every change and the *same* object
// when nothing moved, which is what `useSyncExternalStore` requires of a
// snapshot — return a new one unconditionally and React re-renders forever.
export interface RealmSnapshot {
  status: RealmStatus;
  error: string | undefined;
  realm: string | undefined;
}

export interface RealmInstance<K extends string> {
  getSnapshot: () => RealmSnapshot;
  subscribe: (listener: () => void) => () => void;
  // Keep the live handlers, topics and host current without rebuilding the
  // instance — the refs-updated-every-render trick, now explicit.
  update: (options: Partial<RealmOptions<K>>) => void;
  connect: (name: string, opts?: { create?: boolean }) => Promise<RealmResult>;
  close: () => void;
  refuse: (message: string) => RealmFailed;
  publish: (
    message: { kind: K; clientId: string; toClientId?: string },
    heldSince?: number,
  ) => void;
  register: (procedure: string, handler: () => unknown) => Promise<unknown>;
  call: (procedure: string, args?: unknown[]) => Promise<unknown>;
  connected: () => boolean;
  // Stop the liveness interval and drop the socket. An instance that outlives
  // its owner with a live interval keeps probing a socket nobody is listening
  // to — which used to be the unmount effect.
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

  // Messages that didn't provably reach the broker. Held here rather than
  // dropped, and flushed when the same realm comes back.
  let queued: {
    at: number;
    realm: string;
    message: { kind: K; clientId: string };
  }[] = [];
  // The realm we are meant to be in, which outlives the socket — a queued
  // message may only be replayed into the room it was meant for.
  let wantedRealm: string | undefined;

  const enqueue = (
    realm: string,
    message: { kind: K; clientId: string },
    at?: number,
  ) => {
    // `at` survives a failed replay — restamping would let one message cycle
    // through reconnects forever, which the age cap exists to end.
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
    // No socket at all. For most kinds that's the end of it — `onclose` has
    // moved the UI to offline, and the next state supersedes this one
    // anyway. For the kinds a layer says are worth replaying, the
    // alternative to holding it is losing it in silence, which is what a
    // player experiences as "I rolled and the DM never saw it".
    if (!live) {
      if (replayable) enqueue(realm!, message, heldSince);
      return;
    }
    try {
      if (!replayable) {
        live.publish(options.topics[message.kind], [stamp(message)]);
        return;
      }
      // A replayable kind asks the broker to say it arrived, because a
      // zombie socket accepts publishes without error — see ACK_TIMEOUT_MS.
      const ack = live.publish(
        options.topics[message.kind],
        [stamp(message)],
        {},
        { acknowledge: true },
      );
      // Both deferred holds re-check the wanted realm: a deliberate close()
      // in the meantime means nothing is worth replaying any more, and its
      // queue-clearing already ran.
      let held: { at: number } | undefined;
      const timer = setTimeout(() => {
        if (wantedRealm !== realm) return;
        held = enqueue(realm!, message, heldSince);
      }, ACK_TIMEOUT_MS);
      Promise.resolve(ack).then(
        () => {
          clearTimeout(timer);
          // Confirmed late: it was delivered after all, and replaying a
          // delivered edit after newer ones could roll a field back.
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

  // Replay what was held, oldest first, dropping anything stale or meant for
  // another room. Called once a connection is up and subscribed. Routed back
  // through `publish`, so a replay that dies unconfirmed is held again — the
  // age cap is what stops that cycling forever.
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

  // The character layer's `FULL_SYNC`: an owned document has one host who can
  // be *asked*, which is a genuinely different question from the party
  // session's "does anyone here know the state". Exposed rather than wrapped
  // because only one layer has a registrant.
  //
  // Always a promise, and one the caller must handle: a broker rejects a
  // procedure name another session already holds (`procedure_already_exists`),
  // which is exactly what a second tab hosting the same character hits. A
  // caller that ignores the rejection believes it is serving a procedure it
  // never got — the ping registration below documents where that road ends.
  const register: RealmInstance<K>["register"] = (procedure, handler) => {
    if (!session) return Promise.reject(new Error("Not connected to a realm."));
    return Promise.resolve(session.register(procedure, handler));
  };

  const call: RealmInstance<K>["call"] = (procedure, args = []) => {
    if (!session) return Promise.resolve(undefined);
    return session.call(procedure, args);
  };

  // Monotonic id per connect attempt, bumped by `connect` and `close`. The
  // supersession story for *opened* connections is the identity check in
  // `onclose`; this is the same story for attempts still in flight.
  let generation = 0;

  // The liveness loop. Started when a connection opens, stopped by anything
  // that takes one away.
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  // One probe: call our own registration and insist on an answer.
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

  // Declare a connection dead that never said so. Everything `onclose` would
  // have done, done by hand — because `onclose` is exactly what isn't coming.
  const declareDead = () => {
    stopHeartbeat();
    try {
      connection?.close();
    } catch {
      // Closing a socket the OS has already forgotten can throw. It changes
      // nothing: we are treating it as gone either way.
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
      // **Never on one failure.** A tab that was frozen and resumed fires its
      // pending timers immediately, which fails a probe that was perfectly
      // healthy; so does a single dropped frame on a bad connection. A second
      // probe, taken fresh, is cheap and turns "we were asleep" into a pass.
      if (!session) return;
      if (await probe()) return;
      declareDead();
    }, PING_EVERY_MS);
  };

  const fail = (reason: RealmFailure): RealmFailed => {
    setState({ status: "error", error: MESSAGES[reason] });
    return { ok: false, reason, message: MESSAGES[reason] };
  };

  // Refuse before trying — a code that isn't a code. Reported through the same
  // status and error as a real failure, so a caller has one place to look.
  const refuse = (message: string): RealmFailed => {
    setState({ status: "error", error: message });
    return { ok: false, reason: "absent", message };
  };

  // **Resolves when the realm is actually joined**, not when the attempt was
  // started. The old versions returned as soon as `connection.open()` had been
  // *called*, so every caller had to re-derive "am I connected yet" by watching
  // a status field from an effect — and anything done straight after the await
  // was running against a socket that wasn't there yet.
  const connect: RealmInstance<K>["connect"] = async (name, opts) => {
    // Supersede whatever was open on *this instance*: one realm per instance,
    // and the old connection's `onclose` is silenced by the identity check
    // below. (Several realms at once is several instances, not one instance
    // holding several sockets — the supersession story below is why.)
    //
    // An attempt that hasn't *opened* yet has no connection to close, so
    // superseding it takes the generation counter: its `onopen` finds itself
    // stale and closes itself instead of stealing the session back from the
    // connection that replaced it.
    const gen = ++generation;
    stopHeartbeat();
    try {
      connection?.close();
    } catch {
      // Already closing — all we wanted.
    }
    session = undefined;
    connection = undefined;
    // Recorded before the attempt, not after it succeeds: anything published
    // while this is in flight belongs to this room, and the queue has to be
    // able to say so.
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
    // A connection that closes *before* it ever opened means the realm isn't
    // there — nobody is hosting this code yet.
    let opened = false;

    return new Promise<RealmResult>((resolve) => {
      attempt.onopen = async (live: any) => {
        // Superseded while opening: a newer connect() or close() has moved
        // on. Bow out without touching the state — it belongs to the
        // replacement now. Resolved as a failure without `fail()`, which
        // would clobber the replacement's status for a caller that no
        // longer cares.
        if (gen !== generation) {
          try {
            attempt.close();
          } catch {
            // Already closing — all we wanted.
          }
          resolve({ ok: false, reason: "closed", message: MESSAGES.closed });
          return;
        }
        opened = true;
        session = live;
        connection = attempt;
        try {
          // **Await the subscriptions before resolving.** `subscribe` is a
          // round trip to the broker, and anything the caller publishes the
          // moment this resolves — a sync request, say — would otherwise get
          // an answer this client isn't listening for yet, which looks
          // exactly like joining an empty room. It's a race, so it fails
          // intermittently and only when a peer is actually there.
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
          // The socket went away mid-subscribe (or the broker refused one).
          // A half-subscribed session is worse than none — it looks
          // connected and misses messages — so this attempt fails outright.
          // The caller hears it; the shared status is only touched if the
          // attempt still owns it.
          try {
            attempt.close();
          } catch {
            // Already closing — all we wanted.
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
        // Our own echo, for asking the socket whether it is still a socket.
        // Registered per client id, so two tabs in one realm don't collide
        // and a stale registration from a dead session can't answer for us.
        let probeRegistered = false;
        try {
          await live.register(`${PING_PROCEDURE}${options.clientId}`, () =>
            Date.now(),
          );
          probeRegistered = true;
        } catch {
          // A broker that won't take the registration costs us the liveness
          // check, not the session — every other path still works, and a
          // probe that can never answer would be worse than none. Which is
          // why the heartbeat below only starts when the registration took:
          // probing a name we don't hold either fails instantly or, worse,
          // reaches a stale registration on a dead session and times out —
          // and either way declares *this* healthy connection dead twenty
          // seconds after it opened, forever, on every reconnect.
        }
        // Superseded while the round trips above were in flight: the
        // replacement's connect() closed this socket and owns the state
        // now. Report the failure to this attempt's caller only.
        if (gen !== generation) {
          resolve({ ok: false, reason: "closed", message: MESSAGES.closed });
          return;
        }
        setState({ realm: name, status: "connected" });
        if (probeRegistered) startHeartbeat();
        // Whatever was held while there was no socket, now that there is one
        // and we are subscribed to hear the answers.
        flushQueue(name);
        resolve({ ok: true });
      };

      attempt.onclose = () => {
        // A connection that is no longer ours — closed deliberately by
        // `close()`, or superseded by a newer `connect()` — must not report
        // itself: its `onClosed` would fire *after* the replacement opened
        // and tear down the new session's state. `onClosed` means "the
        // connection you still had went away", nothing else.
        const current = connection === attempt;
        if (current) {
          stopHeartbeat();
          session = undefined;
          connection = undefined;
          setState({ realm: undefined });
        }
        if (!opened) {
          const reason: RealmFailure = opts?.create ? "closed" : "absent";
          // A stale attempt reports its failure to its caller only — the
          // shared status now describes the connection that replaced it.
          resolve(
            gen === generation
              ? fail(reason)
              : { ok: false, reason, message: MESSAGES[reason] },
          );
        } else if (current) {
          setState({ status: "offline" });
          options.onClosed?.();
        }
        // Suppress autobahn's own reconnect: a realm that has genuinely gone
        // must stay gone, or its retry races whatever the app does next.
        return true;
      };

      attempt.open();
    });
  };

  const close = () => {
    // Invalidate any attempt still in flight — its `onopen` must not resurrect
    // a session after the caller chose to have none.
    generation++;
    stopHeartbeat();
    connection?.close();
    session = undefined;
    connection = undefined;
    // Leaving on purpose: nothing held is worth replaying into a room we chose
    // to walk out of.
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
