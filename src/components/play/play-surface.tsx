import { Link, Navigate } from "react-router-dom";
import classNames from "classnames";
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
  const {
    sessionStatus,
    isDm,
    claimables,
    claimSheet,
    inCombat,
    current,
    self,
    pendingAssignment,
    acceptAssignment,
    declineAssignment,
  } = useEncounter();
  const turn = usePlayTurn();

  // Assigning marks the sheet offered too, so without this the target sees
  // the same sheet twice — the targeted prompt above and the generic pickup
  // button below, two buttons for one act.
  const pickups = claimables.filter((c) => c.id !== pendingAssignment?.id);

  // The per-round guidance the board narrows by. Advisory like everything
  // else here: off your turn the board dims (except reactions — those are
  // exactly what an off-turn moment is for) and says whose turn it is, but
  // nothing locks. A readied action, a DM ruling, a held Sentinel swing —
  // the table decides, so hovering a dimmed group brings it right back.
  const offTurn = inCombat && !!current && !!self && current.id !== self.id;

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
          {/* A targeted offer from the DM. Consent stays two-sided: the sheet
              hasn't travelled yet, and accepting runs the same claim flow the
              pick-up buttons use. Declining just closes this — the offer
              stays open on the DM's board. */}
          {pendingAssignment && (
            <div className="assign-prompt">
              <span>
                Your DM is handing you <strong>{pendingAssignment.name}</strong>{" "}
                to play.
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={acceptAssignment}
              >
                Play {pendingAssignment.name}
              </button>
              <button type="button" onClick={declineAssignment}>
                Not now
              </button>
            </div>
          )}
          <InitiativeRail variant={isDm ? "dm" : "player"} />
          {/* Holding the seat swaps the whole body: a player asks "what can I
              do right now", a DM asks "what is the state of eight creatures".
              A DM who is also playing a character flips to it via the sheet —
              running the table is the job here. */}
          {isDm ? (
            <DmBoard />
          ) : character ? (
            <>
              {/* Whose round it is, said once and plainly. The board below
                  takes its cue from the same fact. */}
              {inCombat && current && self && (
                <div
                  className={classNames("turn-banner", {
                    "your-turn": !offTurn,
                  })}
                >
                  {offTurn ? (
                    <>
                      <span className="turn-banner-title">
                        {current.name} is acting
                      </span>
                      <span className="turn-banner-sub">
                        Your reaction stays ready — and nothing here is locked
                        if the table rules otherwise.
                      </span>
                    </>
                  ) : (
                    <span className="turn-banner-title">Your turn</span>
                  )}
                </div>
              )}
              <header className="play-header">
                <TurnEconomy turn={turn} />
                <Link className="play-sheet-link" to="/sheet">
                  <FaFileLines />
                  <span>Open sheet</span>
                </Link>
              </header>
              <div className={classNames("play-body", { "off-turn": offTurn })}>
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
              {pickups.length > 0 ? (
                <>
                  <p className="text-muted">
                    Your DM is offering {pickups.length === 1 ? "a" : ""}
                    {pickups.length > 1 ? pickups.length : ""} character
                    {pickups.length === 1 ? "" : "s"} to play:
                  </p>
                  <div className="play-claimables">
                    {pickups.map((offered) => (
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
              ) : pendingAssignment ? null : ( // the prompt above is the whole story
                <p className="text-muted">
                  You&apos;re at the table without a character. Open one from
                  the sidebar to play it, or wait for your DM to offer you one
                  or hand one to you.
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
