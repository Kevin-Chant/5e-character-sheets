import { useState } from "react";
import { LeveledSpellLevel } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  mechanicsForAbility,
  SLOT_CREATION_COSTS,
} from "src/lib/mechanics/catalog";
import {
  abilityRemainingUses,
  actionBlocked,
  manualRollAsks,
  resolveEffects,
  slotLevelOptions,
  EffectContext,
} from "src/lib/mechanics/resolve";
import { formatCustomFormula } from "src/lib/formula";
import { useRollMode } from "src/lib/hooks/use-roll-mode";
import { AbilityAction, ACTION_COST_LABELS } from "src/lib/mechanics/types";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { isFoe } from "src/lib/play/encounter";
import { randomUUID } from "src/lib/browser";
import { LimitedUseAbility } from "src/lib/types";
import { ordinal } from "src/lib/utils";
import {
  ManualRollInput,
  TargetMultiPicker,
  TargetPicker,
} from "../roll-modal";
import Select from "../select";
import StepperInput from "../stepper-input";

// Play-mode action rows for limited-use abilities the mechanics catalog knows
// (Second Wind, Font of Magic, Lay on Hands, …), driven by each ability's
// AbilityAction data. Writes go through resolveEffects -> ordinary dispatches.
export default function AbilityActions({
  index,
  ability,
}: {
  index: number;
  ability: LimitedUseAbility;
}) {
  const actions = mechanicsForAbility(ability)?.actions;
  if (!actions?.length) return <></>;
  return (
    <div className="column ability-actions font-small">
      {actions.map((action) => (
        <ActionRow
          key={action.id}
          index={index}
          ability={ability}
          action={action}
        />
      ))}
    </div>
  );
}

// One action: [level picker] [amount input] [button + cost badge], plus the
// outcome line from its last use. Exported so the play surface's action board
// can render these individually, regrouped by action-economy cost.
export function ActionRow({
  index,
  ability,
  action,
}: {
  index: number;
  ability: LimitedUseAbility;
  action: AbilityAction;
}) {
  const { character, dispatch } = useLoadedCharacter();
  const { sendReport, reportsEnabled } = useTableTalk();
  const { encounter, self } = useEncounter();
  const { rollMode } = useRollMode();
  const [level, setLevel] = useState<LeveledSpellLevel>(1);
  const [amount, setAmount] = useState(1);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Real-dice mode: totals typed so far, in ask order; null when no entry is underway.
  const [manualTotals, setManualTotals] = useState<number[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);

  // A condition-applying action (Stunning Strike, Inspire) asks whom, only at a
  // table (needs an encounter row to land on). Single-target excludes your own
  // row; multi-target (e.g. "creatures of your choice") includes it.
  const applies = action.applies;
  const selfId = self?.id;
  const targetable =
    applies && reportsEnabled
      ? encounter.participants.filter(
          (p) => !p.hidden && (applies.multi || p.id !== selfId),
        )
      : [];
  const toggleTarget = (id: string, on: boolean) =>
    setTargetIds((current) =>
      on ? [...current, id] : current.filter((t) => t !== id),
    );

  const levels = slotLevelOptions(action, character);
  const needsLevel = !!action.choose?.slotLevel;
  const needsAmount = action.choose?.amount === "uses";
  if (needsLevel && levels.length === 0) return <></>;
  const chosenLevel = needsLevel && !levels.includes(level) ? levels[0] : level;

  const ctx: EffectContext = {
    character,
    ability,
    abilityIndex: index,
    chosenLevel: needsLevel ? chosenLevel : undefined,
    chosenAmount: needsAmount ? amount : undefined,
  };
  const blocked = actionBlocked(action, ctx);

  // If the action name just restates the ability name, the button says "Use"
  // instead (the cost badge carries the rest); otherwise it keeps its own label.
  const abilityName = ability.info.title.trim();
  const restatesAbility =
    action.name.trim().toLowerCase() === abilityName.toLowerCase();

  const asks = rollMode === "manual" ? manualRollAsks(action.effects, ctx) : [];

  const perform = (e: React.MouseEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (asks.length > 0) {
      // Real dice: nothing is spent or reported until totals come in.
      setManualTotals((current) => (current === null ? [] : null));
      return;
    }
    fire();
  };

  const fire = (entered?: number[]) => {
    const { updates, reminders, rolls } = resolveEffects(action.effects, {
      ...ctx,
      ...(entered ? { manualTotals: [...entered] } : {}),
    });
    updates.forEach((update) => dispatch(update));
    const parts = [
      ...rolls.map(
        (r) =>
          `${r.label}: ${r.total}` +
          (r.dice.length > 0 ? ` (dice: ${r.dice.join(" + ")})` : ""),
      ),
      ...reminders,
    ];
    setOutcome(parts.length > 0 ? parts.join(" — ") : null);
    // Reports each rolled amount to the table (no-op without one); each use is its own exchange.
    const source = restatesAbility
      ? abilityName
      : `${abilityName} — ${action.name}`;
    // Cast and rolls share one exchange so a condition-applying use (e.g. Inspire) arrives as one card.
    const exchangeId = randomUUID();
    const address = applies?.multi
      ? targetIds.length > 0
        ? { targetIds: [...targetIds] }
        : {}
      : targetId
        ? { targetId }
        : {};
    if (applies) {
      sendReport({
        exchangeId,
        stage: "cast",
        attempt: 1,
        label: source,
        total: 0,
        ...address,
        condition: {
          name: applies.name,
          ...(applies.rounds !== undefined ? { rounds: applies.rounds } : {}),
        },
      });
    }
    rolls.forEach((r) =>
      sendReport({
        exchangeId: applies ? exchangeId : randomUUID(),
        stage: r.label === "Healing" ? "healing" : "roll",
        attempt: 1,
        label: r.label === "Healing" ? source : `${source} — ${r.label}`,
        total: r.total,
        ...(entered ? { manual: true } : {}),
        ...(applies ? address : {}),
      }),
    );
  };

  const usesCostTable = action.effects.some(
    (ef) => "amount" in ef && ef.amount && "byChosenLevel" in ef.amount,
  );

  return (
    <div className="column ability-action">
      {targetable.length > 0 &&
        (applies?.multi ? (
          <TargetMultiPicker
            selfId={selfId}
            foes={targetable.filter(isFoe)}
            party={targetable.filter((p) => !isFoe(p))}
            targetIds={targetIds}
            toggleTarget={toggleTarget}
          />
        ) : (
          <TargetPicker
            healing={false}
            verb={action.name}
            foes={targetable.filter(isFoe)}
            party={targetable.filter((p) => !isFoe(p))}
            targetId={targetId}
            setTargetId={setTargetId}
          />
        ))}
      <div className="row ability-action-row">
        {needsLevel && (
          <Select
            label={`${action.name} slot level`}
            value={String(chosenLevel)}
            options={levels.map((lvl) => ({
              value: String(lvl),
              label: ordinal(lvl),
              meta:
                usesCostTable && SLOT_CREATION_COSTS[lvl] !== undefined
                  ? `${SLOT_CREATION_COSTS[lvl]} pts`
                  : undefined,
            }))}
            onChange={(value) => {
              setLevel(Number(value) as LeveledSpellLevel);
              setManualTotals(null);
            }}
          />
        )}
        {needsAmount && (
          <label className="ability-action-amount">
            <span className="ability-action-amount-label">Spend</span>
            <StepperInput
              value={amount}
              min={1}
              max={abilityRemainingUses(ability, character)}
              ariaLabel={`${action.name} amount`}
              onChange={(next) => {
                setAmount(next);
                setManualTotals(null);
              }}
            />
          </label>
        )}
        <button
          type="button"
          className="ability-action-btn"
          disabled={!!blocked}
          aria-label={`Use ${abilityName}`}
          title={blocked ?? action.costNote}
          onClick={perform}
        >
          {restatesAbility ? "Use" : action.name}
        </button>
        <span
          className={`action-cost-badge action-cost-${action.cost}`}
          title={
            action.costNote
              ? `${ACTION_COST_LABELS[action.cost]} — ${action.costNote}`
              : ACTION_COST_LABELS[action.cost]
          }
        >
          {ACTION_COST_LABELS[action.cost]}
        </span>
      </div>
      {/* Real dice: one ask at a time; nothing spent until the last total lands. */}
      {manualTotals !== null && manualTotals.length < asks.length && (
        <div className="column ability-action-manual">
          <p className="muted font-small">
            {asks[manualTotals.length].label} —{" "}
            {formatCustomFormula(
              asks[manualTotals.length].formula,
              character,
              false,
            )}
          </p>
          <ManualRollInput
            prompt="Total rolled, modifiers included"
            min={0}
            onCommit={(total) => {
              const next = [...manualTotals, total];
              if (next.length >= asks.length) {
                setManualTotals(null);
                fire(next);
              } else {
                setManualTotals(next);
              }
            }}
          />
        </div>
      )}
      {outcome && <p className="muted ability-action-outcome">{outcome}</p>}
    </div>
  );
}
