import classNames from "classnames";
import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  ECONOMY_SLOTS,
  ECONOMY_SLOT_LABELS,
  PlayTurn,
} from "src/lib/play/use-turn";
import { useTurnFlow } from "src/lib/play/use-turn-flow";

// Action/bonus action/reaction, as slots that empty as they're used.
export default function TurnEconomy({ turn }: { turn: PlayTurn }) {
  const { inCombat, current, self } = useEncounter();
  const { advance } = useTurnFlow();
  // On your turn "End turn" advances the order; off-turn it only clears the slots.
  const myTurn = inCombat && !!current && !!self && current.id === self.id;
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
        className={classNames("turn-end-btn", { "btn-primary": myTurn })}
        disabled={!myTurn && !turn.anySpent}
        title={
          myTurn
            ? "Done — pass the turn to whoever is next"
            : "Clear the spent slots"
        }
        onClick={myTurn ? advance : turn.endTurn}
      >
        End turn
      </button>
    </div>
  );
}
