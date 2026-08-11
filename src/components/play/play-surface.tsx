import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import classNames from "classnames";
import { FaCampground, FaFileLines } from "react-icons/fa6";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { ensureDriveToken } from "src/lib/google-auth";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastDatastore } from "src/lib/last-datastore";
import { useRest } from "src/lib/hooks/use-rest";
import { calculateCustomFormula } from "src/lib/formula";
import { AutoRejoin, useAutoRejoin } from "src/lib/hooks/use-auto-rejoin";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import { RollerProvider, useRoller } from "src/lib/hooks/use-roller";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { getPB, modifier } from "src/lib/rules";
import { initiativeModifierFor } from "src/lib/play/initiative";
import { conditionSummary } from "src/lib/play/condition-mechanics";
import {
  CHECK_OPTIONS,
  checkForValue,
  checkLabel,
  checkModifier,
} from "src/lib/play/checks";
import { rollD20Check } from "src/lib/roll";
import { randomUUID } from "src/lib/browser";
import { usePlayTurn } from "src/lib/play/use-turn";
import { TurnFlowProvider } from "src/lib/play/use-turn-flow";
import { Character } from "src/lib/types";
import RollModal from "src/components/roll-modal";
import Select from "src/components/select";
import ActionBoard from "./action-board";
import DmBoard from "./dm-board";
import InitiativeRail from "./initiative-rail";
import PlayVitals from "./play-vitals";
import SessionBar from "./session-bar";
import TargetStrip from "./target-strip";
import TurnEconomy from "./turn-economy";

// The play-mode control panel: a turn's actions, not the sheet.
// Advisory only — nothing here is authoritative; all writes go through the
// same reducer as the sheet.

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
  const {
    sessionStatus,
    isDm,
    claimables,
    claimSheet,
    inCombat,
    current,
    self,
    encounter,
    pendingAssignment,
    acceptAssignment,
    declineAssignment,
    initiativeCalled,
    dismissInitiativeCall,
    setCombatantInitiative,
  } = useEncounter();
  const turn = usePlayTurn();

  // Exclude the pending assignment so it isn't offered twice (targeted prompt + generic pickup).
  const pickups = claimables.filter((c) => c.id !== pendingAssignment?.id);

  // Advisory only: dims the board off-turn (reactions excepted) but locks nothing.
  const offTurn = inCombat && !!current && !!self && current.id !== self.id;
  const nextUp =
    inCombat && encounter.participants.length > 1
      ? encounter.participants[
          (encounter.turnIndex + 1) % encounter.participants.length
        ]
      : undefined;
  const youAreNext = !!self && nextUp?.id === self.id;
  const dying = !!character && character.currHp <= 0;

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
          <div className="play-surface">
            {/* Hidden during a reconnect — RejoinBanner takes its place. */}
            {!rejoin.rejoining && <SessionBar />}
            <RejoinBanner rejoin={rejoin} />
            {/* Declining just closes this; the offer stays open on the DM's board. */}
            {pendingAssignment && (
              <div className="assign-prompt">
                <span>
                  Your DM is handing you{" "}
                  <strong>{pendingAssignment.name}</strong> to play.
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
            {initiativeCalled && !isDm && character && self && (
              <InitiativeCallPrompt
                character={character}
                selfId={self.id}
                setCombatantInitiative={setCombatantInitiative}
                dismiss={dismissInitiativeCall}
              />
            )}
            <RollCallPrompt />
            <RestCallPrompt />
            <IncomingHealingBanner />
            <IncomingConditionBanners />
            <ConcentrationCheckBanner />
            <InitiativeRail variant={isDm ? "dm" : "player"} />
            {isDm ? (
              <DmBoard />
            ) : character ? (
              <>
                {inCombat && current && self && (
                  <div
                    className={classNames("turn-banner", {
                      "your-turn": !offTurn,
                    })}
                  >
                    {offTurn ? (
                      <>
                        <span className="turn-banner-title">
                          {/* A staged combatant's name must not leak to players. */}
                          {current.hidden
                            ? "The DM is up to something…"
                            : `${current.name} is acting`}
                        </span>
                        <span className="turn-banner-sub">
                          {youAreNext
                            ? "You're next — line your turn up."
                            : "Your reaction stays ready — and nothing here is locked if the table rules otherwise."}
                        </span>
                      </>
                    ) : (
                      <span className="turn-banner-title">Your turn</span>
                    )}
                    {!offTurn && dying && (
                      <span className="turn-banner-sub">
                        You&apos;re at 0 HP — death saving throw first.
                      </span>
                    )}
                  </div>
                )}
                <header className="play-header">
                  <TurnEconomy turn={turn} />
                  <div className="play-header-links">
                    <CheckLauncher character={character} />
                    {/* Hidden mid-combat, where it would only be a misclick. */}
                    {!inCombat && <RestShortcut />}
                    <Link className="play-sheet-link" to="/sheet">
                      <FaFileLines />
                      <span>Open sheet</span>
                    </Link>
                  </div>
                </header>
                <TargetStrip />
                <div
                  className={classNames("play-body", { "off-turn": offTurn })}
                >
                  <ActionBoard turn={turn} />
                  <PlayVitals />
                </div>
              </>
            ) : (
              <div className="play-no-sheet">
                {/* Claiming opens the sheet borrowed from the DM's browser; nothing is written to local storage. */}
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
                ) : pendingAssignment ? null : (
                  <p className="text-muted">
                    {/* The sidebar drawer only exists once a datastore is selected. */}
                    {datastore
                      ? "You're at the table without a character. Open one from the sidebar to play it, or wait for your DM to offer you one or hand one to you."
                      : "You're at the table without a character. Your DM can offer you one or hand one to you right here."}
                  </p>
                )}
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

// App mode rolls with the sheet's modifier in one click; manual mode takes the
// d20 face (not the total) and adds the modifier, matching every other manual
// d20 prompt in the app.
function InitiativeCallPrompt({
  character,
  selfId,
  setCombatantInitiative,
  dismiss,
}: {
  character: Character;
  selfId: string;
  setCombatantInitiative: (id: string, initiative: number) => void;
  dismiss: () => void;
}) {
  const { rollMode } = useRollMode();
  const { sendReport } = useTableTalk();
  const [raw, setRaw] = useState("");
  const modifier = initiativeModifierFor(character);
  const parsed = Number(raw);
  const valid =
    raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 1 && parsed <= 20;
  const reportInitiative = (face: number, total: number, manual?: true) =>
    sendReport({
      exchangeId: randomUUID(),
      stage: "roll",
      attempt: 1,
      label: "Initiative",
      total,
      faces: [face],
      kept: face,
      ...(manual ? { manual } : {}),
    });
  return (
    <div className="assign-prompt">
      <span>
        <strong>Roll initiative!</strong> Your DM called for it.
      </span>
      {rollMode === "manual" ? (
        <form
          className="row roll-manual"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            const face = Math.floor(parsed);
            setCombatantInitiative(selfId, face + modifier);
            reportInitiative(face, face + modifier, true);
            dismiss();
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            aria-label="What did the d20 show?"
            placeholder="What did the d20 show?"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!valid}>
            Set ({modifier >= 0 ? "+" : ""}
            {modifier})
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const rolled = rollD20Check(modifier);
            setCombatantInitiative(selfId, rolled.total);
            reportInitiative(rolled.kept, rolled.total);
            dismiss();
          }}
        >
          Roll ({modifier >= 0 ? "+" : ""}
          {modifier})
        </button>
      )}
      <button type="button" onClick={dismiss}>
        Not now
      </button>
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

// A DM's roll call, opening the ordinary roll dialog against the call's
// exchange id. Doesn't close on answering — `attemptBase` numbers a re-roll
// on from the last so both stay keyed to the same call.
function RollCallPrompt() {
  const { isDm } = useEncounter();
  const { rollCall, dismissRollCall, sentChecks, verdicts } = useTableTalk();
  const { character } = useCharacter();
  const { openRoller } = useRoller();
  if (!rollCall || isDm || !character) return null;

  const label = checkLabel(rollCall.check);
  const mod = checkModifier(character, rollCall.check);
  const sent = sentChecks[rollCall.callId];
  return (
    <div className="assign-prompt">
      <span>
        Your DM asks for a <strong>{label}</strong>.
      </span>
      {sent && (
        <span>
          You sent <strong>{sent.total}</strong>.
          {verdicts[rollCall.callId] && (
            <>
              {" "}
              Your DM says:{" "}
              <strong>
                {verdicts[rollCall.callId] === "success"
                  ? "that's a success"
                  : verdicts[rollCall.callId] === "failure"
                    ? "that's not enough"
                    : verdicts[rollCall.callId]}
              </strong>
              .
            </>
          )}
        </span>
      )}
      <button
        type="button"
        className="btn-primary"
        onClick={() =>
          openRoller({
            id: rollCall.callId,
            label,
            spec: {
              kind: "check",
              modifier: mod,
              ...(rollCall.check.kind === "save" ? { save: true } : {}),
            },
            attemptBase: sent?.attempt ?? 0,
          })
        }
      >
        {sent ? "Roll again" : "Roll"} ({mod >= 0 ? "+" : ""}
        {mod})
      </button>
      <button type="button" onClick={dismissRollCall}>
        {sent ? "Done" : "Not now"}
      </button>
    </div>
  );
}

// Invitation, not a remote write: opens the player's own rest panel with the
// table's rest kind pre-filled; the player still drives it.
function RestCallPrompt() {
  const { isDm } = useEncounter();
  const { restCall, dismissRestCall } = useTableTalk();
  const { character } = useCharacter();
  const { openRest } = useRest();
  if (!restCall || isDm || !character) return null;

  const label = restCall.kind === "long" ? "long rest" : "short rest";
  return (
    <div className="assign-prompt">
      <span>
        Your DM calls a <strong>{label}</strong>
        {restCall.spansDawn && <> — it spans dawn</>}.
      </span>
      <button
        type="button"
        className="btn-primary"
        onClick={() => {
          openRest({ kind: restCall.kind, spansDawn: restCall.spansDawn });
          dismissRestCall();
        }}
      >
        Take it
      </button>
      <button type="button" onClick={dismissRestCall}>
        Not now
      </button>
    </div>
  );
}

// DM-approved healing offer; applying it is the recipient's own write.
function IncomingHealingBanner() {
  const { incomingHealing, applyIncomingHealing, declineIncomingHealing } =
    useTableTalk();
  if (!incomingHealing) return null;
  return (
    <div className="assign-prompt">
      <span>
        <strong>{incomingHealing.amount} healing</strong> incoming from{" "}
        <strong>{incomingHealing.fromName}</strong>.
      </span>
      <button
        type="button"
        className="btn-primary"
        onClick={applyIncomingHealing}
      >
        Apply +{incomingHealing.amount}
      </button>
      <button type="button" onClick={declineIncomingHealing}>
        Ignore
      </button>
    </div>
  );
}

// One banner per pending condition offer (multiple can land in the same round).
function IncomingConditionBanners() {
  const {
    incomingConditions,
    applyIncomingCondition,
    declineIncomingCondition,
  } = useTableTalk();
  return (
    <>
      {incomingConditions.map((offer) => {
        const summary = conditionSummary(offer.condition.name);
        return (
          <div key={offer.offerId} className="assign-prompt">
            <span>
              <strong>{offer.fromName}</strong> cast{" "}
              <strong>{offer.label ?? offer.condition.name}</strong> on you
              {summary ? <> — {summary}</> : null}.
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={() => applyIncomingCondition(offer.offerId)}
            >
              Apply {offer.condition.name}
            </button>
            <button
              type="button"
              onClick={() => declineIncomingCondition(offer.offerId)}
            >
              Ignore
            </button>
          </div>
        );
      })}
    </>
  );
}

// Raised when the open character's HP drops while concentrating. The app
// offers the roll but takes the player's word on the outcome.
function ConcentrationCheckBanner() {
  const {
    concentrationCheck,
    clearConcentrationCheck,
    self,
    concentrateOn,
    isDm,
  } = useEncounter();
  const { character } = useCharacter();
  const { openRoller } = useRoller();
  if (!concentrationCheck || !character || isDm) return null;

  const saveBonus = character.savingThrowBonus
    ? calculateCustomFormula(character.savingThrowBonus, character)
    : 0;
  const conSave =
    modifier(character.stats.con) +
    (character.proficiencies.savingThrows.con ? getPB(character) : 0) +
    saveBonus;

  return (
    <div className="con-check-banner">
      <span>
        You took {concentrationCheck.damage} damage while concentrating on{" "}
        <strong>{concentrationCheck.spell}</strong> — Constitution save DC{" "}
        {concentrationCheck.dc}.
      </span>
      <button
        type="button"
        onClick={() =>
          openRoller({
            label: `Concentration save (DC ${concentrationCheck.dc})`,
            spec: { kind: "check", modifier: conSave, save: true },
          })
        }
      >
        Roll the save
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={clearConcentrationCheck}
      >
        Kept it
      </button>
      <button
        type="button"
        onClick={() => {
          if (self) concentrateOn(self.id, undefined);
          clearConcentrationCheck();
        }}
      >
        Lost it
      </button>
    </div>
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
