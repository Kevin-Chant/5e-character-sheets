import { FormEvent, useEffect, useState } from "react";
import classNames from "classnames";
import {
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaGear,
  FaSkullCrossbones,
  FaXmark,
} from "react-icons/fa6";
import { copyToClipboard } from "src/lib/browser";
import { conditionSummary } from "src/lib/play/condition-mechanics";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import {
  applyDamage,
  applyHealing,
  concentrationDc,
  inInitiativeOrder,
  isFoe,
  Participant,
  ParticipantVitals,
  SHARING_LABELS,
} from "src/lib/play/encounter";
import {
  beatsAc,
  Exchange,
  exchanges,
  ExchangeStage,
  formatFaces,
  impliedModifier,
  ReportedDamage,
  RollReport,
  RollVerdict,
} from "src/lib/play/reports";
import { inviteLink } from "src/lib/play/session";
import {
  LIVENESS_LABEL,
  LIVENESS_TITLE,
  participantLiveness,
} from "src/lib/play/liveness";
import StepperInput from "src/components/stepper-input";
import ConditionsControl from "./conditions-control";
import ConcentrationCell from "./concentration-cell";
import { RestCallForm, RollCallForm } from "./table-calls";
import TableSettingsModal from "./table-settings-modal";
import { HpTotal, VitalsEntry } from "./vitals-entry";

// The DM's side of the play surface: a roster of rows (not the player action
// board) that owns initiative, adding monsters, and sweeping the dead.
// Writes are ordinary encounter edits; for a row with a present player, an
// HP edit travels to their actual sheet (see `receiveState.ownVitals`), and
// their own next edit wins.
export default function DmBoard() {
  const {
    encounter,
    inCombat,
    current,
    removeCombatant,
    setCombatantInitiative,
    setCombatantVitals,
    addCombatant,
    clearFallen,
    fallen,
    clientId,
    sessionCode,
    sessionStatus,
    present,
    quietClients,
    setCombatantHidden,
    setCombatantSide,
    sharing,
  } = useEncounter();
  const {
    reports,
    dismissExchange,
    clearReports,
    ruleOnAttack,
    verdicts,
    offerHealing,
    callForRoll,
    callForRest,
  } = useTableTalk();

  const [tableSettingsOpen, setTableSettingsOpen] = useState(false);
  // Pending concentration checks: participant id → save DC. Local UI state.
  const [conChecks, setConChecks] = useState<Record<string, number>>({});

  // All HP writes route through here so the DC 10-or-half-damage reminder
  // fires regardless of source (row stepper or accepted report).
  const applyVitals = (
    participant: Participant,
    vitals: ParticipantVitals,
    // Known for an applied report; derived from the pools' drop otherwise.
    // Temp HP counts toward damage taken per 5e's concentration rule.
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

  const pending = exchanges(reports);
  // A lane of its own once there are players to roll: a ruling accepted from
  // a card above the roster used to reflow every row under the cursor that
  // accepted it. Absent when nobody can send one (solo prep), where it would
  // only be an empty column.
  const rulingLane = sessionStatus === "connected" && (
    <aside className="dm-rulings">
      <div className="row space-between dm-queue-head">
        <span className="text-muted">
          Waiting on you {pending.length > 0 && `(${pending.length})`}
        </span>
        {pending.length > 0 && (
          <button type="button" onClick={clearReports}>
            Clear all
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="dm-rulings-empty text-muted">
          Rolls your players make land here in the order they arrive. Nothing
          else moves when they do.
        </p>
      ) : (
        // One card per act (to-hit then damage grouped). Amount is editable
        // before applying.
        <ul className="dm-damage-queue">
          {pending.map((exchange) => (
            <ExchangeCard
              key={exchange.exchangeId}
              exchange={exchange}
              participants={encounter.participants}
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
      )}
    </aside>
  );

  return (
    <div className={classNames("dm-board", { "has-rulings": !!rulingLane })}>
      {rulingLane}
      <div className="dm-board-main">
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
            {/* Column captions for the aligned layout. Hidden from assistive
              tech: every cell below carries its own label, and the roster
              restacks out of columns on a narrow screen. */}
            <li className="dm-roster-head" aria-hidden="true">
              <span>Init</span>
              <span>Combatant</span>
              <span>Hit points</span>
              <span>AC</span>
              <span>Conditions</span>
              <span>Concentration</span>
              <span />
            </li>
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
                {/* Editable in combat: the row re-seats when the number changes. */}
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
                  <LivenessChip
                    participant={participant}
                    clientId={clientId}
                    present={present}
                    quietClients={quietClients}
                    connected={sessionStatus === "connected"}
                  />
                  {/* Staging (hide from players) only applies to hand-typed rows. */}
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
                  {/* Side defaults from the sheet heuristic (no sheet → foe); flips with a click. */}
                  <button
                    type="button"
                    className={classNames("dm-side-btn", {
                      foe: isFoe(participant),
                    })}
                    aria-label={`Mark ${participant.name} as ${isFoe(participant) ? "party" : "a foe"}`}
                    title={
                      isFoe(participant)
                        ? "A foe — players see it in their target strip. Click to mark it party."
                        : "Party — kept out of the players' target strip. Click to mark it a foe."
                    }
                    onClick={() =>
                      setCombatantSide(
                        participant.id,
                        isFoe(participant) ? "party" : "foe",
                      )
                    }
                  >
                    {isFoe(participant) ? "Foe" : "Party"}
                  </button>
                  {/* Offering and handing out live in Table settings; the row
                    only reports where a sheet ended up. */}
                  {participant.claimable &&
                    participant.ownerClientId === clientId && (
                      <span className="dm-in-play" title="Offered for pickup">
                        Offered
                      </span>
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
                {/* Same controls as the player rail, in a narrower box. */}
                <div className="dm-row-conditions">
                  <ConditionsControl participant={participant} />
                </div>
                <div className="dm-row-concentration">
                  <ConcentrationCell
                    participant={participant}
                    checkDc={conChecks[participant.id]}
                    onCheckResolved={() => resolveConCheck(participant.id)}
                  />
                </div>
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

        {/* Answers land in the ruling lane. */}
        {sessionStatus === "connected" && (
          <RollCallForm present={present} callForRoll={callForRoll} />
        )}

        {sessionStatus === "connected" && (
          <RestCallForm callForRest={callForRest} />
        )}
      </div>

      <div className="dm-table-rail">
        <span className="text-muted">
          Players see: {SHARING_LABELS[sharing].toLowerCase()}
        </span>
        <button type="button" onClick={() => setTableSettingsOpen(true)}>
          <FaGear /> Table settings
        </button>
      </div>
      {tableSettingsOpen && (
        <TableSettingsModal onClose={() => setTableSettingsOpen(false)} />
      )}
    </div>
  );
}

// One act at the table awaiting a ruling. A target that has left the fight
// (or was never tracked) still shows the card, with nowhere to apply to.
// Healing on a hand-typed row applies directly; on a character-backed row it
// sends an offer for the player to apply themselves.
function ExchangeCard({
  exchange,
  participants,
  verdict,
  onRule,
  onApply,
  onOfferHealing,
  onDone,
}: {
  exchange: Exchange;
  participants: Participant[];
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
  const resolved = exchange.targets.map((t) => ({
    ...t,
    participant: participants.find((p) => p.id === t.id),
  }));
  const targets = resolved
    .map((t) => t.participant)
    .filter((p): p is Participant => !!p);
  return (
    <li className="dm-exchange">
      <div className="dm-exchange-head">
        <strong>{exchange.fromName}</strong>
        {resolved.length > 0 && (
          <>
            <span className="dm-exchange-arrow">→</span>
            <strong>
              {resolved
                .map((t) => t.participant?.name ?? t.name ?? "?")
                .join(", ")}
            </strong>
          </>
        )}
        <span className="dm-exchange-label">{exchange.label}</span>
        {targets.some((t) => !t.vitals) && (
          <span className="text-muted"> — untracked, give it HP first</span>
        )}
        {resolved.some((t) => !t.participant) && (
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
          targets={targets}
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
  targets,
  fromName,
  verdict,
  onRule,
  onApply,
  onOfferHealing,
  onResolved,
}: {
  stage: ExchangeStage;
  targets: Participant[];
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
      {/* A cast has no total of its own — the save DC is what matters. */}
      {stage.stage !== "cast" && (
        <span className="dm-stage-total">{roll.total}</span>
      )}
      <RollDetail roll={roll} />
      {stage.superseded.length > 0 &&
        (stage.stage === "cast" ? (
          <span className="dm-stage-rerolled" title="Announced more than once">
            announced ×{stage.superseded.length + 1}
          </span>
        ) : (
          <span className="dm-stage-rerolled" title="Rolled more than once">
            re-rolled ×{stage.superseded.length} — was{" "}
            {stage.superseded.map((r) => r.total).join(", ")}
          </span>
        ))}
      {stage.stage === "toHit" && (
        <ToHitRuling
          roll={roll}
          target={targets[0]}
          verdict={verdict}
          onRule={onRule}
        />
      )}
      {/* No AC opinion for checks (the DC isn't known); death saves score themselves and aren't ruled on. */}
      {stage.stage === "check" && !roll.label?.startsWith("Death save") && (
        <CheckRuling verdict={verdict} onRule={onRule} />
      )}
      {/* DM applies conditions to monsters directly; player-owned targets get their own consent prompt elsewhere. */}
      {roll.condition &&
        targets.map((t) => (
          <ApplyConditionButton
            key={`cond:${t.id}`}
            target={t}
            condition={roll.condition!}
            from={roll.fromParticipantId}
          />
        ))}
      {/* One apply row per tracked target — each takes its own halving/override. */}
      {(stage.stage === "damage" || heals) &&
        targets
          .filter((t) => t.vitals)
          .map((t) => (
            <ApplyAmount
              key={t.id}
              roll={roll}
              target={t}
              named={targets.length > 1}
              fromName={fromName}
              healing={heals}
              onApply={onApply}
              onOfferHealing={onOfferHealing}
              onResolved={onResolved}
            />
          ))}
    </div>
  );
}

const STAGE_LABELS: Record<ExchangeStage["stage"], string> = {
  cast: "Cast",
  toHit: "To hit",
  damage: "Damage",
  healing: "Healing",
  check: "Check",
  roll: "Roll",
};

// Disabled state derives from the live participant, so a removed condition
// can be re-applied and one already ticking can't be stacked.
function ApplyConditionButton({
  target,
  condition,
  from,
}: {
  target: Participant;
  condition: { name: string; rounds?: number };
  // Caster's participant id, recorded as provenance for caster-only benefits (Hex).
  from?: string;
}) {
  const { giveCondition } = useEncounter();
  const held = target.conditions.some((c) => c.name === condition.name);
  const summary = conditionSummary(condition.name);
  return (
    <span className="dm-stage-ruling">
      <button
        type="button"
        disabled={held}
        title={summary}
        onClick={() =>
          giveCondition(target.id, {
            name: condition.name,
            ...(condition.rounds !== undefined
              ? { rounds: condition.rounds }
              : {}),
            ...(from ? { from } : {}),
          })
        }
      >
        {held
          ? `${condition.name} on ${target.name}`
          : `Apply ${condition.name} to ${target.name}`}
      </button>
    </span>
  );
}

// Check's counterpart to Hit/Miss; no AC-style opinion since the app doesn't know the DC.
function CheckRuling({
  verdict,
  onRule,
}: {
  verdict?: RollVerdict["outcome"];
  onRule: (outcome: RollVerdict["outcome"]) => void;
}) {
  return (
    <span className="dm-stage-ruling">
      <span className="dm-ruling-buttons">
        <button
          type="button"
          className={classNames({ "btn-primary": verdict !== "failure" })}
          aria-pressed={verdict === "success"}
          title={verdict === "success" ? "You ruled this a success" : undefined}
          onClick={() => onRule("success")}
        >
          Success
        </button>
        <button
          type="button"
          className={classNames({ "btn-primary": verdict === "failure" })}
          aria-pressed={verdict === "failure"}
          title={verdict === "failure" ? "You ruled this a failure" : undefined}
          onClick={() => onRule("failure")}
        >
          Fail
        </button>
        {verdict && <span className="dm-ruled">you said {verdict}</span>}
      </span>
    </span>
  );
}

// Everything about a roll besides its total: faces, crit/fumble, save DC, damage breakdown.
function RollDetail({ roll }: { roll: RollReport }) {
  const faces = formatFaces(roll);
  const modifier = impliedModifier(roll);
  return (
    <span className="dm-stage-detail text-muted">
      {faces && <span>{faces}</span>}
      {modifier !== undefined && (
        <span>
          {modifier > 0 ? "+" : ""}
          {modifier} modifier
        </span>
      )}
      {roll.bonuses?.map((b) => (
        <span key={b.source}>
          +{b.total} — {b.source}
          {b.dice?.length ? ` (${b.dice.join(", ")})` : ""}
        </span>
      ))}
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
      {roll.condition && (
        <span
          className="dm-stage-chip"
          title={conditionSummary(roll.condition.name)}
        >
          {roll.condition.name}
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
      {/* Shown only when the breakdown adds information beyond the total. */}
      {itemised(roll).map((part, i) => (
        <span key={`${part.source ?? part.damageType ?? i}`}>
          {part.total} {part.damageType ?? "damage"}
          {part.source ? ` (${part.source})` : ""}
        </span>
      ))}
    </span>
  );
}

// Nothing when the whole roll is one plain lump (the total already says it).
function itemised(roll: RollReport): ReportedDamage[] {
  const parts = roll.parts?.filter((p) => p.total > 0) ?? [];
  if (parts.length <= 1 && !parts.some((p) => p.source)) return [];
  return parts;
}

// The app offers a hit/miss opinion from the known AC; the DM's ruling is authoritative.
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
      {/* Re-rulable: last click wins, `aria-pressed` reflects the current answer. */}
      <span className="dm-ruling-buttons">
        <button
          type="button"
          className={classNames({ "btn-primary": verdict !== "miss" })}
          aria-pressed={verdict === "hit"}
          title={verdict === "hit" ? "You ruled this a hit" : undefined}
          onClick={() => onRule("hit")}
        >
          Hit
        </button>
        <button
          type="button"
          className={classNames({ "btn-primary": verdict === "miss" })}
          aria-pressed={verdict === "miss"}
          title={verdict === "miss" ? "You ruled this a miss" : undefined}
          onClick={() => onRule("miss")}
        >
          Miss
        </button>
        {verdict && <span className="dm-ruled">you said {verdict}</span>}
      </span>
    </span>
  );
}

// Editable amount plus one apply button. Damage drains temp HP first; healing
// on a character-backed row becomes an offer its owner applies themselves.
function ApplyAmount({
  roll,
  target,
  named,
  fromName,
  healing,
  onApply,
  onOfferHealing,
  onResolved,
}: {
  roll: RollReport;
  target: Participant;
  // Print the target's name only when the stage has several apply rows.
  named?: boolean;
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
  // Resolves the whole act (not just this line), removing the card from the queue.
  onResolved: () => void;
}) {
  const [amount, setAmount] = useState(String(roll.total));
  const [applied, setApplied] = useState(false);
  // Reset when a re-roll produces a new report.
  useEffect(() => {
    setAmount(String(roll.total));
    setApplied(false);
  }, [roll.reportId]);

  const parsed = Number(amount);
  const offersInstead = healing && !!target.characterUuid;
  const vitals = target.vitals!;

  return (
    <span className="dm-stage-ruling">
      {named && <span className="dm-apply-target">{target.name}</span>}
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
        disabled={!(parsed > 0) || applied}
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
          // With multiple targets, keep the card until every row is applied.
          if (named) setApplied(true);
          else onResolved();
        }}
      >
        {applied
          ? "Applied"
          : `${offersInstead ? "Approve" : "Apply"}${parsed > 0 && parsed !== roll.total ? ` ${parsed}` : ""}`}
      </button>
    </span>
  );
}

// Who, if anyone, is holding this sheet right now. Silent for hand-typed
// monsters and sheets this browser holds itself.
function LivenessChip({
  participant,
  clientId,
  present,
  quietClients,
  connected,
}: {
  participant: Participant;
  clientId: string;
  present: { clientId: string; name: string }[];
  quietClients: string[];
  connected: boolean;
}) {
  const state = participantLiveness(participant, {
    clientId,
    presentIds: present.map((c) => c.clientId),
    quietIds: quietClients,
    connected,
  });
  if (state === "none" || state === "self") return null;
  return (
    <span
      className={classNames("dm-liveness", state)}
      title={LIVENESS_TITLE[state]}
    >
      <span className="dm-liveness-dot" aria-hidden />
      {LIVENESS_LABEL[state]}
    </span>
  );
}

// Copies the invite link (not the bare code), same as the session bar. The
// code itself stays visible underneath for reading out over a call.
function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="dm-invite"
      onClick={async () => {
        await copyToClipboard(inviteLink(window.location.origin, code));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span className="dm-invite-label">
        {copied ? "Copied — send it to your players" : "Copy the invite link"}
      </span>
      <span className="dm-invite-code">
        <code>{code}</code>
        <FaCopy />
      </span>
    </button>
  );
}

// A pack of identical monsters shares one initiative roll (5e rule), gets
// numbered names, and starts tracked as soon as it has a max HP.
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

  // A hand-typed combatant has no sheet; its HP starts existing once a max is set.
  if (!vitals) {
    return (
      <>
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
        <span className="dm-row-ac" />
      </>
    );
  }

  return (
    <>
      <div className="dm-row-vitals">
        <VitalsEntry vitals={vitals} name={participant.name} apply={apply} />
        <HpTotal
          vitals={vitals}
          name={participant.name}
          max={vitals.maxHp}
          apply={apply}
        />
        {/* The DM always sees death-save progress; the party-visibility toggle doesn't gate this board. */}
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
      </div>
      <span className="dm-row-ac">
        {/* The column header names this where the board is columns; where it
            stacks, the caption is all there is. */}
        <span className="dm-cell-caption">AC</span>
        {participant.characterUuid ? (
          // Read-only: a character's AC derives from its own sheet.
          vitals.ac > 0 && <span className="dm-ac-value">{vitals.ac}</span>
        ) : (
          <AcInput participant={participant} apply={apply} />
        )}
      </span>
    </>
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
    <input
      type="text"
      inputMode="numeric"
      className="dm-ac-input"
      aria-label={`${participant.name} armor class`}
      {...inputProps}
      value={inputProps.value === "0" ? "" : inputProps.value}
    />
  );
}
