import { Participant } from "src/lib/play/encounter";
import ConditionsControl from "./conditions-control";
import ConcentrationCell from "./concentration-cell";

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
//
// The controls themselves are shared with the DM's roster row: this panel is the
// heading and the layout, not a second implementation of either.
export default function ConditionsPanel({ self }: { self: Participant }) {
  return (
    <div className="conditions-panel">
      <h2 className="play-rail-heading">Conditions</h2>
      <div className="condition-chips">
        <ConditionsControl participant={self} />
      </div>

      <h2 className="play-rail-heading">Concentration</h2>
      {/* A pending check reaches the player as a banner on the board rather
          than here — it's a prompt that should interrupt, not a cell to notice.
          So this cell is the steady state only. */}
      <ConcentrationCell participant={self} showSince />
    </div>
  );
}
