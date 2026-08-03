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
  RollCall,
} from "src/lib/play/session";
import {
  OutgoingRoll,
  RollReport,
  RollVerdict,
  withoutExchange,
  withReport,
} from "src/lib/play/reports";
import { Action } from "src/lib/hooks/reducers/actions";
import { Character } from "src/lib/types";

// What the table *says* to each other, as opposed to what it agrees on.
//
// The encounter is a shared document: merged, versioned, persisted, argued over
// by `mergeEncounter`. None of that applies to any of this. A rolled 17, a
// "give me a Perception check", a ruling of "that hits", an offer of 8 healing
// — each describes a moment rather than a state, is addressed to somebody, is
// answered or ignored, and is gone when the connection is. Putting them on the
// shared document would mean merging liveness by revision, which is the same
// category error `PresentClient` avoids.
//
// They lived in the encounter provider because that is where the transport is,
// and it grew to a thousand lines behind a sixty-eight member context as a
// result. The split is by lifetime, not by feature: everything here is born
// from an arriving message and dies with the socket, so it can be lifted whole
// and given an explicit input contract.
//
// It is still *mounted* by the encounter provider, because the handlers below
// have to be handed to `usePlaySession` at creation and the senders only exist
// afterwards. `bind` closes that loop, the same way `broadcastRef` does for
// state.

export interface TableTalkData {
  // --- Rolls at the table ---
  // Publish a roll as it lands. A report, not a write: the HP change happens
  // on the DM's side, or not at all. No-ops unless there is a table to report
  // to, so callers can wire it up unconditionally.
  sendReport: (roll: OutgoingRoll) => void;
  // Whether rolls made here reach anyone — a session, with a DM, who isn't
  // us. The roll dialog uses it to decide whether to ask for a target.
  reportsEnabled: boolean;
  // Every roll the table has made, newest last (the seat holder's queue).
  // Grouped into cards by `exchanges()`; capped and cleared with the
  // connection, because these describe events, not state.
  reports: RollReport[];
  dismissExchange: (exchangeId: string) => void;
  clearReports: () => void;
  // The DM's answer to a to-hit roll — "that hits" — sent back to the roller
  // and remembered here so the card shows what was said.
  ruleOnAttack: (
    exchangeId: string,
    toClientId: string,
    outcome: RollVerdict["outcome"],
  ) => void;
  // Rulings, by exchange: the DM's own on the board, the roller's own in the
  // roll dialog.
  verdicts: Record<string, RollVerdict["outcome"]>;
  // Who this client attacked last, so a second swing at the same goblin needs
  // no second pick. Local to the browser — a target is a choice in progress,
  // not table state. Also settable *before* any attack (the play surface's
  // target strip), and clearable with undefined.
  lastTargetId?: string;
  rememberTarget: (targetId?: string) => void;

  // --- Roll calls ---
  // "Give me a Perception check" — to everyone, or one present client.
  callForRoll: (check: RollCallCheck, toClientId?: string) => void;
  // A call addressed to (or including) this client, awaiting an answer.
  rollCall?: RollCall;
  dismissRollCall: () => void;
  // The check answers *this* client has sent, by exchange id. The broker drops
  // self-echoes, so a sender's own rolls never come back through `reports` —
  // this is how the roll-call prompt knows what it already answered (and where
  // the next dialog's attempt numbering should start).
  sentChecks: Record<string, { total: number; attempt: number }>;

  // --- Healing ---
  // The DM approved a healing report at a character-backed row: offer it to
  // whoever owns that character, who applies it themselves.
  offerHealing: (
    targetId: string,
    amount: number,
    fromName: string,
    label?: string,
  ) => void;
  // Healing addressed to the open character, waiting on the player.
  incomingHealing?: HealingOffer;
  applyIncomingHealing: () => void;
  declineIncomingHealing: () => void;

  // --- Conditions ---
  // "Ellora cast Bless on you." Conditions addressed to the open character,
  // waiting on the player — a small queue rather than latest-wins, because
  // Bless and Shield of Faith landing the same round is ordinary. Applying
  // writes the condition onto the player's *own* participant row (their
  // lane, their write); the caster never touches the row directly.
  incomingConditions: ConditionOffer[];
  applyIncomingCondition: (offerId: string) => void;
  declineIncomingCondition: (offerId: string) => void;
}

const NOOP = () => {};

// Solo, or on the sheet with no provider decision made. Real values rather than
// undefined, for the same reason the encounter's default is a real empty
// encounter: `RollModal` renders on the sheet too, and a hook that can return
// undefined pushes that check into every caller.
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

// The senders this layer needs, handed over once the transport exists.
export interface TableTalkSenders {
  sendRollReport: (report: RollReport) => void;
  sendRollVerdict: (verdict: RollVerdict) => void;
  sendRollCall: (call: RollCall) => void;
  sendHealingOffer: (offer: HealingOffer) => void;
  sendConditionOffer: (offer: ConditionOffer) => void;
}

interface TableTalkInput {
  clientId: string;
  // What the table calls us — the name on every report we send.
  displayName: string;
  connected: boolean;
  // Read for the DM seat (is there anyone to report to?) and to resolve a
  // target id into the name the DM reads.
  encounter: Encounter;
  // The open sheet, for the one thing here that writes: applying healing
  // somebody else offered, onto our own character.
  character?: Character;
  dispatch: (action: Action) => void;
  // The participant standing in for the open character, so an offer addressed
  // to that row can be recognised as ours.
  selfParticipantId?: string;
  // Write a condition onto a participant row — supplied by the encounter
  // provider (the row is encounter state, and this layer owns no encounter
  // writes of its own). Used only for the *own* row, on accepting an offer.
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
  onHealingOffer: (offer: HealingOffer) => void;
  onConditionOffer: (offer: ConditionOffer) => void;
  // Everything above describes a connection; a new one starts empty.
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
  // Everyone receives every report; only the DM board renders the queue, so
  // for everyone else this is a small, capped list that clears with the
  // connection.
  const [reports, setReports] = useState<RollReport[]>([]);
  // Rulings by exchange — what the DM said about a to-hit roll. Kept on both
  // sides: the board shows its own answer, the roller's dialog shows theirs.
  const [verdicts, setVerdicts] = useState<
    Record<string, RollVerdict["outcome"]>
  >({});
  const [lastTargetId, setLastTargetId] = useState<string | undefined>();
  // The DM asked this client (or everyone) for a d20, unanswered.
  const [rollCall, setRollCall] = useState<RollCall | undefined>();
  // Our own answers, by exchange — see `TableTalkData.sentChecks`.
  const [sentChecks, setSentChecks] = useState<
    Record<string, { total: number; attempt: number }>
  >({});
  // Approved healing addressed to the open character, unanswered.
  const [incomingHealing, setIncomingHealing] = useState<
    HealingOffer | undefined
  >();
  // Cast conditions addressed to the open character, unanswered. Deduped by
  // offerId — the id is deterministic per (exchange, stage, target), so a
  // re-rolled damage report re-offering the same condition is a repeat, not
  // a second prompt — and capped, like every queue nobody has to clear.
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
    setSentChecks({});
    setIncomingHealing(undefined);
    setIncomingConditions([]);
  }, []);

  const onRollReport = useCallback(
    (report: RollReport) =>
      setReports((current) => withReport(current, report)),
    [],
  );
  // A ruling from the seat. Kept only by the client it was addressed to —
  // everyone hears it, the same as every other message on this broker.
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
  // A roll call lands on everyone; each client keeps it only if it's addressed
  // to them (or to the whole table). Latest ask wins — a table answers one
  // question at a time.
  const onRollCall = useCallback(
    (call: RollCall) => {
      if (call.toClientId && call.toClientId !== clientId) return;
      setRollCall(call);
    },
    [clientId],
  );

  // A roll only has somewhere to go when there's a table, someone running it,
  // and it isn't us. Derived once so both the gate in `sendReport` and the roll
  // dialog's target picker read the same fact.
  const reportsEnabled =
    connected && !!encounter.dmClientId && encounter.dmClientId !== clientId;

  // Approved healing looking for its recipient: keep it only if the target
  // participant is the character open in this browser.
  const onHealingOffer = useCallback(
    (offer: HealingOffer) => {
      if (!selfParticipantId || selfParticipantId !== offer.targetId) return;
      setIncomingHealing(offer);
    },
    [selfParticipantId],
  );
  // A cast condition looking for consent: same addressing rule as healing.
  const onConditionOffer = useCallback(
    (offer: ConditionOffer) => {
      if (!selfParticipantId || selfParticipantId !== offer.targetId) return;
      enqueueCondition(offer);
    },
    [selfParticipantId, enqueueCondition],
  );

  const value = useMemo<TableTalkData>(
    () => ({
      // Publishing a roll is unconditional at the call site and gated here:
      // solo, with no DM, or *as* the DM there is nobody to tell, and a roll
      // surface shouldn't have to know that.
      sendReport: (roll) => {
        if (!reportsEnabled) return;
        // Remember our own check answers — the one stage another surface (the
        // roll-call prompt) needs to read back, since self-echoes never
        // arrive.
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
        // Multi-target (a save-based effect): unknown ids are dropped the way
        // an unknown single target is, and the names travel index-aligned.
        const knownIds = (roll.targetIds ?? []).filter((id) => named(id));
        senders.current?.sendRollReport({
          ...roll,
          reportId: randomUUID(),
          fromClientId: clientId,
          fromName: displayName,
          // A mark's provenance: whoever applies the carried condition
          // records which row placed it.
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
        // A condition-carrying report also implies consent prompts: one per
        // character-backed target. Our own row can't hear its own broadcast
        // (the envelope drops self-echoes), so that one is enqueued locally —
        // casting Bless on yourself prompts you like anyone else. Sheet-less
        // rows get nothing; the DM applies those from the exchange card.
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
      dismissExchange: (exchangeId) =>
        setReports((current) => withoutExchange(current, exchangeId)),
      clearReports: () => setReports([]),
      ruleOnAttack: (exchangeId, toClientId, outcome) => {
        setVerdicts((current) => ({ ...current, [exchangeId]: outcome }));
        senders.current?.sendRollVerdict({ exchangeId, toClientId, outcome });
      },
      verdicts,
      lastTargetId,
      rememberTarget: setLastTargetId,

      callForRoll: (check, toClientId) =>
        senders.current?.sendRollCall({
          callId: randomUUID(),
          check,
          toClientId,
        }),
      rollCall,
      // Deliberately doesn't clear on answering — the prompt keeps showing what
      // was sent until the player dismisses it (or the next call replaces it).
      dismissRollCall: () => setRollCall(undefined),
      sentChecks,

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
      // The bearer's write, on their own row — the caster never touches it.
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
      // The recipient's write, on their own sheet — which is the whole point
      // of routing healing as an offer rather than a vitals edit.
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
    onHealingOffer,
    onConditionOffer,
    reset,
    bind,
  };
}
