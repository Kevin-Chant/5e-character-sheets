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
  const { datastore, setDatastore } = useDatastoreSelector();
  // The table in the URL: reconnects a dropped session on its own, restores
  // the sheet that was open, and writes the code into the address bar for a
  // session that arrived by any other door. See `use-auto-rejoin`.
  const rejoin = useAutoRejoin();

  // The nav's character drawer is gated on a selected datastore, and the
  // "no sheet" copy below points at it — but a joiner arrives here through
  // /join/<code>, which never passes through the surfaces that re-select the
  // remembered backend (home, or the sheet's cold-start bootstrap). Re-adopt
  // it here the same way the sheet does: local instantly, Drive only if it
  // resumes silently. No /auth detour and no bounce home — a seat at the
  // table with no storage at all is a real state, not a half-loaded page.
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
  // "You're on deck" — the heads-up every table gives out loud.
  const nextUp =
    inCombat && encounter.participants.length > 1
      ? encounter.participants[
          (encounter.turnIndex + 1) % encounter.participants.length
        ]
      : undefined;
  const youAreNext = !!self && nextUp?.id === self.id;
  const dying = !!character && character.currHp <= 0;

  // Being in a session without a sheet is a real seat at the table, not a
  // half-loaded page: it's the DM, and it's the player waiting to be handed a
  // character. What they get is the fight without the turn — everything below
  // the rail is a view of a character, and there isn't one.
  const inSession = sessionStatus === "connected";
  // With neither a character nor a session there is nothing to play, so hand
  // back to the picker rather than rendering an empty frame. **Unless the URL
  // names a table**: a cold page load at `/play/<code>` has neither for its
  // first seconds by definition, and every reconnect attempt passes back
  // through that state — so redirecting on it navigates away from the one URL
  // that knows how to get back, and unmounts the retry loop on the way out.
  if (!character && !inSession && !rejoin.atTable) {
    return <Navigate to="/sheet" replace />;
  }

  return (
    <EditModeContext.Provider value={PLAY_EDIT_MODE}>
      <RollerProvider>
        <TurnFlowProvider>
          <div className="play-surface">
            {/* Order matters: the fight comes first, then your turn within it.
              The economy under the rail reads as "and here's what you have left
              this turn", which is the question the rail has just raised. */}
            {/* While a reconnect is under way the bar's "Start a session /
              Join a session" is the wrong offer — this browser is already in
              one and is getting back to it. The banner takes its place and
              says so. */}
            {!rejoin.rejoining && <SessionBar />}
            {/* Reconnecting, and saying so. An unexplained board — the fight
              frozen, nothing arriving — is the worst version of a dropped
              phone: it looks like the app working. */}
            <RejoinBanner rejoin={rejoin} />
            {/* A targeted offer from the DM. Consent stays two-sided: the sheet
              hasn't travelled yet, and accepting runs the same claim flow the
              pick-up buttons use. Declining just closes this — the offer
              stays open on the DM's board. */}
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
            {/* "Alright everyone — roll initiative!" In app-dice mode one click
              rolls with the sheet's own modifier; with real dice the prompt
              asks what the d20 showed and adds the modifier itself. Either way
              it lands on your row. */}
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
                          {/* A staged combatant's turn must not leak its name —
                            the players know something moved, not what. */}
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
                    {/* "Give me a Perception check" — the most common DM
                        sentence there is, so answering shouldn't need a trip
                        to the sheet and back. */}
                    <CheckLauncher character={character} />
                    {/* Between fights is when a table rests — mid-combat the
                      button would only be a misclick. */}
                    {!inCombat && <RestShortcut />}
                    <Link className="play-sheet-link" to="/sheet">
                      <FaFileLines />
                      <span>Open sheet</span>
                    </Link>
                  </div>
                </header>
                {/* Who's across the table, one tap from being your target.
                  Between the header and the board because it answers the
                  question the board's attack buttons are about to ask. */}
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
                    {/* Only point at the sidebar when the drawer button is
                      actually in the nav — it's gated on a selected datastore,
                      and a joiner with no storage doesn't have one. */}
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

// "Getting you back in." Shown whenever the URL names a table this browser
// isn't currently connected to.
//
// The words matter more than they look. A player whose phone dropped the
// socket sees a board that is still *there* — their HP, the order, last
// round's conditions — and nothing to say it has stopped being true. The
// banner is the difference between "the app is thinking" and "the app is
// lying", and after the automatic tries are spent it stops claiming to be
// working and offers the button instead.
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
          ? "Couldn't get back to your game. It may have ended, or your connection is still down."
          : rejoin.attempts === 0
            ? "Getting you back to your game…"
            : `Getting you back to your game… (attempt ${rejoin.attempts + 1})`}
        {!givenUp && (
          /* The other half of the truth, and the half that used to be
             missing: the board still works while this is happening, and
             nothing done on it is reaching the table. A write that goes
             nowhere and says nothing is worse than one that fails loudly. */
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

// The answer to the DM's call, in whichever dice the player is using: app mode
// rolls with the sheet's modifier in one click; manual mode takes the die face
// and adds the modifier itself — the same ask as every other manual d20 (the
// roll dialog's checks, death saves), so the one rule a physical roller learns
// is "one d20: type the face; a fistful of dice: type the total". This prompt
// used to ask for the total instead, and a player who typed the face the way
// the dialog taught them set an initiative missing its modifier. Both modes
// write straight to your row.
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
  // The answer the DM asked for, sent back as the roll it was — the row's
  // number alone can't say what the d20 showed or what was added to it.
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

// The ad-hoc d20 picker: any save, ability check or skill, one pick away.
// Opens the ordinary roll dialog, so advantage, condition notes and the
// real-dice mode all come along for free.
//
// Thirty-two options with three headings is exactly the list a filter box is
// for — "perc" beats scrolling past six saves and six abilities. Each one
// carries its own modifier, because the question a player is really asking is
// "what do I add", and answering it in the list saves opening the dialog to
// find out.
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
            // Saves are their own roll kind — Bless's d4 lands on a called
            // WIS save and stays off a Perception check.
            ...(check.kind === "save" ? { save: true } : {}),
          },
        });
      }}
    />
  );
}

// "Brakka — give me a Perception check." The DM's ask, routed through the
// tool: one button opens the ordinary roll dialog aimed at the call's own
// exchange id, so the answer travels back to the seat with everything the
// dialog knows — Bless's d4, a condition's note, advantage buttons, the
// real-dice mode. This prompt used to roll inline, which silently skipped
// every rider the dialog applies: the same character answered "Roll a check…"
// with the d4 and the DM's call without it. Nothing here closes on being
// answered — a player who rolled before hearing "with advantage" opens it
// again, and `attemptBase` numbers the new roll on from the last, so the seat
// sees both keyed to the same ask.
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
          {/* The seat's answer, keyed to this ask — the sentence that used to
              come back only by voice. */}
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

// "Your DM calls a long rest." The invitation, not the rest — pressing it
// opens this player's own rest panel with the table's two answers already
// filled in, and everything from there (which hit dice to spend, what to
// prepare) is theirs as it always was.
//
// It has to be an invitation rather than a write for a reason beyond consent:
// a long rest is a dozen fields, follow-ups the player drives, and a single
// undoable `replace_character`. Applying that from the wire would be the one
// remote action on this table that rewrites a sheet nobody touched — and a
// player mid-thought about a spell they were holding would find it gone.
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

// "8 healing incoming from Maelina." The last leg of a healing report: the DM
// approved it, and applying it is the recipient's own write on their own
// sheet — consent all the way down.
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

// "Ellora cast Bless on you." The last leg of a cast condition: applying is
// the bearer's own write on their own row — same consent shape as healing,
// one banner per pending offer since Bless and Shield of Faith landing in
// the same round is ordinary.
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

// "You took 14 while holding Hypnotic Pattern — DC 10, your roll." Raised by
// the encounter provider whenever the open character's HP drops while their
// participant is concentrating, whoever dealt the damage. Advisory to the
// bone: the app offers the roll and takes the player's word for the outcome —
// nothing drops concentration except the two buttons.
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

// The between-fights loop: end combat, sweep the fallen, rest, next fight.
// The rest dialog is mounted globally by RestProvider, so this is just the
// door to it — kept off the surface mid-combat where it could only be a
// misclick.
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
