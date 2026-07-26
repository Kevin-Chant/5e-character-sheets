import classNames from "classnames";
import { LeveledSpellLevel } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { resolveEffects } from "src/lib/mechanics/resolve";
import { Spell } from "src/lib/types";
import { availableSpellSlots } from "src/lib/rules";
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

// Everything the character can do, grouped by what it costs on a turn. The
// grouping itself is the feature: the sheet files an ability under the section
// that owns its data (attacks, spells, pools), which is the right filing for a
// document and the wrong one for a turn.
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
          <section key={cost} className="action-group">
            <h2 className="action-group-heading">{TURN_GROUP_LABELS[cost]}</h2>
            {actions.map((action) => (
              <BoardRow key={action.key} action={action} turn={turn} />
            ))}
            {standard.length > 0 && (
              // The actions everyone has. Rendered as one quiet line rather than
              // rows, because they don't roll and don't spend anything — they're
              // a reminder that the turn has options, not entries in the list.
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
      {/* The control is what marks the slot spent — hovering or reading a row
          shouldn't. Wrapping rather than threading a callback through
          `RollButton` and `ActionRow` keeps both of them unaware of the turn. */}
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
    // Same gate the spell list uses: a spell with no structured damage or
    // healing has nothing to roll, and offering a die for it would promise a
    // result the engine can't produce.
    const rollable =
      spell.mechanics?.damage ||
      spell.mechanics?.damageTable ||
      spell.mechanics?.healing;
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

// Spending the slot is half of casting, and until now it lived in a different
// place from the spell — you rolled here and then remembered to click a pip in
// the rail. The roll dialog deliberately doesn't spend it either (it only picks
// a level to scale by), so the board offers it explicitly.
//
// Disabled only when there is no slot at that level to spend: that's arithmetic,
// not a rules judgement, so it's the one place on this surface where "you can't"
// is honest.
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
        // Casting a concentration spell replaces whatever you were holding —
        // that's the 5e rule, and it's the half players forget. Set rather than
        // prompted: it's visible in the rail and one click to drop.
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
