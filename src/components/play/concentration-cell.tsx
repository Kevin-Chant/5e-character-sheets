import { useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { Participant } from "src/lib/play/encounter";

// What one participant is concentrating on, and how it ends. Shared by the
// player rail and the DM roster row.
export default function ConcentrationCell({
  participant,
  checkDc,
  onCheckResolved,
  showSince,
}: {
  participant: Participant;
  // Pending concentration check from damage that just landed.
  checkDc?: number;
  onCheckResolved?: () => void;
  // Round it started; shown in the rail, hidden in the denser roster row.
  showSince?: boolean;
}) {
  const { concentrateOn, encounter } = useEncounter();
  const [spell, setSpell] = useState("");

  if (participant.concentration) {
    return (
      <div className="concentration-cell">
        <span className="concentration-spell">
          {participant.concentration.spell}
        </span>
        {showSince && (
          <span className="concentration-since">
            since round {participant.concentration.startedRound}
          </span>
        )}
        {checkDc !== undefined ? (
          <span className="concentration-check">
            <span>CON DC {checkDc}</span>
            <button type="button" onClick={onCheckResolved}>
              Kept
            </button>
            <button
              type="button"
              onClick={() => {
                concentrateOn(participant.id, undefined);
                onCheckResolved?.();
              }}
            >
              Broke
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label={`${participant.name} drops concentration`}
            title="Drop concentration"
            onClick={() => concentrateOn(participant.id, undefined)}
          >
            <FaXmark />
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="concentration-cell"
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
      <button type="submit" disabled={!spell.trim()}>
        Set
      </button>
    </form>
  );
}
