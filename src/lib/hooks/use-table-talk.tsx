import React, { useCallback, useContext, useMemo, useState } from "react";
import { randomUUID } from "src/lib/browser";
import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { charPath, updateAt } from "src/lib/cursor";
import { Encounter } from "src/lib/play/encounter";
import { RollCallCheck } from "src/lib/play/checks";
import {
  ConditionOffer,
  conditionOffersFor,
  HealingOffer,
  RestCall,
  RollCall,
  rollCallReaches,
} from "src/lib/play/session";
import { RestKind } from "src/lib/rest";
import {
  OutgoingRoll,
  RollReport,
  RollVerdict,
  withoutExchange,
  withReport,
} from "src/lib/play/reports";
import { Action } from "src/lib/hooks/reducers/actions";
import { Character } from "src/lib/types";

// What the table says to each other (rolls, calls, rulings, offers), as
// opposed to what it agrees on (the encounter, a merged/versioned document).
// Each message describes a moment, is addressed, answered or ignored, and
// dies with the connection — never merged into shared state.
//
// Mounted by the encounter provider because that's where the transport is:
// the handlers below must be handed to `usePlaySession` at creation, before
// the senders exist. `bind` closes that loop, like `broadcastRef` does for
// state.

export interface TableTalkData {
  // --- Rolls at the table ---
  // A report, not a write — no-ops unless there's a table to report to, so
  // callers can wire it up unconditionally.
  sendReport: (roll: OutgoingRoll) => void;
  // Whether rolls here reach anyone (a session, with a DM, who isn't us).
  reportsEnabled: boolean;
  // Newest last; grouped into cards by `exchanges()`. Capped and cleared
  // with the connection.
  reports: RollReport[];
  dismissExchange: (exchangeId: string) => void;
  clearReports: () => void;
  ruleOnAttack: (
    exchangeId: string,
    toClientId: string,
    outcome: RollVerdict["outcome"],
  ) => void;
  // By exchange: the DM's own ruling on the board, the roller's own in the
  // roll dialog.
  verdicts: Record<string, RollVerdict["outcome"]>;
  // Who this client attacked last, so a repeat swing needs no re-pick. Local
  // only — settable before any attack too, and clearable with undefined.
  lastTargetId?: string;
  rememberTarget: (targetId?: string) => void;

  // --- Roll calls ---
  // Empty toClientIds means everyone; otherwise the named present clients
  // only (e.g. two rogues scouting ahead shouldn't tip off the rest).
  callForRoll: (check: RollCallCheck, toClientIds?: string[]) => void;
  rollCall?: RollCall;
  dismissRollCall: () => void;

  // --- Rest calls ---
  callForRest: (kind: RestKind, spansDawn?: boolean) => void;
  restCall?: RestCall;
  dismissRestCall: () => void;
  // This client's own sent check answers, by exchange id — self-echoes
  // never arrive via `reports`, so this is how a roll call prompt knows
  // what it already answered.
  sentChecks: Record<string, { total: number; attempt: number }>;

  // --- Healing ---
  offerHealing: (
    targetId: string,
    amount: number,
    fromName: string,
    label?: string,
  ) => void;
  incomingHealing?: HealingOffer;
  applyIncomingHealing: () => void;
  declineIncomingHealing: () => void;

  // --- Conditions ---
  // A small queue, not latest-wins — Bless and Shield of Faith landing the
  // same round is ordinary. Applying writes onto the player's own
  // participant row; the caster never touches it directly.
  incomingConditions: ConditionOffer[];
  applyIncomingCondition: (offerId: string) => void;
  declineIncomingCondition: (offerId: string) => void;
}

const NOOP = () => {};

// Real values rather than undefined — `RollModal` renders on the sheet too,
// with no provider decision made.
export const NO_TABLE_TALK: TableTalkData = {
  sendReport: NOOP,
  reportsEnabled: false,
  reports: [],
  dismissExchange: NOOP,
  clearReports: NOOP,
  ruleOnAttack: NOOP,
  verdicts: {},
  rememberTarget: NOOP,
  callForRoll: NOOP,
  dismissRollCall: NOOP,
  callForRest: NOOP,
  dismissRestCall: NOOP,
  sentChecks: {},
  offerHealing: NOOP,
  applyIncomingHealing: NOOP,
  declineIncomingHealing: NOOP,
  incomingConditions: [],
  applyIncomingCondition: NOOP,
  declineIncomingCondition: NOOP,
};

export const TableTalkContext =
  React.createContext<TableTalkData>(NO_TABLE_TALK);

export const useTableTalk = () => useContext(TableTalkContext);

export interface TableTalkSenders {
  sendRollReport: (report: RollReport) => void;
  sendRollVerdict: (verdict: RollVerdict) => void;
  sendRollCall: (call: RollCall) => void;
  sendRestCall: (call: RestCall) => void;
  sendHealingOffer: (offer: HealingOffer) => void;
  sendConditionOffer: (offer: ConditionOffer) => void;
}

interface TableTalkInput {
  clientId: string;
  displayName: string;
  connected: boolean;
  // Read for the DM seat and to resolve a target id into a name.
  encounter: Encounter;
  // For the one write this layer makes: applying offered healing to our
  // own character.
  character?: Character;
  dispatch: (action: Action) => void;
  selfParticipantId?: string;
  // Supplied by the encounter provider since the row is encounter state and
  // this layer owns no encounter writes of its own. Used only on accepting
  // an offer, for our own row.
  applyConditionTo: (
    participantId: string,
    condition: { name: string; rounds?: number; from?: string },
  ) => void;
}

// The handlers the transport calls, and the value the context carries.
export interface TableTalk {
  value: TableTalkData;
  onRollReport: (report: RollReport) => void;
  onRollVerdict: (verdict: RollVerdict) => void;
  onRollCall: (call: RollCall) => void;
  onRestCall: (call: RestCall) => void;
  onHealingOffer: (offer: HealingOffer) => void;
  onConditionOffer: (offer: ConditionOffer) => void;
  reset: () => void;
  bind: (senders: TableTalkSenders) => void;
}

export function useTableTalkState({
  clientId,
  displayName,
  connected,
  encounter,
  character,
  dispatch,
  selfParticipantId,
  applyConditionTo,
}: TableTalkInput): TableTalk {
  // Received by everyone; only the DM board renders it.
  const [reports, setReports] = useState<RollReport[]>([]);
  const [verdicts, setVerdicts] = useState<
    Record<string, RollVerdict["outcome"]>
  >({});
  const [lastTargetId, setLastTargetId] = useState<string | undefined>();
  const [rollCall, setRollCall] = useState<RollCall | undefined>();
  const [restCall, setRestCall] = useState<RestCall | undefined>();
  const [sentChecks, setSentChecks] = useState<
    Record<string, { total: number; attempt: number }>
  >({});
  const [incomingHealing, setIncomingHealing] = useState<
    HealingOffer | undefined
  >();
  // offerId is deterministic per (exchange, stage, target), so a re-rolled
  // damage report re-offering the same condition dedupes rather than
  // prompting twice. Capped like every unattended queue.
  const [incomingConditions, setIncomingConditions] = useState<
    ConditionOffer[]
  >([]);
  const enqueueCondition = useCallback((offer: ConditionOffer) => {
    setIncomingConditions((current) =>
      current.some((o) => o.offerId === offer.offerId)
        ? current
        : [...current, offer].slice(-8),
    );
  }, []);

  const senders = React.useRef<TableTalkSenders>();
  const bind = useCallback((next: TableTalkSenders) => {
    senders.current = next;
  }, []);

  const reset = useCallback(() => {
    setReports([]);
    setVerdicts({});
    setLastTargetId(undefined);
    setRollCall(undefined);
    setRestCall(undefined);
    setSentChecks({});
    setIncomingHealing(undefined);
    setIncomingConditions([]);
  }, []);

  const onRollReport = useCallback(
    (report: RollReport) =>
      setReports((current) => withReport(current, report)),
    [],
  );
  // Kept only by the client it was addressed to, though everyone hears it.
  const onRollVerdict = useCallback(
    (verdict: RollVerdict) => {
      if (verdict.toClientId !== clientId) return;
      setVerdicts((current) => ({
        ...current,
        [verdict.exchangeId]: verdict.outcome,
      }));
    },
    [clientId],
  );
  // Kept only if addressed to this client (or the whole table). Latest ask
  // wins, since a table answers one question at a time.
  const onRollCall = useCallback(
    (call: RollCall) => {
      if (!rollCallReaches(call, clientId)) return;
      setRollCall(call);
    },
    [clientId],
  );
  // Never addressed, always whole-table; latest wins, same as roll calls.
  const onRestCall = useCallback((call: RestCall) => setRestCall(call), []);

  const reportsEnabled =
    connected && !!encounter.dmClientId && encounter.dmClientId !== clientId;

  const onHealingOffer = useCallback(
    (offer: HealingOffer) => {
      if (!selfParticipantId || selfParticipantId !== offer.targetId) return;
      setIncomingHealing(offer);
    },
    [selfParticipantId],
  );
  const onConditionOffer = useCallback(
    (offer: ConditionOffer) => {
      if (!selfParticipantId || selfParticipantId !== offer.targetId) return;
      enqueueCondition(offer);
    },
    [selfParticipantId, enqueueCondition],
  );

  const value = useMemo<TableTalkData>(
    () => ({
      sendReport: (roll) => {
        if (!reportsEnabled) return;
        // Own check answers need to be readable back (self-echoes never
        // arrive) — the roll-call prompt uses this.
        if (roll.stage === "check")
          setSentChecks((current) => ({
            ...current,
            [roll.exchangeId]: {
              total: Math.floor(roll.total),
              attempt: roll.attempt,
            },
          }));
        const named = (id: string) =>
          encounter.participants.find((p) => p.id === id);
        const target = roll.targetId ? named(roll.targetId) : undefined;
        // Multi-target (save-based effects): unknown ids drop, names travel
        // index-aligned.
        const knownIds = (roll.targetIds ?? []).filter((id) => named(id));
        senders.current?.sendRollReport({
          ...roll,
          reportId: randomUUID(),
          fromClientId: clientId,
          fromName: displayName,
          // Records which row placed a carried condition.
          ...(selfParticipantId
            ? { fromParticipantId: selfParticipantId }
            : {}),
          total: Math.floor(roll.total),
          ...(target ? { targetName: target.name } : { targetId: undefined }),
          ...(knownIds.length
            ? {
                targetIds: knownIds,
                targetNames: knownIds.map((id) => named(id)!.name),
              }
            : { targetIds: undefined, targetNames: undefined }),
        });
        // One consent prompt per character-backed target. Our own row can't
        // hear its own broadcast, so it's enqueued locally instead — even a
        // self-cast Bless prompts you. Sheet-less rows get nothing; the DM
        // applies those from the exchange card.
        conditionOffersFor(
          roll,
          encounter.participants,
          selfParticipantId,
          displayName,
          roll.label,
        ).forEach(({ offer, toSelf }) =>
          toSelf
            ? enqueueCondition(offer)
            : senders.current?.sendConditionOffer(offer),
        );
      },
      reportsEnabled,
      reports,
      // Retires the ruling and our answer along with the exchange —
      // otherwise `verdicts`/`sentChecks` only grow until disconnect.
      dismissExchange: (exchangeId) => {
        setReports((current) => withoutExchange(current, exchangeId));
        setVerdicts(({ [exchangeId]: _, ...rest }) => rest);
        setSentChecks(({ [exchangeId]: _, ...rest }) => rest);
      },
      clearReports: () => {
        setReports([]);
        setVerdicts({});
        setSentChecks({});
      },
      ruleOnAttack: (exchangeId, toClientId, outcome) => {
        setVerdicts((current) => ({ ...current, [exchangeId]: outcome }));
        senders.current?.sendRollVerdict({ exchangeId, toClientId, outcome });
      },
      verdicts,
      lastTargetId,
      rememberTarget: setLastTargetId,

      callForRoll: (check, toClientIds) =>
        senders.current?.sendRollCall({
          callId: randomUUID(),
          check,
          ...(toClientIds?.length
            ? {
                toClientIds,
                // For older builds only — see `RollCall`.
                ...(toClientIds.length === 1
                  ? { toClientId: toClientIds[0] }
                  : {}),
              }
            : {}),
        }),
      rollCall,
      // Doesn't clear on answering — stays until dismissed or replaced.
      dismissRollCall: () => setRollCall(undefined),
      sentChecks,

      callForRest: (kind, spansDawn) =>
        senders.current?.sendRestCall({
          callId: randomUUID(),
          kind,
          ...(spansDawn ? { spansDawn: true } : {}),
        }),
      restCall,
      dismissRestCall: () => setRestCall(undefined),

      offerHealing: (targetId, amount, fromName, label) => {
        if (!(amount > 0)) return;
        senders.current?.sendHealingOffer({
          offerId: randomUUID(),
          targetId,
          amount: Math.floor(amount),
          fromName,
          ...(label ? { label } : {}),
        });
      },
      incomingConditions,
      applyIncomingCondition: (offerId) => {
        const offer = incomingConditions.find((o) => o.offerId === offerId);
        if (offer && selfParticipantId)
          applyConditionTo(selfParticipantId, {
            ...offer.condition,
            ...(offer.fromParticipantId
              ? { from: offer.fromParticipantId }
              : {}),
          });
        setIncomingConditions((current) =>
          current.filter((o) => o.offerId !== offerId),
        );
      },
      declineIncomingCondition: (offerId) =>
        setIncomingConditions((current) =>
          current.filter((o) => o.offerId !== offerId),
        ),

      incomingHealing,
      applyIncomingHealing: () => {
        if (incomingHealing && character) {
          const maxHpFormula =
            character.maxHp ??
            getOptionalInitializer(FIELD.maxHp, undefined, character);
          const max = maxHpFormula
            ? calculateCustomFormula(maxHpFormula, character)
            : 0;
          const healed = character.currHp + incomingHealing.amount;
          dispatch(
            updateAt(
              charPath(FIELD.currHp),
              max > 0 ? Math.min(max, healed) : healed,
            ),
          );
        }
        setIncomingHealing(undefined);
      },
      declineIncomingHealing: () => setIncomingHealing(undefined),
    }),
    [
      reportsEnabled,
      reports,
      verdicts,
      lastTargetId,
      rollCall,
      restCall,
      sentChecks,
      incomingHealing,
      incomingConditions,
      selfParticipantId,
      applyConditionTo,
      enqueueCondition,
      encounter,
      character,
      clientId,
      displayName,
      dispatch,
    ],
  );

  return {
    value,
    onRollReport,
    onRollVerdict,
    onRollCall,
    onRestCall,
    onHealingOffer,
    onConditionOffer,
    reset,
    bind,
  };
}
