import { useCallback, useRef, useState } from "react";
import { Encounter } from "src/lib/play/encounter";
import {
  ConditionOffer,
  HealingOffer,
  isEncounter,
  isValidSessionCode,
  newSessionCode,
  normalizeSessionCode,
  realmForSession,
  RestCall,
  RollCall,
  SessionMessage,
  TOPIC_FOR,
} from "src/lib/play/session";
import { RollReport, RollVerdict } from "src/lib/play/reports";
import { RealmResult, useRealm } from "src/lib/realm/use-realm";

// The party session's message protocol; sockets/subscriptions/versioning
// live in `useRealm`, decisions about the messages live in `play/session.ts`.

export type SessionStatus = "offline" | "connecting" | "connected" | "error";

// Joining resolves with the code that was joined, since a host doesn't know
// it until the transport mints it.
export type JoinResult =
  | Extract<RealmResult, { ok: false }>
  | {
      ok: true;
      code: string;
    };

interface PlaySessionOptions {
  clientId: string;
  onRemoteState: (encounter: Encounter, fromClientId: string) => void;
  onSyncRequest: (fromClientId: string, requestId: string) => void;
  onSyncResponse: (encounter: Encounter, requestId: string) => void;
  onLeave: (fromClientId: string) => void;
  // Names only — liveness is best-effort, fine for a dropdown, wrong for a lock.
  onPresence: (fromClientId: string, name: string) => void;
  // Any message counts as a heartbeat — a backgrounded phone throttles
  // timers to about once a minute, but a tap-triggered publish is immediate.
  onPeerHeard: (fromClientId: string) => void;
  // Addressed — the envelope has already dropped copies meant for others.
  onAssignSheet: (participantId: string, fromClientId: string) => void;
  onCallInitiative: (fromClientId: string) => void;
  onRollReport: (report: RollReport, fromClientId: string) => void;
  onRollVerdict: (verdict: RollVerdict, fromClientId: string) => void;
  onRollCall: (call: RollCall, fromClientId: string) => void;
  onRestCall: (call: RestCall, fromClientId: string) => void;
  onHealingOffer: (offer: HealingOffer, fromClientId: string) => void;
  onConditionOffer: (offer: ConditionOffer, fromClientId: string) => void;
  onClaimSheet: (participantId: string, fromClientId: string) => void;
  onSheet: (participantId: string, character: unknown) => void;
}

export function usePlaySession(options: PlaySessionOptions) {
  const { clientId } = options;
  const [code, setCode] = useState<string | undefined>();
  // Ref so the once-registered subscription always calls the current closure.
  const handlers = useRef(options);
  handlers.current = options;

  const realm = useRealm<SessionMessage["kind"]>({
    clientId,
    topics: TOPIC_FOR,
    // The envelope has already dropped self-echo, unknown kinds, future
    // versions and anything addressed elsewhere.
    onMessage: (raw) => {
      const message = raw as SessionMessage;
      const on = handlers.current;
      on.onPeerHeard(message.clientId);
      switch (message.kind) {
        case "state":
          // Guard against a peer on a different build sending something
          // that isn't an encounter, which would otherwise throw here.
          if (isEncounter(message.encounter)) {
            on.onRemoteState(message.encounter, message.clientId);
          }
          return;
        case "syncRequest":
          return on.onSyncRequest(message.clientId, message.requestId);
        case "syncResponse":
          if (isEncounter(message.encounter)) {
            on.onSyncResponse(message.encounter, message.requestId);
          }
          return;
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
        case "restCall":
          return on.onRestCall(message.call, message.clientId);
        case "healingOffer":
          return on.onHealingOffer(message.offer, message.clientId);
        case "conditionOffer":
          return on.onConditionOffer(message.offer, message.clientId);
        case "claimSheet":
          return on.onClaimSheet(message.participantId, message.clientId);
        case "sheet":
          return on.onSheet(message.participantId, message.character);
      }
    },
    onClosed: () => setCode(undefined),
    // `state`, `presence`, `leave`, and sync request/response all supersede
    // or self-expire, so replaying a stale one is wrong or pointless.
    // Everything else (roll, ruling, ask, offer, claim) has no other copy,
    // so it's held and replayed instead of dropped.
    queueWhileOffline: (kind) =>
      kind !== "state" &&
      kind !== "presence" &&
      kind !== "leave" &&
      kind !== "syncRequest" &&
      kind !== "syncResponse",
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

  // Realms only exist while somebody is connected, so an existing code can
  // be passed to reopen a table rather than always minting a new one — the
  // uuid itself is the authentication.
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
    // Not closing the realm: no owner in a party session, so one player
    // leaving mustn't end the fight for everyone else. Idle realms are
    // swept by the sidecar.
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
    // Published by the provider once connecting resolves, not by the
    // transport on open — handling the answer (or its absence) is a
    // decision that lives outside this file.
    sendSyncRequest: useCallback(
      (requestId: string) =>
        publish({ kind: "syncRequest", clientId, requestId }),
      [publish, clientId],
    ),
    sendSyncResponse: useCallback(
      (toClientId: string, requestId: string, encounter: Encounter) =>
        publish({
          kind: "syncResponse",
          clientId,
          toClientId,
          requestId,
          encounter,
        }),
      [publish, clientId],
    ),
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
    sendRestCall: useCallback(
      (call: RestCall) => publish({ kind: "restCall", clientId, call }),
      [publish, clientId],
    ),
    sendHealingOffer: useCallback(
      (offer: HealingOffer) =>
        publish({ kind: "healingOffer", clientId, offer }),
      [publish, clientId],
    ),
    sendConditionOffer: useCallback(
      (offer: ConditionOffer) =>
        publish({ kind: "conditionOffer", clientId, offer }),
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
