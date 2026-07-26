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
  const { character, dispatch } = useLoadedCharacter();
  const [level, setLevel] = useState<LeveledSpellLevel>(1);
  const [amount, setAmount] = useState(1);
  const [outcome, setOutcome] = useState<string | null>(null);

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
      {outcome && <p className="muted ability-action-outcome">{outcome}</p>}
    </div>
  );
}
