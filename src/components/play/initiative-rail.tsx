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
import StepperInput from "src/components/stepper-input";

// The order, the round, and the button that moves the fight along.
//
// Out of combat it's a setup strip — type in who's fighting and what they
// rolled. In combat it's the spine of the surface: whose turn it is, what round,
// and one button to advance. The same component either way, because a fight
// starting shouldn't move the controls a player was just using.
//
// The `dm` variant strips the per-participant lists: the DM board below owns
// the roster (initiative, adding monsters, removing the dead), and repeating
// every creature in two stacked lists with different controls was the single
// most confusing thing on the first draft of the DM view. What stays is what
// only the rail does — the round, whose turn it is, and advancing.

// The rail is the one part of the surface that works without a sheet — a DM
// runs the order, and a player waiting to be handed a character can still watch
// it. So it's `useCharacter()` rather than the narrowed hook: everything below
// that reads the character is about *your* row, and with no sheet you have none.
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
  // Shared with the player's "End turn": both move the same fight, and the
  // receipt below reports whichever boundary happened last.
  const { receipt, beginCombat, advance, stopCombat } = useTurnFlow();
  const [newName, setNewName] = useState("");
  const [newInitiative, setNewInitiative] = useState(10);
  const dmRail = variant === "dm";

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

  // Staged combatants stay off the players' rail — the ambush isn't sprung
  // yet. Anyone with the run-combat controls still sees them (the unclaimed
  // -seat fallback: if the DM vanishes mid-stage, the table can still find
  // the hidden rows rather than fighting ghosts).
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
            {/* The DM's spine says whose turn it is in words — their order
                lives on the board below, one row per creature, so the rail
                keeps only the sentence a table asks out loud. */}
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
            {/* The DM's roster edits live on the board rows; the player's
                setup strip is still where you and the table's other rows get
                their numbers typed in. */}
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
                    {/* Your own initiative is the one the app can actually roll —
                        it knows the modifier. Everyone else's is a number someone
                        called out across the table. With real dice the button
                        disappears: the stepper it sits next to *is* the entry. */}
                    {participant.id === self?.id && rollMode === "app" && (
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
            )}
            {dmRail && (
              <span className="rail-turn-callout text-muted">
                Out of combat — the order below keeps its numbers
              </span>
            )}
            {/* Adding and removing combatants belongs to whoever runs the
                table. With no DM seat claimed that's everybody — the rail keeps
                working for a table whose DM isn't in the app — but once someone
                is running the game, the roster is theirs. Your own initiative
                stays yours either way: you rolled it. */}
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
            {/* The pre-combat ritual, said the way a table says it. Rolls
                for every sheet this client brought and prompts everyone else
                to roll their own. */}
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

// The projection the party shares, filtered through the table's sharing
// policy. Shown for everyone but you (your own bar is right there in the
// vitals rail), in and out of combat alike — "how hurt is everyone" is a
// between-fights question as much as a mid-fight one. Exported for the
// target strip, which shows the same read on the same rows.
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
  // Death saves are the table's drama by default — everyone leans in when
  // someone is down — behind the DM's hide toggle for tables that keep it
  // private. Never shown when the sharing level hides vitals entirely.
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
