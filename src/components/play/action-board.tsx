import classNames from "classnames";
import { LeveledSpellLevel } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { resolveEffects } from "src/lib/mechanics/resolve";
import { Spell } from "src/lib/types";
import { availableSpellSlots } from "src/lib/rules";
import { rollableSpell } from "src/lib/attack-roll";
import {
  calculateCustomFormula,
  formatCustomFormulaWithDamage,
  getSpellAttackBonus,
} from "src/lib/formula";
import { ordinal } from "src/lib/utils";
import {
  groupByCost,
  STANDARD_ACTIONS,
  TURN_GROUP_LABELS,
  TURN_GROUP_ORDER,
  TurnAction,
  turnActions,
} from "src/lib/play/turn-actions";
import { PlayTurn } from "src/lib/play/use-turn";
import { ActionRow } from "src/components/display/ability-actions";
import RollButton from "src/components/roll-button";

// Everything the character can do, grouped by action-economy cost rather than
// by sheet section (attacks, spells, pools).
export default function ActionBoard({ turn }: { turn: PlayTurn }) {
  const { character } = useLoadedCharacter();
  const groups = groupByCost(turnActions(character));

  return (
    <div className="action-board">
      {TURN_GROUP_ORDER.map((cost) => {
        const actions = groups[cost];
        const standard = STANDARD_ACTIONS[cost] ?? [];
        if (actions.length === 0 && standard.length === 0) return null;
        return (
          <section key={cost} className={`action-group action-group-${cost}`}>
            <h2 className="action-group-heading">{TURN_GROUP_LABELS[cost]}</h2>
            {actions.map((action) => (
              <BoardRow key={action.key} action={action} turn={turn} />
            ))}
            {standard.length > 0 && (
              <p className="action-standard">{standard.join(" · ")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardRow({ action, turn }: { action: TurnAction; turn: PlayTurn }) {
  const { character } = useLoadedCharacter();

  return (
    <div
      className={classNames("action-row", { unavailable: !action.available })}
    >
      <div className="action-row-main">
        <span className="action-row-name">{action.name}</span>
        {action.kind === "spell" && action.level > 0 && (
          <span className="action-row-badge">{ordinal(action.level)}</span>
        )}
        {action.kind === "attack" && (
          <span className="action-row-detail">
            {formatCustomFormulaWithDamage(action.attack.formula, character)}
          </span>
        )}
        {action.note && <span className="action-row-note">{action.note}</span>}
      </div>
      <div
        className="action-row-control"
        onClick={() => turn.markSpent(action.cost)}
      >
        <ActionControl action={action} />
      </div>
    </div>
  );
}

function ActionControl({ action }: { action: TurnAction }) {
  const { character } = useLoadedCharacter();

  if (action.kind === "attack") {
    const { attack } = action;
    return (
      <RollButton
        label={attack.name}
        toHit={
          attack.bonus === undefined
            ? undefined
            : calculateCustomFormula(attack.bonus, character)
        }
        save={attack.save}
        damage={attack.formula}
        attack={attack}
      />
    );
  }

  if (action.kind === "spell") {
    const { spell } = action;
    const cast = action.level > 0 && (
      <CastButton level={action.level as LeveledSpellLevel} spell={spell} />
    );
    const rollable = rollableSpell(spell);
    if (!rollable) return <>{cast}</>;
    return (
      <>
        {cast}
        <RollButton
          label={spell.info.title}
          toHit={
            spell.mechanics?.resolution?.kind === "attack"
              ? getSpellAttackBonus(character, spell.spellcastingClass)
              : undefined
          }
          spell={spell}
        />
      </>
    );
  }

  return (
    <ActionRow
      index={action.abilityIndex}
      ability={action.ability}
      action={action.action}
    />
  );
}

// Spends the slot explicitly; the roll dialog only picks a level to scale by.
// Disabled only when there's no slot at that level.
function CastButton({
  level,
  spell,
}: {
  level: LeveledSpellLevel;
  spell: Spell;
}) {
  const { character, dispatch } = useLoadedCharacter();
  const { self, concentrateOn, encounter } = useEncounter();
  const remaining = availableSpellSlots(character, level);

  return (
    <button
      type="button"
      className="cast-btn"
      disabled={remaining <= 0}
      title={
        remaining > 0
          ? `Spend a ${ordinal(level)}-level slot`
          : `No ${ordinal(level)}-level slots left`
      }
      onClick={(e) => {
        e.preventDefault();
        const { updates } = resolveEffects([{ effect: "expendSlot" }], {
          character,
          chosenLevel: level,
        });
        updates.forEach((update) => dispatch(update));
        // 5e rule: casting a concentration spell replaces whatever you were holding.
        if (spell.concentration && self) {
          concentrateOn(self.id, {
            spell: spell.info.title,
            startedRound: Math.max(1, encounter.round),
          });
        }
      }}
    >
      Cast
    </button>
  );
}
