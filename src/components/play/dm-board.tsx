import { FormEvent, useState } from "react";
import classNames from "classnames";
import {
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaSkullCrossbones,
  FaXmark,
} from "react-icons/fa6";
import { copyToClipboard } from "src/lib/browser";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import {
  applyDamage,
  concentrationDc,
  inInitiativeOrder,
  Participant,
  ParticipantVitals,
  SHARING_LABELS,
  SHARING_LEVELS,
  SharingLevel,
} from "src/lib/play/encounter";
import { DamageReport } from "src/lib/play/session";
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
    damageReports,
    dismissDamageReport,
    setCombatantHidden,
    sharing,
    setSharingLevel,
  } = useEncounter();

  // Concentration checks this board has noticed and the table hasn't answered:
  // participant id → save DC. Local UI state — the *reminder* is this DM's,
  // even though the damage that caused it is everyone's.
  const [conChecks, setConChecks] = useState<Record<string, number>>({});

  // Every HP write on this board goes through here, so damage landing on a
  // concentrating creature raises the DC 10-or-half-damage reminder no matter
  // which control dealt it — the row's stepper or an accepted report.
  const applyVitals = (
    participant: Participant,
    vitals: ParticipantVitals,
    // Known for an applied report; derived from the pools' drop otherwise.
    // Temp HP counts — 5e keys the check off damage taken, absorbed or not.
    damageDealt?: number,
  ) => {
    const before = participant.vitals;
    const dealt =
      damageDealt ??
      (before
        ? Math.max(0, before.currHp - vitals.currHp) +
          Math.max(0, (before.tempHp ?? 0) - (vitals.tempHp ?? 0))
        : 0);
    if (participant.concentration && dealt > 0) {
      setConChecks((current) => ({
        ...current,
        [participant.id]: concentrationDc(dealt),
      }));
    }
    setCombatantVitals(participant.id, vitals);
  };
  const resolveConCheck = (id: string) =>
    setConChecks((current) => {
      const { [id]: _, ...rest } = current;
      return rest;
    });

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
      {/* Rolled damage waiting on a ruling. Applying goes through the same
          write as the row's own stepper (concentration reminders included);
          the amount is editable first, because "I'm halving that, it saved"
          is a table's most common override. */}
      {damageReports.length > 0 && (
        <ul className="dm-damage-queue">
          {damageReports.map((report) => (
            <DamageReportRow
              key={report.reportId}
              report={report}
              target={encounter.participants.find(
                (p) => p.id === report.targetId,
              )}
              onApply={applyVitals}
              onDone={() => dismissDamageReport(report.reportId)}
            />
          ))}
        </ul>
      )}
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
                staged: participant.hidden,
              })}
            >
              {/* Labelled, because the HP stepper two inches away is its
                  visual twin — on a phone, damage typed into this box quietly
                  re-sorts the roster "by HP". Editable in combat too: a pack
                  added on one roll can be split after the fact, and the row
                  re-seats to where the new number says. */}
              <label className="dm-row-init dm-field-label">
                <span>Init</span>
                <StepperInput
                  value={participant.initiative}
                  min={-10}
                  ariaLabel={`${participant.name} initiative`}
                  onChange={(value) =>
                    setCombatantInitiative(participant.id, value)
                  }
                />
              </label>
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
                {/* Staging: the ambush the players haven't seen yet. Only for
                    hand-typed rows — a character-backed row is somebody's
                    seat at the table, not a surprise to spring. */}
                {!participant.characterUuid && (
                  <button
                    type="button"
                    className="icon-btn dm-hide-btn"
                    aria-label={
                      participant.hidden
                        ? `Reveal ${participant.name}`
                        : `Hide ${participant.name} from players`
                    }
                    title={
                      participant.hidden
                        ? "Hidden from players — click to reveal"
                        : "Hide from players until it strikes"
                    }
                    onClick={() =>
                      setCombatantHidden(participant.id, !participant.hidden)
                    }
                  >
                    {participant.hidden ? <FaEyeSlash /> : <FaEye />}
                  </button>
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
                onChange={(vitals) => applyVitals(participant, vitals)}
              />
              <RowConditions participant={participant} />
              <RowConcentration
                participant={participant}
                conDc={conChecks[participant.id]}
                onConResolved={() => resolveConCheck(participant.id)}
              />
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

      {/* Table style, the DM's call: how much health the players see of each
          other and of the monsters. It lives on the encounter so it reaches
          every client — and it's here as well as in Settings → Game because
          the moment a DM decides to tighten it is mid-session. */}
      <label className="dm-sharing">
        <span className="text-muted">Players see</span>
        <select
          aria-label="What players see of the table's health"
          value={sharing}
          onChange={(e) => setSharingLevel(e.target.value as SharingLevel)}
        >
          {SHARING_LEVELS.map((level) => (
            <option key={level} value={level}>
              {SHARING_LABELS[level]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

// One rolled hit, waiting on a ruling: who rolled what at whom, an editable
// amount (override before applying), Apply, Ignore. A target that has left
// the fight, or was never tracked, leaves only Ignore — the report still
// tells the DM what happened, it just has nowhere to land.
function DamageReportRow({
  report,
  target,
  onApply,
  onDone,
}: {
  report: DamageReport;
  target?: Participant;
  onApply: (
    participant: Participant,
    vitals: ParticipantVitals,
    damageDealt: number,
  ) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(report.amount));
  const parsed = Number(amount);
  const applicable = !!target?.vitals && parsed > 0;

  return (
    <li className="dm-damage-report">
      <span className="dm-damage-text">
        <strong>{report.fromName}</strong> rolled{" "}
        <strong>{report.amount}</strong> ({report.label}) at{" "}
        <strong>{report.targetName}</strong>
        {!target && " — no longer in the order"}
        {target && !target.vitals && " — untracked, give it HP first"}
      </span>
      {target?.vitals && (
        <input
          type="text"
          inputMode="numeric"
          className="dm-hp-input"
          aria-label={`Damage to apply to ${report.targetName}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={!applicable}
        onClick={() => {
          if (!target?.vitals) return;
          // A delta, the way tables speak it — temp HP absorbs first.
          onApply(
            target,
            applyDamage(target.vitals, parsed),
            Math.floor(parsed),
          );
          onDone();
        }}
      >
        Apply{parsed > 0 && parsed !== report.amount ? ` ${parsed}` : ""}
      </button>
      <button type="button" onClick={onDone}>
        Ignore
      </button>
    </li>
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
    opts: { count: number; maxHp?: number; ac?: number },
  ) => void;
}) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(1);
  const [hp, setHp] = useState("");
  const [ac, setAc] = useState("");
  const [initiative, setInitiative] = useState(10);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const maxHp = Number(hp);
    const armorClass = Number(ac);
    onAdd(name.trim(), initiative, {
      count,
      maxHp: maxHp > 0 ? maxHp : undefined,
      ac: armorClass > 0 ? armorClass : undefined,
    });
    setName("");
    setCount(1);
    setHp("");
    setAc("");
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
      <input
        type="text"
        inputMode="numeric"
        className="dm-ac-input"
        aria-label="Armor class (optional)"
        placeholder="AC"
        title="Tracked with HP — give the pack hit points and this sticks"
        value={ac}
        onChange={(e) => setAc(e.target.value)}
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
      {(vitals.tempHp ?? 0) > 0 && (
        <span
          className="dm-temp"
          title="Temporary hit points — damage drains these first"
        >
          +{vitals.tempHp}
        </span>
      )}
      {participant.characterUuid ? (
        // A character's AC derives from its own sheet — the projection is
        // read-only here, and a DM edit would be overwritten on its next
        // publish anyway.
        vitals.ac > 0 && <span className="dm-row-ac">AC {vitals.ac}</span>
      ) : (
        <AcInput participant={participant} onChange={onChange} />
      )}
    </div>
  );
}

// AC for a hand-typed combatant, editable in place. Zero shows as an empty
// box rather than "AC 0" — unset, not naked.
function AcInput({
  participant,
  onChange,
}: {
  participant: Participant;
  onChange: (vitals: { currHp: number; maxHp: number; ac: number }) => void;
}) {
  const vitals = participant.vitals!;
  const { inputProps } = useDeferredNumber({
    value: vitals.ac,
    min: 0,
    onCommit: (ac) => onChange({ ...vitals, ac }),
  });
  return (
    <label className="dm-field-label">
      <span>AC</span>
      <input
        type="text"
        inputMode="numeric"
        className="dm-ac-input"
        aria-label={`${participant.name} armor class`}
        {...inputProps}
        value={inputProps.value === "0" ? "" : inputProps.value}
      />
    </label>
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

function RowConcentration({
  participant,
  conDc,
  onConResolved,
}: {
  participant: Participant;
  // A pending concentration check from damage this board applied. Advisory:
  // the DM rolls the die (or has the player roll it) and reports the outcome
  // with one of the two buttons.
  conDc?: number;
  onConResolved?: () => void;
}) {
  const { concentrateOn, encounter } = useEncounter();
  const [spell, setSpell] = useState("");

  if (participant.concentration) {
    return (
      <div className="dm-row-concentration">
        <span className="concentration-spell">
          {participant.concentration.spell}
        </span>
        {conDc !== undefined ? (
          <span className="dm-con-check">
            <span>CON DC {conDc}</span>
            <button type="button" onClick={onConResolved}>
              Kept
            </button>
            <button
              type="button"
              onClick={() => {
                concentrateOn(participant.id, undefined);
                onConResolved?.();
              }}
            >
              Broke
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label={`${participant.name} drops concentration`}
            title="Drop concentration"
            onClick={() => concentrateOn(participant.id, undefined)}
          >
            <FaXmark />
          </button>
        )}
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
