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
import { ParticipantVitals } from "src/lib/play/encounter";
import { hasTriggerFor, planTrigger } from "src/lib/play/triggers";
import SlotPips from "src/components/display/slot-pips";
import TrackerValue from "src/components/display/tracker-value";
import DeathSavesDisplay from "src/components/display/death-saves-display";
import ConditionsPanel from "./conditions-panel";
import { HpTotal, VitalsEntry } from "./vitals-entry";

const SLOT_LEVELS: LeveledSpellLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Above this many uses, a pool shows its remaining count as a number instead
// of pips (matches the sheet's limited-use list threshold).
const PIP_THRESHOLD = 6;

// HP, AC, and pool state for the fight in progress; the rest of the character
// stays on the sheet.
export default function PlayVitals() {
  const { character, dispatch } = useLoadedCharacter();
  const { self } = useEncounter();
  const dying =
    character.currHp <= 0 ||
    character.deathSaves.successes > 0 ||
    character.deathSaves.failures > 0;

  // Unset maxHp means "derive it", resolved via the same initializer as the sheet's HP box.
  const maxHpFormula =
    character.maxHp ??
    getOptionalInitializer(FIELD.maxHp, undefined, character);
  const maxHp = maxHpFormula
    ? calculateCustomFormula(maxHpFormula, character)
    : 0;
  const currHp = character.currHp;
  const tempHp = character.tempHp;
  // Clamped so an over-max heal or lowered maximum can't push the bar past its track.
  const hpFraction = maxHp > 0 ? Math.min(1, Math.max(0, currHp / maxHp)) : 0;

  const ac = calculateCustomFormula(character.acFormula, character);
  const passivePerception = calculateCustomFormula(
    getPassivePerceptionFormula(character),
    character,
  );

  // maxHp: MAX_SAFE_INTEGER when unset, so applyHealing's clamp reads as "no ceiling" not zero.
  const vitals: ParticipantVitals = {
    currHp,
    tempHp,
    ac,
    maxHp: maxHpFormula && maxHp > 0 ? maxHp : Number.MAX_SAFE_INTEGER,
  };
  // Written to the character; the session-publish effect picks vitals up from there.
  const applyVitals = (next: ParticipantVitals) => {
    if (next.currHp !== currHp)
      dispatch(updateAt(charPath(FIELD.currHp), next.currHp));
    if ((next.tempHp ?? 0) !== tempHp)
      dispatch(updateAt(charPath(FIELD.tempHp), next.tempHp ?? 0));
  };

  const slotLevels = SLOT_LEVELS.filter(
    (level) => totalSpellSlots(character, level) > 0,
  );
  const pools = character.limitedUseAbilities
    .map((ability, index) => ({
      ability,
      index,
      total: calculateCustomFormula(ability.maxUses, character),
    }))
    .filter((pool) => pool.total > 0);

  return (
    <aside className="play-vitals">
      <div className="play-hp">
        <div className="play-hp-numbers">
          <HpTotal
            vitals={vitals}
            name={character.name || "you"}
            max={maxHpFormula && maxHp > 0 ? maxHp : undefined}
            apply={applyVitals}
          />
          <VitalsEntry
            vitals={vitals}
            name={character.name || "you"}
            apply={applyVitals}
          />
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

      {dying && (
        <div className="play-death-saves">
          <DeathSavesDisplay />
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
