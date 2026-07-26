import classNames from "classnames";
import {
  ECONOMY_SLOTS,
  ECONOMY_SLOT_LABELS,
  PlayTurn,
} from "src/lib/play/use-turn";

// The three things a turn spends, as slots that empty as you use them.
//
// This is the one thing paper can't do — the sheet has never been able to answer
// "have I used my bonus action yet?", and at a real table that question is asked
// out loud every round. It's the spine of the play surface, so it gets the
// weight; everything below it is quieter by comparison.
export default function TurnEconomy({ turn }: { turn: PlayTurn }) {
  return (
    <div className="turn-economy">
      <div className="row turn-economy-slots">
        {ECONOMY_SLOTS.map((slot) => {
          const spent = turn.spent[slot];
          return (
            <button
              key={slot}
              type="button"
              className={classNames("turn-slot", { spent })}
              aria-pressed={spent}
              aria-label={`${ECONOMY_SLOT_LABELS[slot]} — ${
                spent ? "spent, click to restore" : "available, click to spend"
              }`}
              onClick={() => turn.toggle(slot)}
            >
              <span className="turn-slot-name">
                {ECONOMY_SLOT_LABELS[slot]}
              </span>
              <span className="turn-slot-state">
                {spent ? "spent" : "open"}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="turn-end-btn"
        disabled={!turn.anySpent}
        onClick={turn.endTurn}
      >
        End turn
      </button>
    </div>
  );
}
