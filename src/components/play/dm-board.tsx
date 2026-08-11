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
  SHARING_LEVELS,
  SharingLevel,
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
import Select from "src/components/select";
import StepperInput from "src/components/stepper-input";
import ConditionsControl from "./conditions-control";
import ConcentrationCell from "./concentration-cell";
import { RestCallForm, RollCallForm } from "./table-calls";
import { HpTotal, VitalsEntry } from "./vitals-entry";

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
    quietClients,
    assignSheetTo,
    setCombatantHidden,
    setCombatantSide,
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
    callForRest,
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
                {/* Is anybody behind this row? The one thing a roster of
                    creatures couldn't say, and the thing a DM needs before
                    calling on someone: a player whose phone dropped left a row
                    identical to a player who simply hadn't acted yet. */}
                <LivenessChip
                  participant={participant}
                  clientId={clientId}
                  present={present}
                  quietClients={quietClients}
                  connected={sessionStatus === "connected"}
                />
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
                {/* Which side the row fights for — what the players' target
                    strip and the pickers group by. Defaults from the sheet
                    heuristic (no sheet → foe) and flips with a click, because
                    the heuristic misses both the hand-typed ally and the
                    sheet-backed villain — and sides change mid-fight. */}
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
                        <Select
                          className="dm-assign-select"
                          label={`Hand ${participant.name} to a player`}
                          triggerLabel="Hand to…"
                          value=""
                          options={present.map((client) => ({
                            value: client.clientId,
                            label: client.name,
                          }))}
                          onChange={(clientId) => {
                            if (!clientId) return;
                            assignSheetTo(participant.id, clientId);
                          }}
                        />
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
              {/* Both cells are the player rail's controls, mounted in a
                  narrower box — not a DM-flavoured variant of them. */}
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

      {/* "Brakka, give me a Perception check" — the ask routed through the
          tool. Everyone, or one present player; the answers land in the
          queue above. */}
      {sessionStatus === "connected" && (
        <RollCallForm present={present} callForRoll={callForRoll} />
      )}

      {/* "You make camp for the night." The other thing a DM says to the whole
          table at once, and the only one that was still going out by voice —
          followed by four players each finding the bed button and each being
          asked, separately, a question the DM had already answered. */}
      {sessionStatus === "connected" && (
        <RestCallForm callForRest={callForRest} />
      )}

      {/* Table visibility, the DM's call, grouped in one place: how much
          health the players see, and whether death saves are the table's
          drama or private. On the encounter so it reaches every client — and
          here as well as in Settings → Game because the moment a DM decides
          to tighten it is mid-session. */}
      <div className="dm-visibility">
        {/* A `span`, not a `label`: the picker is a button, and a label that
            wraps one forwards nothing when you click its text. */}
        <span className="dm-sharing">
          <span className="text-muted">Players see</span>
          <Select
            label="What players see of the table's health"
            value={sharing}
            options={SHARING_LEVELS.map((level) => ({
              value: level,
              label: SHARING_LABELS[level],
            }))}
            onChange={(level) => setSharingLevel(level as SharingLevel)}
          />
        </span>
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
  // A Fireball names a set of targets; an attack roll names one. Either way
  // each named id resolves (or doesn't) against the current order.
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
      {/* A cast announces, it doesn't total — the save chip in the detail is
          the number that matters. */}
      {stage.stage !== "cast" && (
        <span className="dm-stage-total">{roll.total}</span>
      )}
      <RollDetail roll={roll} />
      {/* The re-roll trail. Nothing was blocked and nothing is being accused
          — but a number that was rolled twice says so, which is the only
          honesty this layer can offer and, at most tables, the only one it
          needs. */}
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
      {/* A check gets the same spoken answer a to-hit does — minus the AC
          opinion, because the DC lives in the DM's head. A death save scores
          itself (the verdict is already in the label), so ruling on it would
          only contradict the dice. */}
      {stage.stage === "check" && !roll.label?.startsWith("Death save") && (
        <CheckRuling verdict={verdict} onRule={onRule} />
      )}
      {/* The cast's condition, offered per target. Character-backed targets
          already got their own consent prompt; a monster has no player to
          ask, so the seat is its keeper and the card offers the write. */}
      {roll.condition &&
        targets.map((t) => (
          <ApplyConditionButton
            key={`cond:${t.id}`}
            target={t}
            condition={roll.condition!}
            from={roll.fromParticipantId}
          />
        ))}
      {/* One apply row per tracked target: a Fireball's 24 lands on each orc
          separately, because "Orc 1 saved, Orc 2 didn't" is the ordinary
          ruling and each box takes its own halving. */}
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

// "Apply Hideous Laughter to Goblin 1." The DM's half of a cast condition —
// re-clickable never, because the row itself says it's held: the disabled
// state derives from the live participant, so a condition the player removed
// can be re-applied and one already ticking can't be stacked.
function ApplyConditionButton({
  target,
  condition,
  from,
}: {
  target: Participant;
  condition: { name: string; rounds?: number };
  // The caster's participant row, off the report — recorded as the mark's
  // provenance so caster-only benefits (Hex) pay the right client.
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

// "That's a success." The check's counterpart to Hit/Miss — the DM knows the
// DC, the app doesn't, so there's no advisory opinion here, just the answer
// travelling in-app instead of by voice. Re-rulable like the to-hit buttons.
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

// Everything about a roll that isn't its total: the faces behind it, whether
// it was a crit, the save it has to beat, what it's made of. Most of this
// never used to leave the roller's screen, which left the DM ruling on
// resistance, save DCs and once-per-turn riders from memory.
function RollDetail({ roll }: { roll: RollReport }) {
  const faces = formatFaces(roll);
  const modifier = impliedModifier(roll);
  return (
    <span className="dm-stage-detail text-muted">
      {faces && <span>{faces}</span>}
      {/* The add-ons, called out: the flat modifier the total implies, then
          each bonus die by source — so "18" reads as "d20 14, +3, +1 Bless"
          rather than a number the seat has to take whole. */}
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
      {/* Re-rulable, because a misclick here used to be permanent: the buttons
          were replaced by static text after the first answer, on a surface whose
          every other control can be done again. Nothing about a ruling is
          custody — the ruling that counts is the last one said out loud, and a
          DM who hits Miss by accident needs to be able to say so. The pressed
          state carries what was already answered. */}
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

// The applyable half, unchanged in spirit: an editable amount (override
// before applying) and one button. Damage drains temp HP first; healing on a
// character-backed row becomes an offer its owner applies themselves.
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
  // Whether to print the target's name on the row — only when the stage has
  // several apply rows and a bare box wouldn't say whose HP it drains.
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
  // Applying resolves the whole act, not just this line: the number has
  // landed, so the card comes off the queue. With every roll at the table
  // arriving here, a queue that only grew would be unreadable by round three.
  onResolved: () => void;
}) {
  const [amount, setAmount] = useState(String(roll.total));
  const [applied, setApplied] = useState(false);
  // A re-roll is a new number; a box still holding the old one would be a trap.
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
          // With one target the number landing resolves the whole act; with
          // several, the card stays until each row has had its ruling — Orc 1
          // taking its half must not sweep Orc 2's box off the queue.
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

// Who, if anyone, is holding this sheet right now.
//
// Deliberately silent for the rows it has nothing to say about — hand-typed
// monsters, and sheets this browser holds itself — because a chip on every row
// is a chip nobody reads. The three states it does show are the three a DM
// actually acts on: call on them, wait a moment, or play their character for
// the rest of the fight.
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

// The code is the DM's first job — nobody is at the table until it's been
// pasted into the group chat. Shown big at the empty table, the one moment
// it's the whole point of the screen.
//
// **Copies the link, not the bare code** — the same thing the session bar
// copies, for the same reason: a player who taps a link lands at the right
// table having answered nothing, whereas a uuid on its own needs a sentence
// explaining where to put it. The code stays on screen underneath for reading
// out over a call.
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
      <VitalsEntry vitals={vitals} name={participant.name} apply={apply} />
      <HpTotal
        vitals={vitals}
        name={participant.name}
        max={vitals.maxHp}
        apply={apply}
      />
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
