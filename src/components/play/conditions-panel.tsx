import { useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import { Participant } from "src/lib/play/encounter";

// Conditions and concentration on the open character.
//
// Both are transient facts about a fight rather than about a character, which is
// why neither is a `Character` field — that was a deliberate call long before
// this layer existed, and the encounter is the home it was waiting for.
//
// Nothing here changes a roll. A condition contributes an advisory note in the
// roll dialog (see `conditionRollNotes`) and the player presses advantage or
// disadvantage themselves — half the conditions are conditional on something the
// sheet can't see ("while the source of your fear is in sight").
export default function ConditionsPanel({ self }: { self: Participant }) {
  const { giveCondition, takeCondition, concentrateOn, encounter } =
    useEncounter();
  const [picking, setPicking] = useState("");
  const [rounds, setRounds] = useState("");

  const held = new Set(self.conditions.map((c) => c.name));
  const available = CONDITION_NAMES.filter((name) => !held.has(name));

  const apply = () => {
    if (!picking) return;
    const parsed = Number(rounds);
    giveCondition(self.id, {
      name: picking,
      // Blank means indefinite, which is most of them — a duration is the
      // exception, so it's opt-in rather than a field you have to clear.
      rounds: rounds.trim() && parsed > 0 ? parsed : undefined,
    });
    setPicking("");
    setRounds("");
  };

  return (
    <div className="conditions-panel">
      <h2 className="play-rail-heading">Conditions</h2>
      {self.conditions.length > 0 && (
        <ul className="condition-chips">
          {self.conditions.map((condition) => (
            <li key={condition.name} className="condition-chip">
              <span>{condition.name}</span>
              {condition.rounds !== undefined && (
                <span className="condition-rounds">{condition.rounds}</span>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${condition.name}`}
                onClick={() => takeCondition(self.id, condition.name)}
              >
                <FaXmark />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="condition-add">
        <select
          aria-label="Add a condition"
          value={picking}
          onChange={(e) => setPicking(e.target.value)}
        >
          <option value="">Add…</option>
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          className="condition-rounds-input"
          aria-label="Rounds (optional)"
          placeholder="rds"
          value={rounds}
          onChange={(e) => setRounds(e.target.value)}
        />
        <button type="button" disabled={!picking} onClick={apply}>
          Add
        </button>
      </div>

      <h2 className="play-rail-heading">Concentration</h2>
      {self.concentration ? (
        <div className="concentration-row">
          <span className="concentration-spell">
            {self.concentration.spell}
          </span>
          <span className="concentration-since">
            since round {self.concentration.startedRound}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Drop concentration"
            onClick={() => concentrateOn(self.id, undefined)}
          >
            <FaXmark />
          </button>
        </div>
      ) : (
        <ConcentrationInput
          onSet={(spell) =>
            concentrateOn(self.id, {
              spell,
              startedRound: Math.max(1, encounter.round),
            })
          }
        />
      )}
    </div>
  );
}

function ConcentrationInput({ onSet }: { onSet: (spell: string) => void }) {
  const [spell, setSpell] = useState("");
  return (
    <form
      className="concentration-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!spell.trim()) return;
        onSet(spell.trim());
        setSpell("");
      }}
    >
      <input
        type="text"
        aria-label="Concentrating on"
        placeholder="Not concentrating"
        value={spell}
        onChange={(e) => setSpell(e.target.value)}
      />
      <button type="submit" disabled={!spell.trim()}>
        Set
      </button>
    </form>
  );
}
