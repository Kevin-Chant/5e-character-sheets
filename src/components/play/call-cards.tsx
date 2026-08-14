import { ReactNode, useState } from "react";
import classNames from "classnames";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { useRest } from "src/lib/hooks/use-rest";
import { useRoller } from "src/lib/hooks/use-roller";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { calculateCustomFormula } from "src/lib/formula";
import { getPB, modifier } from "src/lib/rules";
import { initiativeModifierFor } from "src/lib/play/initiative";
import { conditionSummary } from "src/lib/play/condition-mechanics";
import { checkLabel, checkModifier } from "src/lib/play/checks";
import { rollD20Check } from "src/lib/roll";
import { randomUUID } from "src/lib/browser";
import { Character } from "src/lib/types";

// Everything the table says to this player, as one stack of cards with one
// anatomy: eyebrow (who's speaking), the ask, the answer, and a receipt where
// the exchange has an afterlife. Tone = the app's semantic hues (accent: the
// DM, arcane: magic, crimson: your own peril, green: healing). Every card is
// advisory; every apply is the recipient's own write.

type CallTone = "ask" | "magic" | "life" | "gift";

function CallCard({
  tone,
  eyebrow,
  children,
  actions,
}: {
  tone: CallTone;
  eyebrow: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={classNames("table-call", tone)} role="group">
      <span className="table-call-eyebrow">{eyebrow}</span>
      <div className="table-call-body">{children}</div>
      {actions && <div className="table-call-actions">{actions}</div>}
    </div>
  );
}

// Pending calls, in the order they outrank each other: your own peril first,
// then the DM's asks, then offers.
export default function CallStack() {
  const { character } = useCharacter();
  const {
    isDm,
    self,
    claimables,
    claimSheet,
    pendingAssignment,
    acceptAssignment,
    declineAssignment,
    initiativeCalled,
    dismissInitiativeCall,
    setCombatantInitiative,
  } = useEncounter();

  // Assigning marks the sheet offered too; exclude it so the target isn't
  // shown the same sheet twice.
  const pickups = claimables.filter((c) => c.id !== pendingAssignment?.id);

  if (isDm) return null;
  return (
    <div className="table-calls">
      <ConcentrationCheckCard />
      {initiativeCalled && character && self && (
        <InitiativeCallCard
          character={character}
          selfId={self.id}
          setCombatantInitiative={setCombatantInitiative}
          dismiss={dismissInitiativeCall}
        />
      )}
      <RollCallCard />
      <RestCallCard />
      <IncomingHealingCard />
      <IncomingConditionCards />
      {/* Declining just closes this; the offer stays open on the DM's board. */}
      {pendingAssignment && (
        <CallCard
          tone="ask"
          eyebrow="Your DM"
          actions={
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={acceptAssignment}
              >
                Play {pendingAssignment.name}
              </button>
              <button type="button" onClick={declineAssignment}>
                Not now
              </button>
            </>
          }
        >
          <span>
            Hands you <strong>{pendingAssignment.name}</strong> to play.
          </span>
        </CallCard>
      )}
      {/* Open offers, only while you have no seat of your own. Claiming opens
          the sheet borrowed; nothing lands in local storage. */}
      {!character &&
        pickups.map((offered) => (
          <CallCard
            key={offered.id}
            tone="ask"
            eyebrow="Your DM"
            actions={
              <button
                type="button"
                className="btn-primary"
                onClick={() => claimSheet(offered.id)}
              >
                Play {offered.name}
              </button>
            }
          >
            <span>
              Offers <strong>{offered.name}</strong> to anyone at the table.
            </span>
          </CallCard>
        ))}
    </div>
  );
}

// App mode rolls with the sheet's modifier in one click; manual mode takes
// the d20 face (not the total) and adds the modifier, matching every other
// manual d20 prompt in the app. Both modes write straight to your row.
function InitiativeCallCard({
  character,
  selfId,
  setCombatantInitiative,
  dismiss,
}: {
  character: Character;
  selfId: string;
  setCombatantInitiative: (id: string, initiative: number) => void;
  dismiss: () => void;
}) {
  const { rollMode } = useRollMode();
  const { sendReport } = useTableTalk();
  const [raw, setRaw] = useState("");
  const initiativeModifier = initiativeModifierFor(character);
  const parsed = Number(raw);
  const valid =
    raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 20;
  // The answer the DM asked for, sent back as the roll it was — the row's
  // number alone can't say what the d20 showed or what was added to it.
  const reportInitiative = (face: number, total: number, manual?: true) =>
    sendReport({
      exchangeId: randomUUID(),
      stage: "roll",
      attempt: 1,
      label: "Initiative",
      total,
      faces: [face],
      kept: face,
      ...(manual ? { manual } : {}),
    });
  return (
    <CallCard
      tone="ask"
      eyebrow="Your DM"
      actions={
        <>
          {rollMode === "manual" ? (
            <form
              className="row roll-manual"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                const face = Math.floor(parsed);
                setCombatantInitiative(selfId, face + initiativeModifier);
                reportInitiative(face, face + initiativeModifier, true);
                dismiss();
              }}
            >
              <input
                type="text"
                inputMode="numeric"
                aria-label="What did the d20 show?"
                placeholder="What did the d20 show?"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={!valid}>
                Set ({initiativeModifier >= 0 ? "+" : ""}
                {initiativeModifier})
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const rolled = rollD20Check(initiativeModifier);
                setCombatantInitiative(selfId, rolled.total);
                reportInitiative(rolled.kept, rolled.total);
                dismiss();
              }}
            >
              Roll ({initiativeModifier >= 0 ? "+" : ""}
              {initiativeModifier})
            </button>
          )}
          <button type="button" onClick={dismiss}>
            Not now
          </button>
        </>
      }
    >
      <span>
        <strong>Roll initiative!</strong>
      </span>
    </CallCard>
  );
}

// A DM's roll call, opening the ordinary roll dialog against the call's own
// exchange id (so riders, advantage and real-dice mode all apply). Doesn't
// close on answering — `attemptBase` numbers a re-roll on from the last so
// both stay keyed to the same call.
function RollCallCard() {
  const { rollCall, dismissRollCall, sentChecks, verdicts } = useTableTalk();
  const { character } = useCharacter();
  const { openRoller } = useRoller();
  if (!rollCall || !character) return null;

  const label = checkLabel(rollCall.check);
  const mod = checkModifier(character, rollCall.check);
  const sent = sentChecks[rollCall.callId];
  const verdict = verdicts[rollCall.callId];
  return (
    <CallCard
      tone="ask"
      eyebrow="Your DM"
      actions={
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              openRoller({
                id: rollCall.callId,
                label,
                spec: {
                  kind: "check",
                  modifier: mod,
                  ...(rollCall.check.kind === "save" ? { save: true } : {}),
                },
                attemptBase: sent?.attempt ?? 0,
              })
            }
          >
            {sent ? "Roll again" : "Roll"} ({mod >= 0 ? "+" : ""}
            {mod})
          </button>
          <button type="button" onClick={dismissRollCall}>
            {sent ? "Done" : "Not now"}
          </button>
        </>
      }
    >
      <span>
        Asks for a <strong>{label}</strong>.
      </span>
      {sent && (
        <span className="table-call-receipt">
          You sent <strong>{sent.total}</strong>
          {sent.attempt > 1 ? ` (attempt ${sent.attempt})` : ""}.
          {verdict && (
            <>
              {" "}
              Your DM says:{" "}
              <strong>
                {verdict === "success"
                  ? "that's a success"
                  : verdict === "failure"
                    ? "that's not enough"
                    : verdict}
              </strong>
              .
            </>
          )}
        </span>
      )}
    </CallCard>
  );
}

// Invitation, not a remote write: opens the player's own rest panel with the
// table's rest kind pre-filled; the player still drives it.
function RestCallCard() {
  const { restCall, dismissRestCall } = useTableTalk();
  const { character } = useCharacter();
  const { openRest } = useRest();
  if (!restCall || !character) return null;

  const label = restCall.kind === "long" ? "long rest" : "short rest";
  return (
    <CallCard
      tone="ask"
      eyebrow="Your DM"
      actions={
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              openRest({ kind: restCall.kind, spansDawn: restCall.spansDawn });
              dismissRestCall();
            }}
          >
            Take it
          </button>
          <button type="button" onClick={dismissRestCall}>
            Not now
          </button>
        </>
      }
    >
      <span>
        Calls a <strong>{label}</strong>
        {restCall.spansDawn && <> — it spans dawn</>}.
      </span>
    </CallCard>
  );
}

// DM-approved healing offer; applying it is the recipient's own write.
function IncomingHealingCard() {
  const { incomingHealing, applyIncomingHealing, declineIncomingHealing } =
    useTableTalk();
  if (!incomingHealing) return null;
  return (
    <CallCard
      tone="gift"
      eyebrow={`From ${incomingHealing.fromName}`}
      actions={
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={applyIncomingHealing}
          >
            Apply +{incomingHealing.amount}
          </button>
          <button type="button" onClick={declineIncomingHealing}>
            Ignore
          </button>
        </>
      }
    >
      <span>
        <strong>{incomingHealing.amount} healing</strong>
        {incomingHealing.label ? <> — {incomingHealing.label}</> : null}.
      </span>
    </CallCard>
  );
}

// One card per pending condition offer (multiple can land in the same round);
// applying is the bearer's own write on their own row.
function IncomingConditionCards() {
  const {
    incomingConditions,
    applyIncomingCondition,
    declineIncomingCondition,
  } = useTableTalk();
  return (
    <>
      {incomingConditions.map((offer) => {
        const summary = conditionSummary(offer.condition.name);
        return (
          <CallCard
            key={offer.offerId}
            tone="magic"
            eyebrow={`From ${offer.fromName}`}
            actions={
              <>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => applyIncomingCondition(offer.offerId)}
                >
                  Apply {offer.condition.name}
                </button>
                <button
                  type="button"
                  onClick={() => declineIncomingCondition(offer.offerId)}
                >
                  Ignore
                </button>
              </>
            }
          >
            <span>
              Cast <strong>{offer.label ?? offer.condition.name}</strong> on you
              {summary ? <> — {summary}</> : null}.
            </span>
          </CallCard>
        );
      })}
    </>
  );
}

// Raised when the open character's HP drops while concentrating. The app
// offers the roll but takes the player's word on the outcome.
function ConcentrationCheckCard() {
  const { concentrationCheck, clearConcentrationCheck, self, concentrateOn } =
    useEncounter();
  const { character } = useCharacter();
  const { openRoller } = useRoller();
  if (!concentrationCheck || !character) return null;

  const saveBonus = character.savingThrowBonus
    ? calculateCustomFormula(character.savingThrowBonus, character)
    : 0;
  const conSave =
    modifier(character.stats.con) +
    (character.proficiencies.savingThrows.con ? getPB(character) : 0) +
    saveBonus;

  return (
    <CallCard
      tone="life"
      eyebrow="Concentration"
      actions={
        <>
          <button
            type="button"
            onClick={() =>
              openRoller({
                label: `Concentration save (DC ${concentrationCheck.dc})`,
                spec: { kind: "check", modifier: conSave, save: true },
              })
            }
          >
            Roll the save
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={clearConcentrationCheck}
          >
            Kept it
          </button>
          <button
            type="button"
            onClick={() => {
              if (self) concentrateOn(self.id, undefined);
              clearConcentrationCheck();
            }}
          >
            Lost it
          </button>
        </>
      }
    >
      <span>
        You took {concentrationCheck.damage} damage while concentrating on{" "}
        <strong>{concentrationCheck.spell}</strong> — Constitution save DC{" "}
        {concentrationCheck.dc}.
      </span>
    </CallCard>
  );
}
