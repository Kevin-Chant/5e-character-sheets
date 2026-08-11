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
// (Second Wind, Font of Magic, Lay on Hands, …). Everything rendered here is
// driven by the ability's `AbilityAction` data — choice pickers, enablement,
// the action-cost badge — so a new special ability is a catalog entry, not a
// component. Writes go through `resolveEffects` → ordinary dispatches.
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

// One action: [level picker] [amount input] [button + cost badge], and the
// outcome line (reminders / display rolls) from its last use.
//
// Exported because the play surface's action board renders these individually,
// regrouped by action-economy cost rather than by the pool they belong to — a
// Ki pool is three different things you can do, at two different costs.
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
  // Real-dice mode: the totals typed in so far, in ask order; null when no
  // entry is underway.
  const [manualTotals, setManualTotals] = useState<number[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [targetIds, setTargetIds] = useState<string[]>([]);

  // A condition-applying action (Stunning Strike, Inspire) asks whom, the same
  // grouped pick the roll dialog makes — only at a table, since the condition
  // lands on an encounter row and solo there is no row to land on. A
  // single-target use leaves your own row out (a strike, an inspiration for
  // someone else — neither ever names you); a save-the-room `multi` use
  // includes it, because "creatures of your choice within 30 ft." routinely
  // does.
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

  // Most pools carry a single action named after the pool, so the button just
  // repeated the name already printed above it — "Divine Sense" under "Divine
  // Sense", and three rows of "Channel Divinity: …" under three pools called
  // exactly that. Where the name restates the ability it says nothing the
  // player can't already see, so the button becomes a plain "Use" and the cost
  // badge beside it carries the rest.
  //
  // Where the action name is *not* the ability name it's doing real work — a
  // Ki pool's "Flurry of Blows" / "Patient Defense" / "Step of the Wind", or
  // Hexblade's "Curse a target" — so it keeps its label. The ability's own name
  // is never abbreviated: "Channel Divinity: Vow of Enmity" is what the feature
  // is called, and those entries share one pool.
  const abilityName = ability.info.title.trim();
  const restatesAbility =
    action.name.trim().toLowerCase() === abilityName.toLowerCase();

  // The dice this action rolls, as manual-entry asks — non-empty only when
  // the table is on real dice and the action actually rolls something. Every
  // other action fires on the click either way.
  const asks = rollMode === "manual" ? manualRollAsks(action.effects, ctx) : [];

  const perform = (e: React.MouseEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (asks.length > 0) {
      // Real dice: nothing is spent or reported until the totals come in.
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
    // Every rolled amount goes to the table as it lands (a no-op when there
    // is no table) — the writes above reach the DM as bare HP changes in the
    // projection, and these are the "Second Wind: 9" that explains them.
    // Each roll is its own exchange at attempt 1: using an ability twice is
    // two acts, not a re-roll of one.
    const source = restatesAbility
      ? abilityName
      : `${abilityName} — ${action.name}`;
    // A condition-applying use is one act with an address, so its cast and its
    // rolls share an exchange — Inspire's die and its condition arrive as one
    // card. The cast rides the same path a condition-granting spell does: the
    // condition *name* on a `cast` stage, which the table-talk layer fans into
    // consent prompts (a character-backed target) and DM apply buttons
    // (anyone else). Untargeted, it still announces the use — just with
    // nowhere to offer the condition to.
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

  // Slot-creation options show their point cost inline when the action spends
  // by chosen level.
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
              // The price of the slot, in its own column — the Sorcery Point
              // cost is the whole decision here, and it used to be a
              // parenthetical glued onto the label.
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
        {/* How much of the pool this use spends — Lay on Hands is the one
            ability that lets you choose. Labelled, because a bare number box
            beside a "Use" button says nothing about what it counts; and the
            shared `StepperInput` rather than a raw number field, so it doesn't
            sit under the pool's own themed stepper wearing browser spinners. */}
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
          // The accessible name always says what's being used, even when the
          // visible label is the generic one — "Use" on its own tells a screen
          // reader nothing about which ability it belongs to.
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
      {/* Real dice: the click above opened this instead of rolling — one ask
          at a time, in the order the resolver consumes them, and nothing is
          spent until the last total lands. Clicking the action again cancels. */}
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
