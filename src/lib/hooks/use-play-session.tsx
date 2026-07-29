import { useCallback, useRef, useState } from "react";
import { Encounter } from "src/lib/play/encounter";
import {
  HealingOffer,
  isEncounter,
  isValidSessionCode,
  newSessionCode,
  normalizeSessionCode,
  realmForSession,
  RollCall,
  SessionMessage,
  TOPIC_FOR,
} from "src/lib/play/session";
import { RollReport, RollVerdict } from "src/lib/play/reports";
import { RealmResult, useRealm } from "src/lib/realm/use-realm";

// The party session's transport: which messages exist and who they go to.
//
// Sockets, subscriptions, self-echo, versioning and teardown are `useRealm` —
// this file is now only the protocol. Everything it *decides* still lives in
// `play/session.ts`, which is the split the codebase already used: network
// paths are verified by hand, so the decisions inside them are extracted to
// somewhere a test can reach.

export type SessionStatus = "offline" | "connecting" | "connected" | "error";

// Joining resolves with the code that was joined. A host doesn't know it in
// advance — the transport mints it — and the caller needs it in the same breath
// to record the table in this browser's memory.
export type JoinResult =
  | Extract<RealmResult, { ok: false }>
  | {
      ok: true;
      code: string;
    };

interface PlaySessionOptions {
  clientId: string;
  // Applied when a peer sends state. The provider decides how to merge.
  onRemoteState: (encounter: Encounter, fromClientId: string) => void;
  // A peer announced itself: reply with what we have so it can catch up.
  onHello: (fromClientId: string) => void;
  // A peer left: drop what it owned.
  onLeave: (fromClientId: string) => void;
  // A peer said who they are. Names only — liveness is best-effort (no
  // heartbeats), which is fine for a dropdown and would be wrong for a lock.
  onPresence: (fromClientId: string, name: string) => void;
  // The DM pointed a sheet at us. Addressed, so the envelope has already
  // dropped the copies meant for other clients.
  onAssignSheet: (participantId: string, fromClientId: string) => void;
  // The DM called for initiative. Each player client raises its own prompt.
  onCallInitiative: (fromClientId: string) => void;
  // A player rolled something at the table — a to-hit, damage, an answered
  // check. Everyone hears it; whoever holds the seat queues it.
  onRollReport: (report: RollReport, fromClientId: string) => void;
  // The DM ruled on a to-hit roll. Each client keeps the ones addressed to it.
  onRollVerdict: (verdict: RollVerdict, fromClientId: string) => void;
  // The DM asked for a d20 — everyone, or one addressed client.
  onRollCall: (call: RollCall, fromClientId: string) => void;
  // Approved healing looking for its recipient — each client checks whether
  // the target participant is its own open character.
  onHealingOffer: (offer: HealingOffer, fromClientId: string) => void;
  // Someone wants to play an offered sheet: whoever owns it replies.
  onClaimSheet: (participantId: string, fromClientId: string) => void;
  // A whole sheet arrived, addressed to us. The provider validates and loads it.
  onSheet: (participantId: string, character: unknown) => void;
}

export function usePlaySession(options: PlaySessionOptions) {
  const { clientId } = options;
  const [code, setCode] = useState<string | undefined>();
  // Held in a ref so the once-registered subscription always calls the current
  // closure rather than the one captured at connect time.
  const handlers = useRef(options);
  handlers.current = options;

  const realm = useRealm<SessionMessage["kind"]>({
    clientId,
    topics: TOPIC_FOR,
    // One exhaustive switch instead of twelve subscriptions. The envelope has
    // already dropped our own echo, an unknown kind, a future version and
    // anything addressed elsewhere, so everything here is ours to act on.
    onMessage: (raw) => {
      const message = raw as SessionMessage;
      const on = handlers.current;
      switch (message.kind) {
        case "state":
          // The one payload big enough to be worth checking: a peer on a
          // different build handing us something that isn't an encounter would
          // otherwise throw inside this callback, which whitescreens the table.
          if (isEncounter(message.encounter)) {
            on.onRemoteState(message.encounter, message.clientId);
          }
          return;
        case "hello":
          return on.onHello(message.clientId);
        case "leave":
          return on.onLeave(message.clientId);
        case "presence":
          return on.onPresence(message.clientId, message.name);
        case "assignSheet":
          return on.onAssignSheet(message.participantId, message.clientId);
        case "callInitiative":
          return on.onCallInitiative(message.clientId);
        case "rollReport":
          return on.onRollReport(message.report, message.clientId);
        case "rollVerdict":
          return on.onRollVerdict(message.verdict, message.clientId);
        case "rollCall":
          return on.onRollCall(message.call, message.clientId);
        case "healingOffer":
          return on.onHealingOffer(message.offer, message.clientId);
        case "claimSheet":
          return on.onClaimSheet(message.participantId, message.clientId);
        case "sheet":
          return on.onSheet(message.participantId, message.character);
      }
    },
    // Announce ourselves; whoever is already here replies with the state.
    onReady: () => realm.publish({ kind: "hello", clientId }),
    onClosed: () => setCode(undefined),
  });

  const publish = realm.publish as (message: SessionMessage) => void;

  const connect = useCallback(
    async (sessionCode: string, create: boolean): Promise<JoinResult> => {
      const normalized = normalizeSessionCode(sessionCode);
      if (!isValidSessionCode(normalized)) {
        return realm.refuse("That doesn't look like a session code.");
      }
      const result = await realm.connect(realmForSession(normalized), {
        create,
      });
      if (!result.ok) return result;
      setCode(normalized);
      return { ok: true, code: normalized };
    },
    [realm.connect, realm.refuse],
  );

  // A code may be supplied to reopen a table that has gone quiet. Realms only
  // exist while somebody is connected, so last week's code is dead by this week
  // — and minting a new one every time meant the invite link a group pinned in
  // their chat was good for one evening. Reopening the same code is what makes
  // it durable: the uuid is still the authentication, and the DM who has it is
  // the person who ran the table.
  const host = useCallback(
    (existing?: string) => connect(existing ?? newSessionCode(), true),
    [connect],
  );

  const join = useCallback(
    (sessionCode: string) => connect(sessionCode, false),
    [connect],
  );

  const leave = useCallback(() => {
    publish({ kind: "leave", clientId });
    // Deliberately not closing the realm: in a party session there is no owner,
    // and one player going to bed must not end everyone else's fight. Empty
    // realms are swept by the sidecar after a long idle.
    realm.close();
    setCode(undefined);
  }, [publish, clientId, realm.close]);

  return {
    code,
    status: realm.status as SessionStatus,
    error: realm.error,
    host,
    join,
    leave,
    broadcastState: useCallback(
      (encounter: Encounter) => publish({ kind: "state", clientId, encounter }),
      [publish, clientId],
    ),
    announcePresence: useCallback(
      (name: string) => publish({ kind: "presence", clientId, name }),
      [publish, clientId],
    ),
    assignSheet: useCallback(
      (toClientId: string, participantId: string) =>
        publish({ kind: "assignSheet", clientId, toClientId, participantId }),
      [publish, clientId],
    ),
    sendCallInitiative: useCallback(
      () => publish({ kind: "callInitiative", clientId }),
      [publish, clientId],
    ),
    sendRollReport: useCallback(
      (report: RollReport) => publish({ kind: "rollReport", clientId, report }),
      [publish, clientId],
    ),
    sendRollVerdict: useCallback(
      (verdict: RollVerdict) =>
        publish({ kind: "rollVerdict", clientId, verdict }),
      [publish, clientId],
    ),
    sendRollCall: useCallback(
      (call: RollCall) => publish({ kind: "rollCall", clientId, call }),
      [publish, clientId],
    ),
    sendHealingOffer: useCallback(
      (offer: HealingOffer) =>
        publish({ kind: "healingOffer", clientId, offer }),
      [publish, clientId],
    ),
    requestSheet: useCallback(
      (participantId: string) =>
        publish({ kind: "claimSheet", clientId, participantId }),
      [publish, clientId],
    ),
    sendSheet: useCallback(
      (toClientId: string, participantId: string, character: unknown) =>
        publish({
          kind: "sheet",
          clientId,
          toClientId,
          participantId,
          character,
        }),
      [publish, clientId],
    ),
  };
}
