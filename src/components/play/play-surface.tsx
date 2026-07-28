import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import classNames from "classnames";
import { FaCampground, FaFileLines } from "react-icons/fa6";
import { useRest } from "src/lib/hooks/use-rest";
import { calculateCustomFormula } from "src/lib/formula";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { EditModeContext } from "src/lib/hooks/use-edit-mode";
import { RollerProvider, useRoller } from "src/lib/hooks/use-roller";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { getPB, modifier } from "src/lib/rules";
import { initiativeModifierFor } from "src/lib/play/initiative";
import {
  CHECK_GROUPS,
  checkForValue,
  checkLabel,
  checkModifier,
} from "src/lib/play/checks";
import { CheckMode, rollD20Check } from "src/lib/roll";
import { usePlayTurn } from "src/lib/play/use-turn";
import { TurnFlowProvider } from "src/lib/play/use-turn-flow";
import { Character } from "src/lib/types";
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
  // back to the picker rather than rendering an empty frame.
  if (!character && !inSession) return <Navigate to="/sheet" replace />;

  return (
    <EditModeContext.Provider value={PLAY_EDIT_MODE}>
      <RollerProvider>
        <TurnFlowProvider>
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
              asks for the total instead. Either way it lands on your row. */}
            {initiativeCalled && !isDm && character && self && (
              <InitiativeCallPrompt
                character={character}
                selfId={self.id}
                setCombatantInitiative={setCombatantInitiative}
                dismiss={dismissInitiativeCall}
              />
            )}
            <RollCallPrompt />
            <IncomingHealingBanner />
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
                    You&apos;re at the table without a character. Open one from
                    the sidebar to play it, or wait for your DM to offer you one
                    or hand one to you.
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

// The answer to the DM's call, in whichever dice the player is using: app mode
// rolls with the sheet's modifier in one click; manual mode takes the total
// the way the table hears it called out. Both write straight to your row.
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
  const [raw, setRaw] = useState("");
  const modifier = initiativeModifierFor(character);
  const parsed = Number(raw);
  const valid = raw.trim() !== "" && Number.isFinite(parsed);
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
            setCombatantInitiative(selfId, Math.floor(parsed));
            dismiss();
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            aria-label="Your initiative total"
            placeholder={`Your total (d20 ${modifier >= 0 ? "+" : ""}${modifier})`}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!valid}>
            Set
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setCombatantInitiative(selfId, rollD20Check(modifier).total);
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
function CheckLauncher({ character }: { character: Character }) {
  const { openRoller } = useRoller();
  return (
    <select
      className="check-launcher"
      aria-label="Roll a check or save"
      value=""
      onChange={(e) => {
        const check = checkForValue(e.target.value);
        if (!check) return;
        openRoller({
          label: checkLabel(check),
          spec: { kind: "check", modifier: checkModifier(character, check) },
        });
      }}
    >
      <option value="">Roll a check…</option>
      {CHECK_GROUPS.map(({ group, options }) => (
        <optgroup key={group} label={group}>
          {options.map(({ value, check }) => (
            <option key={value} value={value}>
              {checkLabel(check)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// "Brakka — give me a Perception check." The DM's ask, routed through the
// tool: answer with one click (or type your real-dice total) and the number
// travels back to the seat. Nothing here closes on being answered — a player
// who rolled before hearing "with advantage" just rolls again, and the seat
// sees both, keyed to the same ask. That is the same bargain the attack
// dialog strikes: never block the re-roll, always show it.
function RollCallPrompt() {
  const { isDm } = useEncounter();
  const { rollCall, dismissRollCall, sendReport } = useTableTalk();
  const { character } = useCharacter();
  const { rollMode } = useRollMode();
  const [raw, setRaw] = useState("");
  const [answered, setAnswered] = useState<{
    callId: string;
    total: number;
    attempt: number;
  } | null>(null);
  if (!rollCall || isDm || !character) return null;

  const label = checkLabel(rollCall.check);
  const mod = checkModifier(character, rollCall.check);
  const sent = answered?.callId === rollCall.callId ? answered : null;
  const send = (
    total: number,
    detail: {
      faces?: number[];
      kept?: number;
      mode?: CheckMode;
      manual?: true;
    },
  ) => {
    const attempt = (sent?.attempt ?? 0) + 1;
    // The ask's own id is the exchange, so a second answer lands under the
    // first rather than arriving as an unrelated number.
    sendReport({
      exchangeId: rollCall.callId,
      stage: "check",
      attempt,
      label,
      total,
      ...detail,
    });
    setAnswered({ callId: rollCall.callId, total, attempt });
  };
  const rollAndSend = (mode: CheckMode) => {
    const rolled = rollD20Check(mod, mode);
    send(rolled.total, {
      faces: rolled.dice,
      kept: rolled.kept,
      mode,
    });
  };

  return (
    <div className="assign-prompt">
      <span>
        Your DM asks for a <strong>{label}</strong>.
      </span>
      {sent && (
        <span>
          You sent <strong>{sent.total}</strong>.
        </span>
      )}
      {rollMode === "manual" ? (
        <form
          className="row roll-manual"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = Number(raw);
            if (!raw.trim() || !Number.isFinite(parsed)) return;
            send(Math.floor(parsed), { manual: true });
            setRaw("");
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            aria-label="Your roll total"
            placeholder={`Your total (d20 ${mod >= 0 ? "+" : ""}${mod})`}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            {sent ? "Send again" : "Send"}
          </button>
        </form>
      ) : (
        <span className="row roll-manual">
          <button type="button" onClick={() => rollAndSend("disadvantage")}>
            Disadv.
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => rollAndSend("normal")}
          >
            {sent ? "Roll again" : "Roll"} ({mod >= 0 ? "+" : ""}
            {mod})
          </button>
          <button type="button" onClick={() => rollAndSend("advantage")}>
            Adv.
          </button>
        </span>
      )}
      <button type="button" onClick={dismissRollCall}>
        {sent ? "Done" : "Not now"}
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
            spec: { kind: "check", modifier: conSave },
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
    <button type="button" className="play-sheet-link" onClick={openRest}>
      <FaCampground />
      <span>Rest</span>
    </button>
  );
}
