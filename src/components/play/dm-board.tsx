import { FormEvent, useState } from "react";
import classNames from "classnames";
import { FaCopy, FaSkullCrossbones, FaXmark } from "react-icons/fa6";
import { copyToClipboard } from "src/lib/browser";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import { inInitiativeOrder, Participant } from "src/lib/play/encounter";
import StepperInput from "src/components/stepper-input";

// The DM's side of the play surface.
//
// A player asks "what can I do right now"; a DM asks "what is the state of
// eight creatures". Same encounter, opposite shape — so this is a roster of
// rows, not the action board with extra buttons. Unlike the player rail, the
// roster here *owns* the order: initiative, adding a fight's worth of monsters,
// and sweeping the dead off the table all live on the rows, so the strip above
// can shrink to the two controls that move the fight along.
//
// Writes here are ordinary encounter edits. For a row whose player is present,
// an HP edit travels to their actual sheet (see `receiveState.ownVitals`) —
// and their own next edit wins, because oversight is not custody.
export default function DmBoard() {
  const {
    encounter,
    inCombat,
    current,
    removeCombatant,
    setCombatantInitiative,
    setCombatantVitals,
    setSheetOffered,
    addCombatant,
    clearFallen,
    fallen,
    clientId,
    sessionCode,
    sessionStatus,
    present,
    assignSheetTo,
  } = useEncounter();

  const order = inCombat
    ? encounter.participants
    : inInitiativeOrder(encounter.participants);
  const nextUp =
    inCombat && encounter.participants.length > 1
      ? encounter.participants[
          (encounter.turnIndex + 1) % encounter.participants.length
        ]
      : undefined;

  return (
    <div className="dm-board">
      {order.length === 0 ? (
        <div className="dm-empty">
          <p className="text-muted">
            The table is empty. Add the party and their opposition below —
            anyone who joins with the code brings their own row.
          </p>
          {sessionStatus === "connected" && sessionCode && (
            <InviteCode code={sessionCode} />
          )}
        </div>
      ) : (
        <ul className="dm-roster">
          {order.map((participant) => (
            <li
              key={participant.id}
              className={classNames("dm-row", {
                active: inCombat && participant.id === current?.id,
                down:
                  participant.vitals !== undefined &&
                  participant.vitals.currHp <= 0,
              })}
            >
              <div className="dm-row-init">
                {inCombat ? (
                  <span className="initiative-score">
                    {participant.initiative}
                  </span>
                ) : (
                  <StepperInput
                    value={participant.initiative}
                    min={-10}
                    ariaLabel={`${participant.name} initiative`}
                    onChange={(value) =>
                      setCombatantInitiative(participant.id, value)
                    }
                  />
                )}
              </div>
              <div className="dm-row-who">
                <span className="dm-row-name">{participant.name}</span>
                {participant.vitals !== undefined &&
                  participant.vitals.currHp <= 0 && (
                    <FaSkullCrossbones
                      className="dm-down-mark"
                      title="Down — at 0 hit points"
                    />
                  )}
                {inCombat && participant.id === nextUp?.id && (
                  <span className="dm-next-chip">next</span>
                )}
                {/* Offering is the deliberate per-sheet act that consents to
                    the whole sheet travelling — bringing it only showed a
                    projection. Once a player picks it up (ownership moves to
                    their client) the offer shows as in play; it reverts when
                    they leave. */}
                {participant.characterUuid &&
                  participant.ownerClientId === clientId && (
                    <>
                      {participant.claimable ? (
                        <button
                          type="button"
                          className="dm-offer-btn offered"
                          title="Withdraw the offer — the sheet stops being available to pick up"
                          onClick={() => setSheetOffered(participant.id, false)}
                        >
                          Offered
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="dm-offer-btn"
                          title="Offer this sheet — a player without a character can pick it up and play it"
                          onClick={() => setSheetOffered(participant.id, true)}
                        >
                          Offer sheet
                        </button>
                      )}
                      {/* The targeted version of the same act. Choosing a
                          player marks the sheet offered and asks them; the
                          sheet only travels when they accept, so pointing at
                          a stale name (a crashed tab we never heard leave)
                          costs nothing — the offer simply stands. */}
                      {present.length > 0 && (
                        <select
                          className="dm-assign-select"
                          aria-label={`Hand ${participant.name} to a player`}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            assignSheetTo(participant.id, e.target.value);
                          }}
                        >
                          <option value="">Hand to…</option>
                          {present.map((client) => (
                            <option
                              key={client.clientId}
                              value={client.clientId}
                            >
                              {client.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                {participant.claimable &&
                  participant.ownerClientId !== clientId && (
                    <span
                      className="dm-in-play"
                      title="A player picked this up"
                    >
                      In play
                    </span>
                  )}
              </div>
              <RowVitals
                participant={participant}
                onChange={(vitals) =>
                  setCombatantVitals(participant.id, vitals)
                }
              />
              <RowConditions participant={participant} />
              <RowConcentration participant={participant} />
              <button
                type="button"
                className="icon-btn dm-row-remove"
                aria-label={`Remove ${participant.name}`}
                title="Remove from the encounter"
                onClick={() => removeCombatant(participant.id)}
              >
                <FaXmark />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="dm-board-tools">
        <AddCombatants
          onAdd={(name, initiative, opts) =>
            addCombatant(name, initiative, opts)
          }
        />
        {fallen.length > 0 && (
          <button
            type="button"
            className="dm-clear-fallen"
            title="Remove every hand-typed combatant at 0 HP"
            onClick={clearFallen}
          >
            <FaSkullCrossbones /> Clear the fallen ({fallen.length})
          </button>
        )}
      </div>
    </div>
  );
}

// The code is the DM's first job — nobody is at the table until it's been
// pasted into the group chat. Shown big at the empty table, the one moment
// it's the whole point of the screen.
function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="dm-invite"
      onClick={async () => {
        await copyToClipboard(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span className="dm-invite-label">
        {copied ? "Copied — send it to your players" : "Copy the invite code"}
      </span>
      <span className="dm-invite-code">
        <code>{code}</code>
        <FaCopy />
      </span>
    </button>
  );
}

// One line adds a fight: a pack of identical monsters shares one initiative
// roll (that's the 5e rule), gets numbered names, and starts tracked the
// moment it has a maximum — no per-row "Track" step afterwards.
function AddCombatants({
  onAdd,
}: {
  onAdd: (
    name: string,
    initiative: number,
    opts: { count: number; maxHp?: number },
  ) => void;
}) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const [hp, setHp] = useState("");
  const [initiative, setInitiative] = useState(10);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const maxHp = Number(hp);
    onAdd(name.trim(), initiative, {
      count,
      maxHp: maxHp > 0 ? maxHp : undefined,
    });
    setName("");
    setCount(1);
    setHp("");
  };

  return (
    <form className="dm-add" onSubmit={submit}>
      <input
        type="text"
        className="dm-add-name"
        aria-label="Combatant name"
        placeholder="Add a combatant"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="dm-add-field">
        <span>×</span>
        <StepperInput
          value={count}
          min={1}
          ariaLabel="How many"
          onChange={setCount}
        />
      </label>
      <input
        type="text"
        inputMode="numeric"
        className="dm-hp-input"
        aria-label="Hit points each (optional)"
        placeholder="HP each"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
      />
      <label className="dm-add-field">
        <span>Init</span>
        <StepperInput
          value={initiative}
          min={-10}
          ariaLabel="Initiative"
          onChange={setInitiative}
        />
      </label>
      <button type="submit" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

function RowVitals({
  participant,
  onChange,
}: {
  participant: Participant;
  onChange: (vitals: { currHp: number; maxHp: number; ac: number }) => void;
}) {
  const [maxInput, setMaxInput] = useState("");
  const vitals = participant.vitals;

  // A hand-typed combatant has no sheet anywhere, so its HP starts existing the
  // moment the DM writes a maximum down — same as jotting it next to the name
  // on paper.
  if (!vitals) {
    return (
      <form
        className="dm-row-vitals"
        onSubmit={(e) => {
          e.preventDefault();
          const max = Number(maxInput);
          if (!(max > 0)) return;
          onChange({ currHp: max, maxHp: max, ac: 0 });
          setMaxInput("");
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          className="dm-hp-input"
          aria-label={`${participant.name} max HP`}
          placeholder="max HP"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
        />
        <button type="submit" disabled={!(Number(maxInput) > 0)}>
          Track
        </button>
      </form>
    );
  }

  return (
    <div className="dm-row-vitals">
      <StepperInput
        value={vitals.currHp}
        min={0}
        ariaLabel={`${participant.name} hit points`}
        onChange={(currHp) => onChange({ ...vitals, currHp })}
      />
      <span className="dm-hp-max">/ {vitals.maxHp}</span>
      {vitals.ac > 0 && <span className="dm-row-ac">AC {vitals.ac}</span>}
    </div>
  );
}

function RowConditions({ participant }: { participant: Participant }) {
  const { giveCondition, takeCondition } = useEncounter();
  const [rounds, setRounds] = useState("");
  const held = new Set(participant.conditions.map((c) => c.name));

  return (
    <div className="dm-row-conditions">
      {participant.conditions.map((condition) => (
        <span key={condition.name} className="condition-chip">
          <span>{condition.name}</span>
          {condition.rounds !== undefined && (
            <span className="condition-rounds">{condition.rounds}</span>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${condition.name} from ${participant.name}`}
            onClick={() => takeCondition(participant.id, condition.name)}
          >
            <FaXmark />
          </button>
        </span>
      ))}
      {/* The select applies immediately on choose — a DM does this a dozen
          times a night, and select-then-confirm doubles every one of them. The
          rounds box seeds the *next* pick, matching how the thought runs:
          "stunned for one round". */}
      <select
        aria-label={`Give ${participant.name} a condition`}
        value=""
        onChange={(e) => {
          if (!e.target.value) return;
          const parsed = Number(rounds);
          giveCondition(participant.id, {
            name: e.target.value,
            rounds: rounds.trim() && parsed > 0 ? parsed : undefined,
          });
          setRounds("");
        }}
      >
        <option value="">+ condition</option>
        {CONDITION_NAMES.filter((name) => !held.has(name)).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        className="condition-rounds-input"
        aria-label={`Rounds for the next condition on ${participant.name}`}
        placeholder="rds"
        value={rounds}
        onChange={(e) => setRounds(e.target.value)}
      />
    </div>
  );
}

function RowConcentration({ participant }: { participant: Participant }) {
  const { concentrateOn, encounter } = useEncounter();
  const [spell, setSpell] = useState("");

  if (participant.concentration) {
    return (
      <div className="dm-row-concentration">
        <span className="concentration-spell">
          {participant.concentration.spell}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${participant.name} drops concentration`}
          title="Drop concentration"
          onClick={() => concentrateOn(participant.id, undefined)}
        >
          <FaXmark />
        </button>
      </div>
    );
  }

  return (
    <form
      className="dm-row-concentration"
      onSubmit={(e) => {
        e.preventDefault();
        if (!spell.trim()) return;
        concentrateOn(participant.id, {
          spell: spell.trim(),
          startedRound: Math.max(1, encounter.round),
        });
        setSpell("");
      }}
    >
      <input
        type="text"
        aria-label={`${participant.name} concentrating on`}
        placeholder="concentration"
        value={spell}
        onChange={(e) => setSpell(e.target.value)}
      />
    </form>
  );
}
