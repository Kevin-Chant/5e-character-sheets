import { useState } from "react";
import classNames from "classnames";
import { FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import { inInitiativeOrder, Participant } from "src/lib/play/encounter";
import StepperInput from "src/components/stepper-input";

// The DM's side of the play surface.
//
// A player asks "what can I do right now"; a DM asks "what is the state of
// eight creatures". Same encounter, opposite shape — so this is a roster of
// rows, not the action board with extra buttons. The rail above it still owns
// the order and the round; this board is where each creature gets managed:
// HP, conditions, concentration, and being removed when it dies.
//
// Writes here are ordinary encounter edits. For a row whose player is present,
// an HP edit travels to their actual sheet (see `receiveState.ownVitals`) —
// and their own next edit wins, because oversight is not custody.
export default function DmBoard() {
  const {
    encounter,
    inCombat,
    current,
    setCombatantVitals,
    removeCombatant,
    setSheetOffered,
    clientId,
  } = useEncounter();

  const order = inCombat
    ? encounter.participants
    : inInitiativeOrder(encounter.participants);

  if (order.length === 0) {
    return (
      <p className="play-no-sheet text-muted">
        Nobody is in the order yet. Add the party and their opposition above.
      </p>
    );
  }

  return (
    <div className="dm-board">
      <ul className="dm-roster">
        {order.map((participant) => (
          <li
            key={participant.id}
            className={classNames("dm-row", {
              active: inCombat && participant.id === current?.id,
            })}
          >
            <div className="dm-row-who">
              <span className="initiative-score">{participant.initiative}</span>
              <span className="dm-row-name">{participant.name}</span>
              {/* Offering is the deliberate per-sheet act that consents to the
                  whole sheet travelling — bringing it only showed a projection.
                  Once a player picks it up (ownership moves to their client)
                  the offer shows as in play; it reverts when they leave. */}
              {participant.characterUuid &&
                participant.ownerClientId === clientId &&
                (participant.claimable ? (
                  <button
                    type="button"
                    className="dm-offer-btn offered"
                    title="Withdraw the offer — the sheet stops being available to pick up"
                    onClick={() => setSheetOffered(participant.id, false)}
                  >
                    Offered
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dm-offer-btn"
                    title="Offer this sheet — a player without a character can pick it up and play it"
                    onClick={() => setSheetOffered(participant.id, true)}
                  >
                    Offer sheet
                  </button>
                ))}
              {participant.claimable &&
                participant.ownerClientId !== clientId && (
                  <span className="dm-in-play" title="A player picked this up">
                    In play
                  </span>
                )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${participant.name}`}
                title="Remove from the encounter"
                onClick={() => removeCombatant(participant.id)}
              >
                <FaXmark />
              </button>
            </div>
            <RowVitals
              participant={participant}
              onChange={(vitals) => setCombatantVitals(participant.id, vitals)}
            />
            <RowConditions participant={participant} />
            <RowConcentration participant={participant} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RowVitals({
  participant,
  onChange,
}: {
  participant: Participant;
  onChange: (vitals: { currHp: number; maxHp: number; ac: number }) => void;
}) {
  const [maxInput, setMaxInput] = useState("");
  const vitals = participant.vitals;

  // A hand-typed combatant has no sheet anywhere, so its HP starts existing the
  // moment the DM writes a maximum down — same as jotting it next to the name
  // on paper.
  if (!vitals) {
    return (
      <form
        className="dm-row-vitals"
        onSubmit={(e) => {
          e.preventDefault();
          const max = Number(maxInput);
          if (!(max > 0)) return;
          onChange({ currHp: max, maxHp: max, ac: 0 });
          setMaxInput("");
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          className="dm-hp-input"
          aria-label={`${participant.name} max HP`}
          placeholder="max HP"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
        />
        <button type="submit" disabled={!(Number(maxInput) > 0)}>
          Track
        </button>
      </form>
    );
  }

  return (
    <div className="dm-row-vitals">
      <StepperInput
        value={vitals.currHp}
        min={0}
        ariaLabel={`${participant.name} hit points`}
        onChange={(currHp) => onChange({ ...vitals, currHp })}
      />
      <span className="dm-hp-max">/ {vitals.maxHp}</span>
      {vitals.ac > 0 && <span className="dm-row-ac">AC {vitals.ac}</span>}
    </div>
  );
}

function RowConditions({ participant }: { participant: Participant }) {
  const { giveCondition, takeCondition } = useEncounter();
  const [rounds, setRounds] = useState("");
  const held = new Set(participant.conditions.map((c) => c.name));

  return (
    <div className="dm-row-conditions">
      {participant.conditions.map((condition) => (
        <span key={condition.name} className="condition-chip">
          <span>{condition.name}</span>
          {condition.rounds !== undefined && (
            <span className="condition-rounds">{condition.rounds}</span>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${condition.name} from ${participant.name}`}
            onClick={() => takeCondition(participant.id, condition.name)}
          >
            <FaXmark />
          </button>
        </span>
      ))}
      {/* The select applies immediately on choose — a DM does this a dozen
          times a night, and select-then-confirm doubles every one of them. The
          rounds box seeds the *next* pick, matching how the thought runs:
          "stunned for one round". */}
      <select
        aria-label={`Give ${participant.name} a condition`}
        value=""
        onChange={(e) => {
          if (!e.target.value) return;
          const parsed = Number(rounds);
          giveCondition(participant.id, {
            name: e.target.value,
            rounds: rounds.trim() && parsed > 0 ? parsed : undefined,
          });
          setRounds("");
        }}
      >
        <option value="">+ condition</option>
        {CONDITION_NAMES.filter((name) => !held.has(name)).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        className="condition-rounds-input"
        aria-label={`Rounds for the next condition on ${participant.name}`}
        placeholder="rds"
        value={rounds}
        onChange={(e) => setRounds(e.target.value)}
      />
    </div>
  );
}

function RowConcentration({ participant }: { participant: Participant }) {
  const { concentrateOn, encounter } = useEncounter();
  const [spell, setSpell] = useState("");

  if (participant.concentration) {
    return (
      <div className="dm-row-concentration">
        <span className="concentration-spell">
          {participant.concentration.spell}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${participant.name} drops concentration`}
          title="Drop concentration"
          onClick={() => concentrateOn(participant.id, undefined)}
        >
          <FaXmark />
        </button>
      </div>
    );
  }

  return (
    <form
      className="dm-row-concentration"
      onSubmit={(e) => {
        e.preventDefault();
        if (!spell.trim()) return;
        concentrateOn(participant.id, {
          spell: spell.trim(),
          startedRound: Math.max(1, encounter.round),
        });
        setSpell("");
      }}
    >
      <input
        type="text"
        aria-label={`${participant.name} concentrating on`}
        placeholder="concentration"
        value={spell}
        onChange={(e) => setSpell(e.target.value)}
      />
    </form>
  );
}
