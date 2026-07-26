import { Link, Navigate } from "react-router-dom";
import { FaFileLines } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import { RollerProvider } from "src/lib/hooks/use-roller";
import { usePlayTurn } from "src/lib/play/use-turn";
import RollModal from "src/components/roll-modal";
import ActionBoard from "./action-board";
import DmBoard from "./dm-board";
import InitiativeRail from "./initiative-rail";
import PlayVitals from "./play-vitals";
import SessionBar from "./session-bar";
import TurnEconomy from "./turn-economy";

// Play mode is its own surface rather than a lighter sheet: the sheet answers
// "who is this character", and a turn asks "what can I do right now", which is
// a different question with a different shape. The sheet is a document; this is
// a control panel. See the play-mode bullet in CLAUDE.md.
//
// Nothing here is authoritative. The turn economy is advisory, unavailable
// actions dim rather than disable, and every write goes through the same
// reducer the sheet uses — so live sync, undo and autosave work unchanged.

// Every component under here is on the "not editing" side of `useEditMode`,
// which is what turns roll buttons on and edit affordances off. The sheet's own
// mode toggle is a separate thing and doesn't reach in here.
const PLAY_EDIT_MODE = {
  editMode: false,
  setEditMode: () => {},
  toggleMode: () => {},
};

export default function PlaySurface() {
  const { character } = useCharacter();
  const { sessionStatus, isDm, claimables, claimSheet } = useEncounter();
  const turn = usePlayTurn();

  // Being in a session without a sheet is a real seat at the table, not a
  // half-loaded page: it's the DM, and it's the player waiting to be handed a
  // character. What they get is the fight without the turn — everything below
  // the rail is a view of a character, and there isn't one.
  const inSession = sessionStatus === "connected";
  // With neither a character nor a session there is nothing to play, so hand
  // back to the picker rather than rendering an empty frame.
  if (!character && !inSession) return <Navigate to="/sheet" replace />;

  return (
    <EditModeContext.Provider value={PLAY_EDIT_MODE}>
      <RollerProvider>
        <div className="play-surface">
          {/* Order matters: the fight comes first, then your turn within it.
              The economy under the rail reads as "and here's what you have left
              this turn", which is the question the rail has just raised. */}
          <SessionBar />
          <InitiativeRail />
          {/* Holding the seat swaps the whole body: a player asks "what can I
              do right now", a DM asks "what is the state of eight creatures".
              A DM who is also playing a character flips to it via the sheet —
              running the table is the job here. */}
          {isDm ? (
            <DmBoard />
          ) : character ? (
            <>
              <header className="play-header">
                <TurnEconomy turn={turn} />
                <Link className="play-sheet-link" to="/sheet">
                  <FaFileLines />
                  <span>Open sheet</span>
                </Link>
              </header>
              <div className="play-body">
                <ActionBoard turn={turn} />
                <PlayVitals />
              </div>
            </>
          ) : (
            <div className="play-no-sheet">
              {/* The other half of sheet assignment: the DM offered, and the
                  choice of which one to play is yours. Clicking asks the DM's
                  browser for the whole sheet — it opens borrowed, so nothing
                  is written into your storage. */}
              {claimables.length > 0 ? (
                <>
                  <p className="text-muted">
                    Your DM is offering {claimables.length === 1 ? "a" : ""}
                    {claimables.length > 1 ? claimables.length : ""} character
                    {claimables.length === 1 ? "" : "s"} to play:
                  </p>
                  <div className="play-claimables">
                    {claimables.map((offered) => (
                      <button
                        key={offered.id}
                        type="button"
                        className="btn-primary"
                        onClick={() => claimSheet(offered.id)}
                      >
                        Play {offered.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted">
                  You&apos;re at the table without a character. Open one from
                  the sidebar to play it, or wait for your DM to offer one.
                </p>
              )}
            </div>
          )}
        </div>
        <RollModal />
      </RollerProvider>
    </EditModeContext.Provider>
  );
}
