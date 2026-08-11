import { useState } from "react";
import classNames from "classnames";
import { FaDiceD20, FaXmark } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  healthDescriptor,
  inInitiativeOrder,
  Participant,
  SharingLevel,
  vitalsVisibility,
} from "src/lib/play/encounter";
import { useTurnFlow } from "src/lib/play/use-turn-flow";
import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { rollD20Check } from "src/lib/roll";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { randomUUID } from "src/lib/browser";
import StepperInput from "src/components/stepper-input";

// Turn order, round counter, and the advance button. Out of combat it's a setup
// strip; in combat it's the turn spine. The `dm` variant hides per-participant
// lists (owned by the DM board below) and keeps only round/turn/advance.

// Uses `useCharacter()` rather than the narrowed hook: works without a loaded
// sheet (e.g. a DM with no character), since only the "your row" bits need one.
export default function InitiativeRail({
  variant = "player",
}: {
  variant?: "player" | "dm";
}) {
  const { character } = useCharacter();
  const {
    encounter,
    self,
    inCombat,
    current,
    addCombatant,
    removeCombatant,
    setCombatantInitiative,
    canRun,
    sharing,
    hideDeathSaves,
    callForInitiative,
    sessionStatus,
  } = useEncounter();
  const { rollMode } = useRollMode();
  const { sendReport } = useTableTalk();
  const { receipt, beginCombat, advance, stopCombat } = useTurnFlow();
  const [newName, setNewName] = useState("");
  const [newInitiative, setNewInitiative] = useState(10);
  const dmRail = variant === "dm";

  // Unset formula means "derive from DEX", not "no initiative".
  const initiativeFormula = character
    ? (character.initiativeFormula ??
      getOptionalInitializer(FIELD.initiativeFormula, undefined, character))
    : undefined;
  const initiativeModifier =
    character && initiativeFormula
      ? calculateCustomFormula(initiativeFormula, character)
      : 0;

  // Hidden combatants stay off the players' rail; anyone with run-combat controls sees them.
  const listed = canRun
    ? encounter.participants
    : encounter.participants.filter((p) => !p.hidden);
  const order = inCombat ? listed : inInitiativeOrder(listed);

  return (
    <div className={classNames("initiative-rail", { dm: dmRail })}>
      <div className="initiative-bar">
        {inCombat ? (
          <>
            <span className="round-counter">
              <span className="round-counter-label">Round</span>
              <span className="round-counter-value">{encounter.round}</span>
            </span>
            {dmRail ? (
              <span className="rail-turn-callout">
                {current ? `${current.name}'s turn` : ""}
              </span>
            ) : (
              <ol className="initiative-order">
                {order.map((participant) => (
                  <li
                    key={participant.id}
                    className={classNames("initiative-entry", {
                      active: participant.id === current?.id,
                      self: participant.id === self?.id,
                    })}
                    aria-current={
                      participant.id === current?.id ? "step" : undefined
                    }
                  >
                    <span className="initiative-score">
                      {participant.initiative}
                    </span>
                    <span className="initiative-name">{participant.name}</span>
                    <SharedVitals
                      participant={participant}
                      selfId={self?.id}
                      sharing={sharing}
                      showDeathSaves={!hideDeathSaves}
                    />
                    {participant.conditions.length > 0 && (
                      <span
                        className="initiative-conditions"
                        title={participant.conditions
                          .map((c) =>
                            c.rounds === undefined
                              ? c.name
                              : `${c.name} (${c.rounds})`,
                          )
                          .join(", ")}
                      >
                        {participant.conditions.length}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canRun && (
              <>
                <button type="button" className="btn-primary" onClick={advance}>
                  Next turn
                </button>
                <button
                  type="button"
                  className="turn-end-btn"
                  onClick={stopCombat}
                >
                  End combat
                </button>
              </>
            )}
          </>
        ) : (
          <>
            {!dmRail && (
              <ul className="initiative-setup">
                {order.map((participant) => (
                  <li key={participant.id} className="initiative-setup-entry">
                    <StepperInput
                      value={participant.initiative}
                      min={-10}
                      ariaLabel={`${participant.name} initiative`}
                      onChange={(value) =>
                        setCombatantInitiative(participant.id, value)
                      }
                    />
                    <span className="initiative-name">{participant.name}</span>
                    <SharedVitals
                      participant={participant}
                      selfId={self?.id}
                      sharing={sharing}
                      showDeathSaves={!hideDeathSaves}
                    />
                    {participant.id === self?.id && rollMode === "app" && (
                      <button
                        type="button"
                        className="icon-btn roll-btn"
                        aria-label="Roll initiative"
                        title={`Roll initiative (${initiativeModifier >= 0 ? "+" : ""}${initiativeModifier})`}
                        onClick={() => {
                          const rolled = rollD20Check(initiativeModifier);
                          setCombatantInitiative(participant.id, rolled.total);
                          sendReport({
                            exchangeId: randomUUID(),
                            stage: "roll",
                            attempt: 1,
                            label: "Initiative",
                            total: rolled.total,
                            faces: rolled.dice,
                            kept: rolled.kept,
                          });
                        }}
                      >
                        <FaDiceD20 />
                      </button>
                    )}
                    {participant.id !== self?.id && canRun && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${participant.name}`}
                        onClick={() => removeCombatant(participant.id)}
                      >
                        <FaXmark />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {dmRail && (
              <span className="rail-turn-callout text-muted">
                Out of combat — the order below keeps its numbers
              </span>
            )}
            {canRun && !dmRail && (
              <form
                className="initiative-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newName.trim()) return;
                  addCombatant(newName.trim(), newInitiative);
                  setNewName("");
                  setNewInitiative(10);
                }}
              >
                <input
                  type="text"
                  aria-label="Combatant name"
                  placeholder="Add combatant"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <StepperInput
                  value={newInitiative}
                  min={-10}
                  ariaLabel="New combatant initiative"
                  onChange={setNewInitiative}
                />
                <button type="submit" disabled={!newName.trim()}>
                  Add
                </button>
              </form>
            )}
            {dmRail && sessionStatus === "connected" && (
              <button type="button" onClick={callForInitiative}>
                Call for initiative
              </button>
            )}
            {canRun && (
              <button
                type="button"
                className="btn-primary"
                onClick={beginCombat}
                disabled={encounter.participants.length === 0}
              >
                Start combat
              </button>
            )}
          </>
        )}
      </div>
      {receipt && <p className="initiative-receipt">{receipt}</p>}
    </div>
  );
}

// Shared vitals for everyone but you, filtered through the table's sharing
// policy. Also used by the target strip.
export function SharedVitals({
  participant,
  selfId,
  sharing,
  showDeathSaves,
}: {
  participant: Participant;
  selfId?: string;
  sharing: SharingLevel;
  showDeathSaves: boolean;
}) {
  if (participant.id === selfId || !participant.vitals) return null;
  const visibility = vitalsVisibility(sharing, !!participant.characterUuid);
  if (visibility === "none") return null;
  const deathSaves =
    showDeathSaves && participant.vitals.deathSaves ? (
      <span
        className="initiative-death-saves"
        title="Death saving throws — successes · failures"
      >
        {participant.vitals.deathSaves.successes}✓{" "}
        {participant.vitals.deathSaves.failures}✗
      </span>
    ) : null;
  if (visibility === "exact") {
    return (
      <>
        <span
          className="initiative-hp"
          title={`${participant.vitals.currHp} of ${participant.vitals.maxHp} hit points, AC ${participant.vitals.ac}`}
        >
          {participant.vitals.currHp}/{participant.vitals.maxHp}
        </span>
        {deathSaves}
      </>
    );
  }
  const read = healthDescriptor(participant.vitals);
  return (
    <>
      <span className={`initiative-health ${read.toLowerCase()}`}>{read}</span>
      {deathSaves}
    </>
  );
}
