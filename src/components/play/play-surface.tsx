import { useEffect, useMemo, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import classNames from "classnames";
import { FaCampground, FaFileLines } from "react-icons/fa6";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { ensureDriveToken } from "src/lib/google-auth";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastDatastore } from "src/lib/last-datastore";
import { useRest } from "src/lib/hooks/use-rest";
import { AutoRejoin, useAutoRejoin } from "src/lib/hooks/use-auto-rejoin";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import { RollerProvider, useRoller } from "src/lib/hooks/use-roller";
import {
  CHECK_OPTIONS,
  checkForValue,
  checkLabel,
  checkModifier,
} from "src/lib/play/checks";
import { usePlayTurn } from "src/lib/play/use-turn";
import { TurnFlowProvider } from "src/lib/play/use-turn-flow";
import { Character } from "src/lib/types";
import RollModal from "src/components/roll-modal";
import Select from "src/components/select";
import ActionBoard from "./action-board";
import CallStack from "./call-cards";
import DmBoard from "./dm-board";
import InitiativeRail from "./initiative-rail";
import PlayVitals from "./play-vitals";
import SessionBar from "./session-bar";
import TableLane from "./table-lane";
import TargetStrip from "./target-strip";
import TurnEconomy from "./turn-economy";

// The play-mode control panel: a turn's actions, not the sheet.
// Advisory only — nothing here is authoritative; all writes go through the
// same reducer as the sheet.
//
// The player's body is three zones, grouped by voice: **you** (economy,
// vitals), **the fight** (targets, the board), and **the table** (the DM's
// pending asks, then who's here and what they're rolling). On a phone the
// zones dissolve into one column ordered by urgency; on a wide screen they
// spread into you | fight | table. The initiative rail sits above all three
// as the fight's clock.

// Everything under here uses the "not editing" side of `useEditMode`,
// independent of the sheet's own edit-mode toggle.
const PLAY_EDIT_MODE = {
  editMode: false,
  setEditMode: () => {},
  toggleMode: () => {},
};

export default function PlaySurface() {
  const { character } = useCharacter();
  const { datastore, setDatastore } = useDatastoreSelector();
  const rejoin = useAutoRejoin();

  // A joiner can arrive via /join/<code>, bypassing the surfaces (home, the
  // sheet's cold-start) that normally re-select the remembered backend.
  // Re-adopt it here: local instantly, Drive only if it resumes silently
  // (no /auth detour).
  const driveBootStarted = useRef(false);
  useEffect(() => {
    if (datastore) return;
    const mode = readLastDatastore();
    if (mode === "local") {
      setDatastore(LocalDatastore);
    } else if (mode === "drive" && !driveBootStarted.current) {
      driveBootStarted.current = true;
      void ensureDriveToken().then((ok) => {
        if (ok) setDatastore(GoogleDriveDatastore);
      });
    }
  }, [datastore]);
  const { sessionStatus, isDm, inCombat, current, self, pendingAssignment } =
    useEncounter();
  const turn = usePlayTurn();

  // Advisory only: dims the board off-turn (reactions excepted) but locks
  // nothing — the rail's statement says whose turn it is.
  const offTurn = inCombat && !!current && !!self && current.id !== self.id;

  const inSession = sessionStatus === "connected";
  // Don't redirect when the URL names a table (`rejoin.atTable`): a cold load
  // at /play/<code> has neither character nor session for its first seconds,
  // and redirecting would unmount the retry loop.
  if (!character && !inSession && !rejoin.atTable) {
    return <Navigate to="/sheet" replace />;
  }

  return (
    <EditModeContext.Provider value={PLAY_EDIT_MODE}>
      <RollerProvider>
        <TurnFlowProvider>
          <div className={classNames("play-surface", { dm: isDm })}>
            {/* The DM's session controls stay a slim strip above the clock —
                the lane below is a player's view of the table, and the board
                already is the DM's. Hidden during a reconnect, where
                RejoinBanner takes its place. */}
            {isDm && !rejoin.rejoining && <SessionBar />}
            <RejoinBanner rejoin={rejoin} />
            <InitiativeRail variant={isDm ? "dm" : "player"} />
            {isDm ? (
              <DmBoard />
            ) : (
              <div
                className={classNames("play-zones", { "off-turn": offTurn })}
              >
                {character ? (
                  <>
                    <section className="zone-you">
                      <header className="play-header">
                        <TurnEconomy turn={turn} />
                        <div className="play-header-links">
                          <CheckLauncher character={character} />
                          {/* Hidden mid-combat, where it would only be a
                            misclick. */}
                          {!inCombat && <RestShortcut />}
                          <Link className="play-sheet-link" to="/sheet">
                            <FaFileLines />
                            <span>Open sheet</span>
                          </Link>
                        </div>
                      </header>
                      <PlayVitals />
                    </section>
                    <section className="zone-fight">
                      {/* Who's across the table, one tap from being your
                        target — above the board that's about to ask. */}
                      <TargetStrip />
                      <ActionBoard turn={turn} />
                    </section>
                  </>
                ) : (
                  <div className="play-no-sheet">
                    {/* The pickup and assignment offers render as call cards
                      in the table zone; this is the seat explaining itself
                      while it's empty. */}
                    {pendingAssignment ? null : ( // the card is the whole story
                      <p className="text-muted">
                        {/* The sidebar drawer only exists once a datastore is
                          selected. */}
                        {datastore
                          ? "You're at the table without a character. Open one from the sidebar to play it, or wait for your DM to offer you one or hand one to you."
                          : "You're at the table without a character. Your DM can offer you one or hand one to you right here."}
                      </p>
                    )}
                  </div>
                )}
                <aside className="zone-table">
                  <CallStack />
                  <TableLane hideSession={rejoin.rejoining} />
                </aside>
              </div>
            )}
          </div>
          <RollModal />
        </TurnFlowProvider>
      </RollerProvider>
    </EditModeContext.Provider>
  );
}

// Shown when the URL names a table this browser isn't currently connected to.
function RejoinBanner({ rejoin }: { rejoin: AutoRejoin }) {
  const { sessionStatus } = useEncounter();
  if (sessionStatus === "connected") return null;
  if (!rejoin.atTable) return null;
  if (!rejoin.rejoining && rejoin.attempts === 0) return null;
  const givenUp = !rejoin.rejoining;
  return (
    <div className={classNames("rejoin-banner", { "gave-up": givenUp })}>
      <span>
        {givenUp
          ? "Couldn't get back to your game. It may have ended, or your connection is still down — still trying every minute while this tab is open."
          : rejoin.attempts === 0
            ? "Getting you back to your game…"
            : `Getting you back to your game… (attempt ${rejoin.attempts + 1})`}
        {!givenUp && (
          // The board stays interactive while reconnecting, but nothing written reaches the table yet.
          <span className="rejoin-banner-sub">
            {" "}
            Changes you make now stay on this device until you&apos;re back.
          </span>
        )}
      </span>
      {givenUp && (
        <button type="button" className="btn-primary" onClick={rejoin.retry}>
          Try again
        </button>
      )}
    </div>
  );
}

// Ad-hoc save/check/skill picker, opening the ordinary roll dialog. Each
// option shows its own modifier.
function CheckLauncher({ character }: { character: Character }) {
  const { openRoller } = useRoller();
  const options = useMemo(
    () =>
      CHECK_OPTIONS.map((option) => {
        const check = checkForValue(option.value);
        const mod = check ? checkModifier(character, check) : 0;
        return { ...option, meta: `${mod >= 0 ? "+" : ""}${mod}` };
      }),
    [character],
  );
  return (
    <Select
      className="check-launcher"
      label="Roll a check or save"
      placeholder="Roll a check…"
      triggerLabel="Roll a check…"
      value=""
      options={options}
      onChange={(value) => {
        const check = checkForValue(value);
        if (!check) return;
        openRoller({
          label: checkLabel(check),
          spec: {
            kind: "check",
            modifier: checkModifier(character, check),
            ...(check.kind === "save" ? { save: true } : {}),
          },
        });
      }}
    />
  );
}

// Opens the rest dialog (mounted globally by RestProvider).
function RestShortcut() {
  const { openRest } = useRest();
  return (
    <button
      type="button"
      className="play-sheet-link"
      onClick={() => openRest()}
    >
      <FaCampground />
      <span>Rest</span>
    </button>
  );
}
