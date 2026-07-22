import { useState } from "react";
import { LeveledSpellLevel } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  mechanicsForAbility,
  SLOT_CREATION_COSTS,
} from "src/lib/mechanics/catalog";
import {
  abilityRemainingUses,
  actionBlocked,
  resolveEffects,
  slotLevelOptions,
  EffectContext,
} from "src/lib/mechanics/resolve";
import { AbilityAction, ACTION_COST_LABELS } from "src/lib/mechanics/types";
import { LimitedUseAbility } from "src/lib/types";
import { ordinal } from "src/lib/utils";

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
function ActionRow({
  index,
  ability,
  action,
}: {
  index: number;
  ability: LimitedUseAbility;
  action: AbilityAction;
}) {
  const { character, dispatch } = useCharacter();
  const [level, setLevel] = useState<LeveledSpellLevel>(1);
  const [amount, setAmount] = useState(1);
  const [outcome, setOutcome] = useState<string | null>(null);
  if (!character) return <></>;

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

  const perform = (e: React.MouseEvent) => {
    e.preventDefault();
    if (blocked) return;
    const { updates, reminders, rolls } = resolveEffects(action.effects, ctx);
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
  };

  // Slot-creation options show their point cost inline when the action spends
  // by chosen level.
  const usesCostTable = action.effects.some(
    (ef) => "amount" in ef && ef.amount && "byChosenLevel" in ef.amount,
  );

  return (
    <div className="column ability-action">
      <div className="row ability-action-row">
        {needsLevel && (
          <select
            aria-label={`${action.name} slot level`}
            value={chosenLevel}
            onChange={(e) =>
              setLevel(Number(e.target.value) as LeveledSpellLevel)
            }
          >
            {levels.map((lvl) => (
              <option key={lvl} value={lvl}>
                {ordinal(lvl)}
                {usesCostTable && SLOT_CREATION_COSTS[lvl] !== undefined
                  ? ` (${SLOT_CREATION_COSTS[lvl]} pts)`
                  : ""}
              </option>
            ))}
          </select>
        )}
        {needsAmount && (
          <input
            type="number"
            aria-label={`${action.name} amount`}
            min={1}
            max={abilityRemainingUses(ability, character)}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        )}
        <button
          type="button"
          disabled={!!blocked}
          title={blocked ?? action.costNote}
          onClick={perform}
        >
          {action.name}
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
      {outcome && <p className="muted ability-action-outcome">{outcome}</p>}
    </div>
  );
}
