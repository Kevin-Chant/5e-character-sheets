import { FormEvent, useEffect, useState } from "react";
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
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { CONDITION_NAMES } from "src/lib/play/conditions";
import {
  applyDamage,
  applyHealing,
  concentrationDc,
  inInitiativeOrder,
  Participant,
  ParticipantVitals,
  SHARING_LABELS,
  SHARING_LEVELS,
  SharingLevel,
} from "src/lib/play/encounter";
import {
  beatsAc,
  Exchange,
  exchanges,
  ExchangeStage,
  formatFaces,
  ReportedDamage,
  RollReport,
  RollVerdict,
} from "src/lib/play/reports";
import { CHECK_GROUPS, checkForValue, checkLabel } from "src/lib/play/checks";
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
    setCombatantHidden,
    sharing,
    setSharingLevel,
    hideDeathSaves,
    setDeathSavesHidden,
  } = useEncounter();
  const {
    reports,
    dismissExchange,
    clearReports,
    ruleOnAttack,
    verdicts,
    offerHealing,
    callForRoll,
  } = useTableTalk();

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
      {/* What the table has rolled, as it rolls it. One card per act, so an
          attack reads as the small conversation it is — the to-hit against
          the target's AC, then the damage — instead of two bare numbers
          arriving a minute apart with nothing tying them together. Applying
          goes through the same write as the row's own stepper (concentration
          reminders included); the amount is editable first, because "I'm
          halving that, it saved" is a table's most common override. */}
      {reports.length > 0 && (
        <div className="dm-report-queue">
          <div className="row space-between dm-queue-head">
            <span className="text-muted">Rolls at the table</span>
            <button type="button" onClick={clearReports}>
              Clear all
            </button>
          </div>
          <ul className="dm-damage-queue">
            {exchanges(reports).map((exchange) => (
              <ExchangeCard
                key={exchange.exchangeId}
                exchange={exchange}
                target={encounter.participants.find(
                  (p) => p.id === exchange.targetId,
                )}
                verdict={verdicts[exchange.exchangeId]}
                onRule={(outcome) =>
                  ruleOnAttack(
                    exchange.exchangeId,
                    exchange.fromClientId,
                    outcome,
                  )
                }
                onApply={applyVitals}
                onOfferHealing={offerHealing}
                onDone={() => dismissExchange(exchange.exchangeId)}
              />
            ))}
          </ul>
        </div>
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
                apply={(vitals, dealt) =>
                  applyVitals(participant, vitals, dealt)
                }
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

      {/* "Brakka, give me a Perception check" — the ask routed through the
          tool. Everyone, or one present player; the answers land in the
          queue above. */}
      {sessionStatus === "connected" && (
        <RollCallForm present={present} callForRoll={callForRoll} />
      )}

      {/* Table visibility, the DM's call, grouped in one place: how much
          health the players see, and whether death saves are the table's
          drama or private. On the encounter so it reaches every client — and
          here as well as in Settings → Game because the moment a DM decides
          to tighten it is mid-session. */}
      <div className="dm-visibility">
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
        <label className="dm-sharing">
          <input
            type="checkbox"
            checked={!hideDeathSaves}
            onChange={(e) => setDeathSavesHidden(!e.target.checked)}
            aria-label="Party sees death saves"
          />
          <span className="text-muted">Party sees death saves</span>
        </label>
      </div>
    </div>
  );
}

// The DM's side of a roll call: pick the d20, pick who rolls (the whole
// table by default), ask. The prompt lands like the initiative call and the
// answers come back as reports.
function RollCallForm({
  present,
  callForRoll,
}: {
  present: { clientId: string; name: string }[];
  callForRoll: (
    check: NonNullable<ReturnType<typeof checkForValue>>,
    toClientId?: string,
  ) => void;
}) {
  const [checkValue, setCheckValue] = useState("");
  const [audience, setAudience] = useState("");
  return (
    <form
      className="dm-roll-call"
      onSubmit={(e) => {
        e.preventDefault();
        const check = checkForValue(checkValue);
        if (!check) return;
        callForRoll(check, audience || undefined);
        setCheckValue("");
      }}
    >
      <span className="text-muted">Ask for a roll</span>
      <select
        aria-label="Which check or save to ask for"
        value={checkValue}
        onChange={(e) => setCheckValue(e.target.value)}
      >
        <option value="">Check or save…</option>
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
      <select
        aria-label="Who should roll"
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
      >
        <option value="">Everyone</option>
        {present.map((client) => (
          <option key={client.clientId} value={client.clientId}>
            {client.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!checkValue}>
        Ask
      </button>
    </form>
  );
}

// One act at the table, waiting on a ruling: who rolled what at whom, with
// every stage of it and every re-roll of every stage. A target that has left
// the fight, or was never tracked, still shows — the card tells the DM what
// happened, it just has nowhere to land.
//
// Approving healing splits by who owns the target: a hand-typed row is the
// DM's, so it applies directly; a character-backed row belongs to a player,
// so approval sends an offer and *they* apply it to their own sheet.
function ExchangeCard({
  exchange,
  target,
  verdict,
  onRule,
  onApply,
  onOfferHealing,
  onDone,
}: {
  exchange: Exchange;
  target?: Participant;
  verdict?: RollVerdict["outcome"];
  onRule: (outcome: RollVerdict["outcome"]) => void;
  onApply: (
    participant: Participant,
    vitals: ParticipantVitals,
    damageDealt: number,
  ) => void;
  onOfferHealing: (
    targetId: string,
    amount: number,
    fromName: string,
    label?: string,
  ) => void;
  onDone: () => void;
}) {
  return (
    <li className="dm-exchange">
      <div className="dm-exchange-head">
        <strong>{exchange.fromName}</strong>
        {exchange.targetName && (
          <>
            <span className="dm-exchange-arrow">→</span>
            <strong>{exchange.targetName}</strong>
          </>
        )}
        <span className="dm-exchange-label">{exchange.label}</span>
        {target && !target.vitals && (
          <span className="text-muted"> — untracked, give it HP first</span>
        )}
        {exchange.targetId && !target && (
          <span className="text-muted"> — no longer in the order</span>
        )}
        <button
          type="button"
          className="icon-btn dm-row-remove"
          aria-label={`Dismiss ${exchange.fromName}'s ${exchange.label}`}
          onClick={onDone}
        >
          <FaXmark />
        </button>
      </div>
      {exchange.stages.map((stage) => (
        <StageRow
          key={stage.stage}
          stage={stage}
          target={target}
          fromName={exchange.fromName}
          verdict={verdict}
          onRule={onRule}
          onApply={onApply}
          onOfferHealing={onOfferHealing}
          onResolved={onDone}
        />
      ))}
    </li>
  );
}

function StageRow({
  stage,
  target,
  fromName,
  verdict,
  onRule,
  onApply,
  onOfferHealing,
  onResolved,
}: {
  stage: ExchangeStage;
  target?: Participant;
  fromName: string;
  verdict?: RollVerdict["outcome"];
  onRule: (outcome: RollVerdict["outcome"]) => void;
  onApply: (
    participant: Participant,
    vitals: ParticipantVitals,
    damageDealt: number,
  ) => void;
  onOfferHealing: (
    targetId: string,
    amount: number,
    fromName: string,
    label?: string,
  ) => void;
  onResolved: () => void;
}) {
  const roll = stage.latest;
  const heals = stage.stage === "healing";
  return (
    <div className="dm-exchange-stage">
      <span className="dm-stage-name">{STAGE_LABELS[stage.stage]}</span>
      <span className="dm-stage-total">{roll.total}</span>
      <RollDetail roll={roll} />
      {/* The re-roll trail. Nothing was blocked and nothing is being accused
          — but a number that was rolled twice says so, which is the only
          honesty this layer can offer and, at most tables, the only one it
          needs. */}
      {stage.superseded.length > 0 && (
        <span className="dm-stage-rerolled" title="Rolled more than once">
          re-rolled ×{stage.superseded.length} — was{" "}
          {stage.superseded.map((r) => r.total).join(", ")}
        </span>
      )}
      {stage.stage === "toHit" && (
        <ToHitRuling
          roll={roll}
          target={target}
          verdict={verdict}
          onRule={onRule}
        />
      )}
      {(stage.stage === "damage" || heals) && target?.vitals && (
        <ApplyAmount
          roll={roll}
          target={target}
          fromName={fromName}
          healing={heals}
          onApply={onApply}
          onOfferHealing={onOfferHealing}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}

const STAGE_LABELS: Record<ExchangeStage["stage"], string> = {
  toHit: "To hit",
  damage: "Damage",
  healing: "Healing",
  check: "Check",
};

// Everything about a roll that isn't its total: the faces behind it, whether
// it was a crit, the save it has to beat, what it's made of. Most of this
// never used to leave the roller's screen, which left the DM ruling on
// resistance, save DCs and once-per-turn riders from memory.
function RollDetail({ roll }: { roll: RollReport }) {
  const faces = formatFaces(roll);
  return (
    <span className="dm-stage-detail text-muted">
      {faces && <span>{faces}</span>}
      {roll.critical && <span className="dm-stage-chip crit">crit</span>}
      {roll.fumble && <span className="dm-stage-chip">nat 1</span>}
      {roll.crit && <span className="dm-stage-chip crit">critical damage</span>}
      {roll.manual && (
        <span
          className="dm-stage-chip"
          title="Typed from real dice, not rolled by the app"
        >
          typed
        </span>
      )}
      {roll.save && (
        <span className="dm-stage-chip save">
          DC {roll.save.dc}
          {roll.save.stat ? ` ${roll.save.stat.toUpperCase()}` : ""}
          {roll.save.onSuccess === "half"
            ? " — half on a save"
            : roll.save.onSuccess === "none"
              ? " — none on a save"
              : ""}
        </span>
      )}
      {/* Itemised only when the breakdown says something the total doesn't:
          one untyped lump of slashing beside the number "7" is just "7"
          twice. Two types, or a rider carrying its source, is a ruling. */}
      {itemised(roll).map((part, i) => (
        <span key={`${part.source ?? part.damageType ?? i}`}>
          {part.total} {part.damageType ?? "damage"}
          {part.source ? ` (${part.source})` : ""}
        </span>
      ))}
    </span>
  );
}

// The damage lines worth printing: nothing when the whole roll is one plain
// lump (the total already said it), everything otherwise.
function itemised(roll: RollReport): ReportedDamage[] {
  const parts = roll.parts?.filter((p) => p.total > 0) ?? [];
  if (parts.length <= 1 && !parts.some((p) => p.source)) return [];
  return parts;
}

// "15 against AC 13 — that hits." The ruling that used to be a sentence
// shouted across the table, and the reason a player had to stop between two
// halves of their own attack. Advisory in both directions: the app offers an
// opinion from the AC it knows, and the DM's answer is the one that counts —
// a Shield reaction turns a hit into a miss and the button says so.
function ToHitRuling({
  roll,
  target,
  verdict,
  onRule,
}: {
  roll: RollReport;
  target?: Participant;
  verdict?: RollVerdict["outcome"];
  onRule: (outcome: RollVerdict["outcome"]) => void;
}) {
  const ac = target?.vitals?.ac;
  const opinion = beatsAc(roll.total, ac);
  return (
    <span className="dm-stage-ruling">
      {ac ? (
        <span
          className={classNames("dm-vs-ac", {
            hits: opinion === "hits",
            misses: opinion === "misses",
          })}
        >
          vs AC {ac} — {opinion}
        </span>
      ) : (
        <span className="text-muted">no AC on record</span>
      )}
      {verdict ? (
        <span className="dm-ruled">
          you said <strong>{verdict}</strong>
        </span>
      ) : (
        <>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onRule("hit")}
          >
            Hit
          </button>
          <button type="button" onClick={() => onRule("miss")}>
            Miss
          </button>
        </>
      )}
    </span>
  );
}

// The applyable half, unchanged in spirit: an editable amount (override
// before applying) and one button. Damage drains temp HP first; healing on a
// character-backed row becomes an offer its owner applies themselves.
function ApplyAmount({
  roll,
  target,
  fromName,
  healing,
  onApply,
  onOfferHealing,
  onResolved,
}: {
  roll: RollReport;
  target: Participant;
  fromName: string;
  healing: boolean;
  onApply: (
    participant: Participant,
    vitals: ParticipantVitals,
    damageDealt: number,
  ) => void;
  onOfferHealing: (
    targetId: string,
    amount: number,
    fromName: string,
    label?: string,
  ) => void;
  // Applying resolves the whole act, not just this line: the number has
  // landed, so the card comes off the queue. With every roll at the table
  // arriving here, a queue that only grew would be unreadable by round three.
  onResolved: () => void;
}) {
  const [amount, setAmount] = useState(String(roll.total));
  // A re-roll is a new number; a box still holding the old one would be a trap.
  useEffect(() => setAmount(String(roll.total)), [roll.reportId]);

  const parsed = Number(amount);
  const offersInstead = healing && !!target.characterUuid;
  const vitals = target.vitals!;

  return (
    <span className="dm-stage-ruling">
      <input
        type="text"
        inputMode="numeric"
        className="dm-hp-input"
        aria-label={`${healing ? "Healing" : "Damage"} to apply to ${target.name}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={!(parsed > 0)}
        title={
          offersInstead
            ? "Send it on — the player applies it to their own sheet"
            : undefined
        }
        onClick={() => {
          if (!(parsed > 0)) return;
          if (healing) {
            if (offersInstead)
              onOfferHealing(target.id, parsed, fromName, roll.label);
            else onApply(target, applyHealing(vitals, parsed), 0);
          } else {
            onApply(target, applyDamage(vitals, parsed), Math.floor(parsed));
          }
          onResolved();
        }}
      >
        {offersInstead ? "Approve" : "Apply"}
        {parsed > 0 && parsed !== roll.total ? ` ${parsed}` : ""}
      </button>
    </span>
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
  apply,
}: {
  participant: Participant;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
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
          apply({ currHp: max, maxHp: max, ac: 0 });
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
      <DamageEntry participant={participant} apply={apply} />
      <HpDisplay participant={participant} apply={apply} />
      {/* Death-save progress rides the projection while someone is making
          them. The DM always sees it — the party toggle below never gates
          this board. */}
      {vitals.deathSaves && (
        <span
          className="dm-death-saves"
          title="Death saving throws — successes · failures"
        >
          {vitals.deathSaves.successes}✓ {vitals.deathSaves.failures}✗
        </span>
      )}
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
        <AcInput participant={participant} apply={apply} />
      )}
    </div>
  );
}

// The primary HP write, in the words a table uses: "the goblin takes 9",
// "you regain 10" — a delta, never a recomputed absolute. Damage drains temp
// HP first (same arithmetic as an accepted report) and feeds the concentration
// reminder; a leading + heals instead. Enter applies, like the concentration
// box two cells over.
function DamageEntry({
  participant,
  apply,
}: {
  participant: Participant;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const vitals = participant.vitals!;
  return (
    <form
      className="dm-damage-entry"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = raw.trim();
        const heals = trimmed.startsWith("+");
        const amount = Number(heals ? trimmed.slice(1) : trimmed);
        if (!(amount > 0)) return;
        if (heals) apply(applyHealing(vitals, amount), 0);
        else apply(applyDamage(vitals, amount), Math.floor(amount));
        setRaw("");
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        className="dm-damage-input"
        aria-label={`Damage to ${participant.name}`}
        placeholder="dmg"
        title="Damage dealt — temp HP soaks first. Type +N to heal. Enter applies."
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
    </form>
  );
}

// The current total, doubling as the escape hatch: the number is a button, and
// clicking it opens a direct "set HP to exactly this" edit for the corrections
// deltas can't express cleanly (a stat-block fix, an undo by hand).
function HpDisplay({
  participant,
  apply,
}: {
  participant: Participant;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const vitals = participant.vitals!;
  if (!editing) {
    return (
      <button
        type="button"
        className="dm-hp-display"
        title="Set hit points directly"
        aria-label={`Set ${participant.name} hit points directly`}
        onClick={() => setEditing(true)}
      >
        {vitals.currHp}
        <span className="dm-hp-max">/ {vitals.maxHp}</span>
      </button>
    );
  }
  return (
    <AbsoluteHpInput
      participant={participant}
      apply={apply}
      done={() => setEditing(false)}
    />
  );
}

function AbsoluteHpInput({
  participant,
  apply,
  done,
}: {
  participant: Participant;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
  done: () => void;
}) {
  const vitals = participant.vitals!;
  const { inputProps } = useDeferredNumber({
    value: vitals.currHp,
    min: 0,
    onCommit: (currHp) => apply({ ...vitals, currHp }),
  });
  return (
    <input
      type="text"
      inputMode="numeric"
      className="dm-hp-input"
      aria-label={`${participant.name} hit points`}
      autoFocus
      {...inputProps}
      onBlur={() => {
        inputProps.onBlur();
        done();
      }}
      onKeyDown={(e) => {
        inputProps.onKeyDown(e);
        if (e.key === "Enter" || e.key === "Escape") done();
      }}
    />
  );
}

// AC for a hand-typed combatant, editable in place. Zero shows as an empty
// box rather than "AC 0" — unset, not naked.
function AcInput({
  participant,
  apply,
}: {
  participant: Participant;
  apply: (vitals: ParticipantVitals, damageDealt?: number) => void;
}) {
  const vitals = participant.vitals!;
  const { inputProps } = useDeferredNumber({
    value: vitals.ac,
    min: 0,
    onCommit: (ac) => apply({ ...vitals, ac }, 0),
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
