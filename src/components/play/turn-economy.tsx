import classNames from "classnames";
import { useEncounter } from "src/lib/hooks/use-encounter";
import {
  ECONOMY_SLOTS,
  ECONOMY_SLOT_LABELS,
  PlayTurn,
} from "src/lib/play/use-turn";
import { useTurnFlow } from "src/lib/play/use-turn-flow";

// The three things a turn spends, as slots that empty as you use them.
//
// This is the one thing paper can't do — the sheet has never been able to answer
// "have I used my bonus action yet?", and at a real table that question is asked
// out loud every round. It's the spine of the play surface, so it gets the
// weight; everything below it is quieter by comparison.
export default function TurnEconomy({ turn }: { turn: PlayTurn }) {
  const { inCombat, current, self } = useEncounter();
  const { advance } = useTurnFlow();
  // Unlike everything else on this surface, ending your own turn needs no
  // ruling from the table — it's the one call that is entirely yours. So on
  // your turn the button does the real thing and the order moves on; the DM's
  // "Next turn" stays as the hatch for the player who forgets. Off-turn (or
  // out of combat) it falls back to just clearing the slots below.
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
