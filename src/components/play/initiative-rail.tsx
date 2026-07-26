import { useState } from "react";
import classNames from "classnames";
import { FaDiceD20, FaXmark } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { inInitiativeOrder } from "src/lib/play/encounter";
import { planTrigger, TriggerEvent } from "src/lib/play/triggers";
import { FIELD } from "src/lib/data/data-definitions";
import { calculateCustomFormula } from "src/lib/formula";
import { getOptionalInitializer } from "src/lib/rules";
import { rollD20Check } from "src/lib/roll";
import StepperInput from "src/components/stepper-input";

// The order, the round, and the button that moves the fight along.
//
// Out of combat it's a setup strip — type in who's fighting and what they
// rolled. In combat it's the spine of the surface: whose turn it is, what round,
// and one button to advance. The same component either way, because a fight
// starting shouldn't move the controls a player was just using.

// The rail is the one part of the surface that works without a sheet — a DM
// runs the order, and a player waiting to be handed a character can still watch
// it. So it's `useCharacter()` rather than the narrowed hook: everything below
// that reads the character is about *your* row, and with no sheet you have none.
export default function InitiativeRail() {
  const { character, dispatch } = useCharacter();
  const {
    encounter,
    self,
    inCombat,
    current,
    start,
    end,
    next,
    addCombatant,
    removeCombatant,
    setCombatantInitiative,
    canRun,
  } = useEncounter();
  const [newName, setNewName] = useState("");
  const [newInitiative, setNewInitiative] = useState(10);
  // What the last turn boundary did, shown until the next one replaces it.
  const [receipt, setReceipt] = useState<string | null>(null);

  // `initiativeFormula` is an optional override, so resolve it through the
  // initializer the way the sheet's Initiative box does — unset means "derive
  // it from DEX", not "no initiative".
  const initiativeFormula = character
    ? (character.initiativeFormula ??
      getOptionalInitializer(FIELD.initiativeFormula, undefined, character))
    : undefined;
  const initiativeModifier =
    character && initiativeFormula
      ? calculateCustomFormula(initiativeFormula, character)
      : 0;

  // Fire an event's recharges and describe what it restored. Auto-applied
  // rather than confirmed: these are deterministic (a pool goes back to full),
  // they undo in one step like any edit, and a confirmation dialog on every turn
  // boundary would cost more than the certainty is worth.
  const fireTrigger = (event: TriggerEvent): string[] => {
    // Recharges belong to a sheet. Running the order without one still starts
    // combat and still advances turns — there is simply nothing of yours to
    // restore.
    if (!character) return [];
    const plan = planTrigger(character, event);
    plan.updates.forEach((update) => dispatch(update));
    return plan.changes.map((change) => change.label);
  };

  const beginCombat = () => {
    start();
    const restored = fireTrigger("combatStart");
    setReceipt(restored.length ? `Regained: ${restored.join(", ")}` : null);
  };

  const advance = () => {
    const step = next();
    if (!step) return;
    const notes: string[] = [];
    if (step.expired.length) notes.push(`Ended: ${step.expired.join(", ")}`);
    // Start-of-turn recharges are this character's, so they only fire when the
    // turn that started is ours. Somebody else's turn beginning is not an event
    // on our sheet.
    if (step.active && step.active.id === self?.id) {
      const restored = fireTrigger("startOfTurn");
      if (restored.length) notes.push(`Regained: ${restored.join(", ")}`);
    }
    setReceipt(notes.length ? notes.join(" · ") : null);
  };

  const stopCombat = () => {
    end();
    setReceipt(null);
  };

  const order = inCombat
    ? encounter.participants
    : inInitiativeOrder(encounter.participants);

  return (
    <div className="initiative-rail">
      <div className="initiative-bar">
        {inCombat ? (
          <>
            <span className="round-counter">
              <span className="round-counter-label">Round</span>
              <span className="round-counter-value">{encounter.round}</span>
            </span>
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
                  {/* The projection the party shares. Shown for everyone but
                      you — your own bar is right there in the vitals rail, and
                      repeating it here would be the only duplicated number on
                      the surface. */}
                  {participant.id !== self?.id && participant.vitals && (
                    <span
                      className="initiative-hp"
                      title={`${participant.vitals.currHp} of ${participant.vitals.maxHp} hit points, AC ${participant.vitals.ac}`}
                    >
                      {participant.vitals.currHp}/{participant.vitals.maxHp}
                    </span>
                  )}
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
            {/* Gated by the DM seat when someone holds it — a UI gate, not a
                lock: the transport still accepts anyone's write, so a DM whose
                laptop sleeps can't strand the table. */}
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
                  {/* Your own initiative is the one the app can actually roll —
                      it knows the modifier. Everyone else's is a number someone
                      called out across the table. */}
                  {participant.id === self?.id && (
                    <button
                      type="button"
                      className="icon-btn roll-btn"
                      aria-label="Roll initiative"
                      title={`Roll initiative (${initiativeModifier >= 0 ? "+" : ""}${initiativeModifier})`}
                      onClick={() =>
                        setCombatantInitiative(
                          participant.id,
                          rollD20Check(initiativeModifier).total,
                        )
                      }
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
            {/* Adding and removing combatants belongs to whoever runs the
                table. With no DM seat claimed that's everybody — the rail keeps
                working for a table whose DM isn't in the app — but once someone
                is running the game, the roster is theirs. Your own initiative
                stays yours either way: you rolled it. */}
            {canRun && (
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
