import { Participant } from "src/lib/play/encounter";
import ConditionsControl from "./conditions-control";
import ConcentrationCell from "./concentration-cell";

// Conditions and concentration on the open character. Both live on the
// encounter, not on Character, since they're facts about the fight.
// Conditions only add an advisory note in the roll dialog (conditionRollNotes)
// — the player still applies advantage/disadvantage themselves.
export default function ConditionsPanel({ self }: { self: Participant }) {
  return (
    <div className="conditions-panel">
      <h2 className="play-rail-heading">Conditions</h2>
      <div className="condition-chips">
        <ConditionsControl participant={self} />
      </div>

      <h2 className="play-rail-heading">Concentration</h2>
      {/* Pending checks show as a banner on the board, not here — this is steady-state only. */}
      <ConcentrationCell participant={self} showSince />
    </div>
  );
}
