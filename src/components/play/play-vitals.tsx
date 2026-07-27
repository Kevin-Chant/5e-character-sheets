import { FIELD, LeveledSpellLevel } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt } from "src/lib/cursor";
import { calculateCustomFormula } from "src/lib/formula";
import {
  availableSpellSlots,
  expendedSpellSlots,
  getOptionalInitializer,
  getPassivePerceptionFormula,
  totalSpellSlots,
} from "src/lib/rules";
import { ordinal } from "src/lib/utils";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { hasTriggerFor, planTrigger } from "src/lib/play/triggers";
import SlotPips from "src/components/display/slot-pips";
import TrackerValue from "src/components/display/tracker-value";
import DeathSavesDisplay from "src/components/display/death-saves-display";
import { useRoller } from "src/lib/hooks/use-roller";
import ConditionsPanel from "./conditions-panel";

const SLOT_LEVELS: LeveledSpellLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Past this many uses a row of pips stops being countable at a glance, so the
// pool shows its remaining count as a number instead. Same threshold the sheet's
// limited-use list uses, for the same reason.
const PIP_THRESHOLD = 6;

// The numbers you need in your hand while the board has your attention: what's
// keeping you alive, and what's left in the pools the board spends. Everything
// else about the character stays on the sheet, one link away — this rail is not
// a summary of the character, it's the working set for a fight.
export default function PlayVitals() {
  const { character, dispatch } = useLoadedCharacter();
  const { self } = useEncounter();
  const { openRoller } = useRoller();
  // Down, or mid-way through saves that haven't been cleared: the moment
  // death saves stop being sheet furniture and become the whole turn.
  const dying =
    character.currHp <= 0 ||
    character.deathSaves.successes > 0 ||
    character.deathSaves.failures > 0;

  // `maxHp` is an optional override, so resolve it through the initializer the
  // same way the sheet's HP box does — "unset" means "derive it", not "no
  // maximum".
  const maxHpFormula =
    character.maxHp ??
    getOptionalInitializer(FIELD.maxHp, undefined, character);
  const maxHp = maxHpFormula
    ? calculateCustomFormula(maxHpFormula, character)
    : 0;
  const currHp = character.currHp;
  const tempHp = character.tempHp;
  // Clamped so an over-max heal or a lowered maximum can't push the bar past
  // its track — the number beside it still tells the truth.
  const hpFraction = maxHp > 0 ? Math.min(1, Math.max(0, currHp / maxHp)) : 0;

  const ac = calculateCustomFormula(character.acFormula, character);
  const passivePerception = calculateCustomFormula(
    getPassivePerceptionFormula(character),
    character,
  );

  const slotLevels = SLOT_LEVELS.filter(
    (level) => totalSpellSlots(character, level) > 0,
  );
  const pools = character.limitedUseAbilities
    .map((ability, index) => ({
      ability,
      index,
      total: calculateCustomFormula(ability.maxUses, character),
    }))
    // A pool-less action host (`maxUses: 0`) has nothing to show here; its
    // actions are already on the board.
    .filter((pool) => pool.total > 0);

  return (
    <aside className="play-vitals">
      <div className="play-hp">
        <div className="play-hp-numbers">
          <TrackerValue
            cursor={charPath(FIELD.currHp)}
            value={currHp}
            name="Current Hit Points"
            decrementLabel="Lose 1 hit point"
            incrementLabel="Regain 1 hit point"
            max={maxHpFormula ? maxHp : undefined}
            prominent
          />
          <span className="play-hp-max">/ {maxHp}</span>
        </div>
        <div className="play-hp-bar">
          <div
            className="play-hp-bar-fill"
            style={{ width: `${hpFraction * 100}%` }}
          />
        </div>
        <div className="play-hp-temp">
          <TrackerValue
            cursor={charPath(FIELD.tempHp)}
            value={tempHp}
            name="Temp HP"
            decrementLabel="Lose 1 temporary hit point"
            incrementLabel="Gain 1 temporary hit point"
          />
        </div>
      </div>

      {/* The sheet's own death-save tracker, surfaced the moment it's the
          only thing that matters. The roll is a flat d20 — no modifier, and
          the outcome lands on these pips by the player's hand, same as at a
          paper table. */}
      {dying && (
        <div className="play-death-saves">
          <DeathSavesDisplay />
          <button
            type="button"
            onClick={() =>
              openRoller({
                label: "Death saving throw",
                spec: { kind: "check", modifier: 0 },
              })
            }
          >
            Roll a death save
          </button>
        </div>
      )}

      <dl className="play-stats">
        <div>
          <dt>AC</dt>
          <dd>{ac}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{character.speeds.walk}</dd>
        </div>
        <div>
          <dt>Passive</dt>
          <dd>{passivePerception}</dd>
        </div>
      </dl>

      {slotLevels.length > 0 && (
        <div className="play-pool-group">
          <h2 className="play-rail-heading">Spell slots</h2>
          {slotLevels.map((level) => (
            <div key={level} className="play-pool-row">
              <span className="play-pool-name">{ordinal(level)}</span>
              <SlotPips
                total={totalSpellSlots(character, level)}
                expended={expendedSpellSlots(character, level)}
                onChange={(expended) =>
                  dispatch(
                    updateAt(
                      charPath(FIELD.spellSlots).k(level).k("expended"),
                      expended,
                    ),
                  )
                }
              />
              <span className="play-pool-count">
                {availableSpellSlots(character, level)}
              </span>
            </div>
          ))}
        </div>
      )}

      {self && <ConditionsPanel self={self} />}

      {pools.length > 0 && (
        <div className="play-pool-group">
          <h2 className="play-rail-heading">
            Pools
            {/* Dawn has no turn boundary to hang off, so it's a button — and
                only for a character that actually has something that recharges
                then, rather than a control that would always do nothing. */}
            {hasTriggerFor(character, "dawn") && (
              <button
                type="button"
                className="dawn-btn"
                title="Recharge everything that comes back at dawn"
                onClick={() => {
                  const plan = planTrigger(character, "dawn");
                  plan.updates.forEach((update) => dispatch(update));
                }}
              >
                Dawn
              </button>
            )}
          </h2>
          {pools.map(({ ability, index, total }) => {
            const expended = Math.max(0, Math.min(ability.expended, total));
            return (
              <div key={index} className="play-pool-row">
                <span className="play-pool-name" title={ability.info.title}>
                  {ability.info.title}
                </span>
                {total <= PIP_THRESHOLD && (
                  <SlotPips
                    total={total}
                    expended={expended}
                    onChange={(next) =>
                      dispatch(
                        updateAt(
                          charPath(FIELD.limitedUseAbilities)
                            .at(index)
                            .k("expended"),
                          next,
                        ),
                      )
                    }
                  />
                )}
                <span className="play-pool-count">
                  {total > PIP_THRESHOLD
                    ? `${total - expended} / ${total}`
                    : total - expended}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
