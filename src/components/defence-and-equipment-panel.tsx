import classNames from "classnames";
import { FIELD, StandardDie } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import {
  calculateCustomFormula,
  formatCustomFormulaWithDamage,
  formatSaveEffect,
} from "src/lib/formula";
import {
  getHitDice,
  getOptionalInitializer,
  MAX_EXHAUSTION,
} from "src/lib/rules";
import SingleValueDisplay from "./display/single-value-display";
import TrackerValue from "./display/tracker-value";
import EquipmentDisplay from "./display/equipment-display";
import CoinsDisplay from "./display/coins-display";
import AttunementDisplay from "./display/attunement-display";
import SpeedDisplay from "./display/speed-display";
import AmmunitionDisplay from "./display/ammunition-display";
import DeathSavesDisplay from "./display/death-saves-display";
import RollButton from "./roll-button";
import { FaBed, FaPencil } from "react-icons/fa6";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useRest } from "src/lib/hooks/use-rest";
import { useSettings } from "src/lib/hooks/use-settings";
import { charPath, updateAt } from "src/lib/cursor";
import { WeaponRange } from "src/lib/types";

// "Range 100/400 ft." for the attack-name tooltip; undefined when no range.
const formatRange = (range: WeaponRange | undefined): string | undefined =>
  range
    ? `Range ${range.normal}${range.long ? `/${range.long}` : ""} ft.`
    : undefined;

export default function DefenceAndEquipmentPanel() {
  const { character, dispatch } = useLoadedCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  const { openRest } = useRest();
  const {
    settings: { trackAmmunition },
  } = useSettings();
  const totalHitDice = character.totalHitDice || getHitDice(character);
  // Current HP can't be raised past the maximum. `maxHp` is an optional
  // override, so resolve it the same way the Hit Point Maximum row above does —
  // through the initializer — rather than treating "unset" as "no maximum".
  const maxHpFormula =
    character.maxHp ??
    getOptionalInitializer(FIELD.maxHp, undefined, character);
  const maxHp = maxHpFormula
    ? calculateCustomFormula(maxHpFormula, character)
    : undefined;
  const hitDice = (
    [
      StandardDie.d4,
      StandardDie.d6,
      StandardDie.d8,
      StandardDie.d10,
      StandardDie.d12,
    ] as const
  ).filter(
    (die) =>
      (totalHitDice[die] || 0) > 0 || (character.expendedHitDice[die] || 0) > 0,
  );
  const addAttackRow = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(charPath(FIELD.attacks).append());
  };
  const removeAttackRow = (index: number) => {
    const newValue = structuredClone(character.attacks);
    newValue.splice(index, 1);
    dispatch(updateAt(charPath(FIELD.attacks), newValue));
  };
  return (
    <div className="column">
      {/* AC, Init, Speed */}
      <div className="row defence-vitals">
        <SingleValueDisplay
          cursor={charPath(FIELD.acFormula)}
          transform={calculateCustomFormula}
          name="Armor Class"
          vertical
          editable
        />
        <SingleValueDisplay
          cursor={charPath(FIELD.initiativeFormula)}
          name="Initiative"
          transform={calculateCustomFormula}
          vertical
          editable
          rollCheck="Initiative"
        />
        <SpeedDisplay />
      </div>
      {/* HP */}
      <div className="column rounded-border-box hp-box has-corner-action">
        {/* A rest lives with hit points: it's the region a rest restores, and
            the corner-action slot the level-up button uses on Class & Level. */}
        <div className="corner-action">
          <button
            type="button"
            className="icon-btn rest-btn"
            onClick={openRest}
            title="Take a short or long rest"
            aria-label="Take a short or long rest"
          >
            <FaBed />
          </button>
        </div>
        <SingleValueDisplay
          cursor={charPath(FIELD.maxHp)}
          name="Hit Point Maximum"
          transform={calculateCustomFormula}
          flipped
          removeBorder
          editable
        />
        <TrackerValue
          cursor={charPath(FIELD.currHp)}
          value={character.currHp}
          name="Current Hit Points"
          decrementLabel="Lose 1 hit point"
          incrementLabel="Gain 1 hit point"
          max={maxHp}
          prominent
        />
        <TrackerValue
          cursor={charPath(FIELD.tempHp)}
          value={character.tempHp}
          name="Temporary Hit Points"
          decrementLabel="Lose 1 temporary hit point"
          incrementLabel="Gain 1 temporary hit point"
        />
        <TrackerValue
          cursor={charPath(FIELD.exhaustion)}
          value={character.exhaustion}
          name="Exhaustion"
          decrementLabel="Lower exhaustion by 1"
          incrementLabel="Raise exhaustion by 1"
          max={MAX_EXHAUSTION}
        />
      </div>
      {/* Hit dice, death saves */}
      <div className="row tracker-row">
        <div className="column rounded-border-box tracker-box">
          <table>
            <thead>
              <tr>
                <th>
                  {editMode && (
                    <button
                      onClick={() => pushCursor(charPath(FIELD.totalHitDice))}
                    >
                      <FaPencil />
                    </button>
                  )}
                </th>
                <th>Total</th>
                <th>Expended</th>
              </tr>
            </thead>
            <tbody>
              {hitDice.map((die) => {
                return (
                  <tr key={die}>
                    <td>
                      <span className="row roll-inline">
                        {die}
                        <RollButton label={`Hit Die (${die})`} hitDie={die} />
                      </span>
                    </td>
                    <td>{totalHitDice[die] || 0}</td>
                    <td>
                      <SingleValueDisplay
                        cursor={charPath(FIELD.expendedHitDice).k(die)}
                        name=""
                        removeBorder={true}
                        editable
                        removeMargin={true}
                      ></SingleValueDisplay>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <b className="section-heading">Hit Dice</b>
        </div>
        <DeathSavesDisplay />
      </div>
      {/* Attacks */}
      {(character.attacks.length > 0 || editMode) && (
        <div
          className={classNames("column rounded-border-box", {
            "section-empty": character.attacks.length === 0,
          })}
        >
          {/* .attacks-table is a styling hook: below 640px the CSS reflows these
            rows into stacked cards, since four columns can't fit a phone. */}
          {/* Column headers over zero rows read as broken rather than new, so the
            head only appears once there's something under it. */}
          <table className="attacks-table">
            <thead hidden={character.attacks.length === 0}>
              <tr>
                <th>Name</th>
                {/* One column for both ways an attack resolves: a to-hit bonus,
                  or the DC the target rolls against. */}
                <th>Atk / DC</th>
                <th>Damage/Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {character.attacks.map((attack, index) => {
                // A save-based attack (a breath weapon, a poison) has no to-hit
                // bonus at all — its cell shows the target's DC instead.
                const attackBonus =
                  attack.bonus === undefined
                    ? undefined
                    : calculateCustomFormula(attack.bonus, character);
                const rangeText = formatRange(attack.range);
                // Remaining ammo across every pool linked to this weapon (setting-
                // gated); the pool is the single source of truth for the count.
                const linkedAmmo = trackAmmunition
                  ? character.ammunition.filter((a) =>
                      a.weaponIds.includes(attack.id),
                    )
                  : [];
                const ammoTotal = linkedAmmo.reduce(
                  (sum, a) => sum + a.count,
                  0,
                );
                return (
                  <tr key={index}>
                    <td className="attack-cell-name">
                      <span
                        className={
                          rangeText ? "attack-name has-range" : undefined
                        }
                        title={rangeText}
                      >
                        {attack.name}
                      </span>
                      {linkedAmmo.length > 0 && (
                        <span className="ammo-badge"> ({ammoTotal})</span>
                      )}
                    </td>
                    <td className="attack-cell-tohit">
                      {attackBonus !== undefined
                        ? attackBonus > 0
                          ? `+${attackBonus}`
                          : attackBonus
                        : attack.save
                          ? formatSaveEffect(attack.save, character)
                          : "—"}
                    </td>
                    <td className="attack-cell-damage">
                      {formatCustomFormulaWithDamage(attack.formula, character)}
                    </td>
                    <td className="attack-cell-action">
                      {editMode ? (
                        <span className="flex">
                          <button
                            aria-label="Edit attack"
                            onClick={(e) => {
                              e.preventDefault();
                              pushCursor(charPath(FIELD.attacks).at(index));
                            }}
                          >
                            <FaPencil />
                          </button>
                          <button
                            aria-label="Remove attack"
                            onClick={(e) => {
                              e.preventDefault();
                              removeAttackRow(index);
                            }}
                          >
                            x
                          </button>
                        </span>
                      ) : (
                        <RollButton
                          label={attack.name}
                          toHit={attackBonus}
                          save={attack.save}
                          damage={attack.formula}
                          attack={attack}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <b className="section-heading">Weapon Attacks</b>
            {editMode && <button onClick={addAttackRow}>+</button>}
          </div>
        </div>
      )}
      {/* Equipment */}
      <div className="column rounded-border-box equipment-box">
        <CoinsDisplay />
        <EquipmentDisplay />
        <AttunementDisplay />
        {trackAmmunition && <AmmunitionDisplay />}
      </div>
    </div>
  );
}
