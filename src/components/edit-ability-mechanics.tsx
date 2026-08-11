import { LeveledSpellLevel, StandardDie } from "src/lib/data/data-definitions";
import { Cursor, updateAt } from "src/lib/cursor";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  buildAmount,
  defaultEffectOfKind,
  deriveChoose,
  EFFECT_KIND_LABELS,
  newHomebrewAction,
  parseSimpleAmount,
  SimpleAmount,
} from "src/lib/mechanics/authoring";
import { mechanicsForTitle } from "src/lib/mechanics/catalog";
import { ACTION_COST_LABELS } from "src/lib/mechanics/types";
import {
  AbilityAction,
  ActionCost,
  AmountExpr,
  Effect,
  FeatureMechanics,
  LimitedUseAbility,
} from "src/lib/types";
import { ordinal } from "src/lib/utils";
import { FaXmark } from "react-icons/fa6";
import Select from "src/components/select";

const EFFECT_KINDS = Object.keys(EFFECT_KIND_LABELS) as Effect["effect"][];
const COSTS = Object.keys(ACTION_COST_LABELS) as ActionCost[];
const DICE = [
  StandardDie.d4,
  StandardDie.d6,
  StandardDie.d8,
  StandardDie.d10,
  StandardDie.d12,
];

// Editor for an ability's homebrew mechanics: actions composed from the same
// closed effect set the catalog uses. `choose` is derived from effects on
// every edit, never hand-managed. Rider authoring is data-only (no UI yet).
export default function EditAbilityMechanics({
  ability,
  cursor,
}: {
  ability: LimitedUseAbility;
  cursor: Cursor<LimitedUseAbility>;
}) {
  const { dispatch } = useLoadedCharacter();

  const mechanics = ability.mechanics;
  const actions = mechanics?.actions ?? [];
  const catalogEntry = !mechanics && mechanicsForTitle(ability.info.title);

  const setMechanics = (value: FeatureMechanics | undefined) =>
    dispatch(updateAt(cursor.k("mechanics"), value));

  const setActions = (next: AbilityAction[]) =>
    setMechanics(
      next.length > 0 || mechanics?.riders?.length
        ? { ...mechanics, actions: next }
        : undefined,
    );

  const setAction = (index: number, next: AbilityAction) =>
    setActions(
      actions.map((a, i) =>
        i === index ? { ...next, choose: deriveChoose(next.effects) } : a,
      ),
    );

  return (
    <div className="column edit-ability-mechanics">
      <span className="field-label">Special actions</span>
      {catalogEntry && (
        <p className="field-help">
          This ability matches a built-in entry (&ldquo;
          {ability.info.title.trim()}&rdquo;) — its actions appear
          automatically. Adding actions here replaces the built-in ones.
        </p>
      )}
      {actions.map((action, i) => (
        <ActionEditor
          key={action.id}
          action={action}
          update={(next) => setAction(i, next)}
          remove={() => setActions(actions.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="add-action-btn"
        onClick={(e) => {
          e.preventDefault();
          setActions([...actions, newHomebrewAction()]);
        }}
      >
        + Add action
      </button>
    </div>
  );
}

function ActionEditor({
  action,
  update,
  remove,
}: {
  action: AbilityAction;
  update: (next: AbilityAction) => void;
  remove: () => void;
}) {
  const setEffect = (index: number, effect: Effect) =>
    update({
      ...action,
      effects: action.effects.map((ef, i) => (i === index ? effect : ef)),
    });

  return (
    <div className="column rounded-border-box padding-small edit-action">
      <div className="row edit-action-header">
        <input
          aria-label="Action name"
          value={action.name}
          onChange={(e) => update({ ...action, name: e.target.value })}
        />
        <Select
          label="Action cost"
          value={action.cost}
          options={COSTS.map((cost) => ({
            value: cost,
            label: ACTION_COST_LABELS[cost],
          }))}
          onChange={(value) => update({ ...action, cost: value as ActionCost })}
        />
        <button type="button" aria-label="Remove action" onClick={remove}>
          <FaXmark />
        </button>
      </div>
      <input
        aria-label="Cost note"
        placeholder="Timing note (e.g. when you take damage)"
        value={action.costNote ?? ""}
        onChange={(e) =>
          update({ ...action, costNote: e.target.value || undefined })
        }
      />
      {action.effects.map((effect, i) => (
        <EffectEditor
          key={i}
          effect={effect}
          update={(ef) => setEffect(i, ef)}
          remove={() =>
            update({
              ...action,
              effects: action.effects.filter((_, j) => j !== i),
            })
          }
        />
      ))}
      <button
        type="button"
        className="add-effect-btn"
        onClick={(e) => {
          e.preventDefault();
          update({
            ...action,
            effects: [...action.effects, defaultEffectOfKind("remind")],
          });
        }}
      >
        + Add effect
      </button>
    </div>
  );
}

function EffectEditor({
  effect,
  update,
  remove,
}: {
  effect: Effect;
  update: (effect: Effect) => void;
  remove: () => void;
}) {
  return (
    <div className="row edit-effect-row">
      <Select
        label="Effect kind"
        value={effect.effect}
        options={EFFECT_KINDS.map((kind) => ({
          value: kind,
          label: EFFECT_KIND_LABELS[kind],
        }))}
        onChange={(value) =>
          update(defaultEffectOfKind(value as Effect["effect"]))
        }
      />
      <EffectParams effect={effect} update={update} />
      <button type="button" aria-label="Remove effect" onClick={remove}>
        <FaXmark />
      </button>
    </div>
  );
}

function EffectParams({
  effect,
  update,
}: {
  effect: Effect;
  update: (effect: Effect) => void;
}) {
  switch (effect.effect) {
    case "heal":
    case "gainTempHp":
    case "spendUses":
    case "restoreUses":
      return (
        <AmountEditor
          amount={effect.amount}
          update={(amount) => update({ ...effect, amount })}
        />
      );
    case "roll":
      return (
        <>
          <input
            aria-label="Roll label"
            value={effect.label}
            onChange={(e) => update({ ...effect, label: e.target.value })}
          />
          <AmountEditor
            amount={effect.amount}
            update={(amount) => update({ ...effect, amount })}
          />
        </>
      );
    case "expendSlot":
    case "restoreSlot":
      return (
        <Select
          label="Slot level"
          value={effect.level === undefined ? "chosen" : String(effect.level)}
          options={[
            { value: "chosen", label: "chosen at use" },
            ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => ({
              value: String(lvl),
              label: `${ordinal(lvl)} level`,
            })),
          ]}
          onChange={(value) =>
            update({
              ...effect,
              level:
                value === "chosen"
                  ? undefined
                  : (Number(value) as LeveledSpellLevel),
            })
          }
        />
      );
    case "spendHitDie":
      return (
        <Select
          label="Hit die size"
          value={effect.die}
          options={DICE.map((die) => ({ value: die, label: die }))}
          onChange={(value) => update({ ...effect, die: value as StandardDie })}
        />
      );
    case "remind":
      return (
        <input
          aria-label="Reminder text"
          className="flex"
          placeholder="Shown when the action is used"
          value={effect.note}
          onChange={(e) => update({ ...effect, note: e.target.value })}
        />
      );
  }
}

// Number / Dice (N dM + K) / Player picks. Catalog shapes the simple codec
// can't express render read-only.
function AmountEditor({
  amount,
  update,
}: {
  amount: AmountExpr;
  update: (amount: AmountExpr) => void;
}) {
  const simple = parseSimpleAmount(amount);
  if (!simple) return <span className="muted font-small">(formula)</span>;

  const set = (next: SimpleAmount) => update(buildAmount(next));
  return (
    <>
      <Select
        label="Amount mode"
        value={simple.mode}
        options={[
          { value: "number", label: "Number" },
          { value: "dice", label: "Dice" },
          { value: "chosenAmount", label: "Player picks" },
          { value: "chosenDice", label: "Player picks × dice" },
        ]}
        onChange={(value) => {
          const mode = value as SimpleAmount["mode"];
          set(
            mode === "number"
              ? { mode, value: 1 }
              : mode === "dice"
                ? { mode, count: 1, die: StandardDie.d6, bonus: 0 }
                : mode === "chosenDice"
                  ? { mode, die: StandardDie.d6 }
                  : { mode: "chosenAmount" },
          );
        }}
      />
      {simple.mode === "number" && (
        <input
          type="number"
          aria-label="Amount"
          value={simple.value}
          onChange={(e) => set({ ...simple, value: Number(e.target.value) })}
        />
      )}
      {simple.mode === "chosenDice" && (
        <Select
          label="Die size"
          value={simple.die}
          options={DICE.map((die) => ({ value: die, label: die }))}
          onChange={(value) => set({ ...simple, die: value as StandardDie })}
        />
      )}
      {simple.mode === "dice" && (
        <>
          <input
            type="number"
            aria-label="Die count"
            min={1}
            value={simple.count}
            onChange={(e) =>
              set({ ...simple, count: Math.max(1, Number(e.target.value)) })
            }
          />
          <Select
            label="Die size"
            value={simple.die}
            options={DICE.map((die) => ({ value: die, label: die }))}
            onChange={(value) => set({ ...simple, die: value as StandardDie })}
          />
          <input
            type="number"
            aria-label="Flat bonus"
            value={simple.bonus}
            onChange={(e) => set({ ...simple, bonus: Number(e.target.value) })}
          />
        </>
      )}
    </>
  );
}
