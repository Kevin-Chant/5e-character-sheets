import React, { useCallback, useContext, useMemo, useState } from "react";
import { randomUUID } from "src/lib/browser";
import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { charPath, updateAt } from "src/lib/cursor";
import { Encounter } from "src/lib/play/encounter";
import { RollCallCheck } from "src/lib/play/checks";
import { HealingOffer, RollCall } from "src/lib/play/session";
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
  // not table state.
  lastTargetId?: string;
  rememberTarget: (targetId: string) => void;

  // --- Roll calls ---
  // "Give me a Perception check" — to everyone, or one present client.
  callForRoll: (check: RollCallCheck, toClientId?: string) => void;
  // A call addressed to (or including) this client, awaiting an answer.
  rollCall?: RollCall;
  dismissRollCall: () => void;

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
  offerHealing: NOOP,
  applyIncomingHealing: NOOP,
  declineIncomingHealing: NOOP,
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
}

// The handlers the transport calls, and the value the context carries.
export interface TableTalk {
  value: TableTalkData;
  onRollReport: (report: RollReport) => void;
  onRollVerdict: (verdict: RollVerdict) => void;
  onRollCall: (call: RollCall) => void;
  onHealingOffer: (offer: HealingOffer) => void;
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
  // Approved healing addressed to the open character, unanswered.
  const [incomingHealing, setIncomingHealing] = useState<
    HealingOffer | undefined
  >();

  const senders = React.useRef<TableTalkSenders>();
  const bind = useCallback((next: TableTalkSenders) => {
    senders.current = next;
  }, []);

  const reset = useCallback(() => {
    setReports([]);
    setVerdicts({});
    setLastTargetId(undefined);
    setRollCall(undefined);
    setIncomingHealing(undefined);
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

  const value = useMemo<TableTalkData>(
    () => ({
      // Publishing a roll is unconditional at the call site and gated here:
      // solo, with no DM, or *as* the DM there is nobody to tell, and a roll
      // surface shouldn't have to know that.
      sendReport: (roll) => {
        if (!reportsEnabled) return;
        const target = roll.targetId
          ? encounter.participants.find((p) => p.id === roll.targetId)
          : undefined;
        senders.current?.sendRollReport({
          ...roll,
          reportId: randomUUID(),
          fromClientId: clientId,
          fromName: displayName,
          total: Math.floor(roll.total),
          ...(target ? { targetName: target.name } : { targetId: undefined }),
        });
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
      incomingHealing,
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
    reset,
    bind,
  };
}
