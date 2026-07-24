import { FIELD, StandardDie } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  calculateCustomFormula,
  formatCustomFormulaWithDamage,
  formatSaveEffect,
} from "src/lib/formula";
import { getHitDice } from "src/lib/rules";
import SingleValueDisplay from "./display/single-value-display";
import EquipmentDisplay from "./display/equipment-display";
import CoinsDisplay from "./display/coins-display";
import AttunementDisplay from "./display/attunement-display";
import SpeedDisplay from "./display/speed-display";
import AmmunitionDisplay from "./display/ammunition-display";
import SlotPips from "./display/slot-pips";
import RollButton from "./roll-button";
import { FaPencil } from "react-icons/fa6";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useSettings } from "src/lib/hooks/use-settings";
import { charPath, updateAt } from "src/lib/cursor";
import { WeaponRange } from "src/lib/types";

// "Range 100/400 ft." for the attack-name tooltip; undefined when no range.
const formatRange = (range: WeaponRange | undefined): string | undefined =>
  range
    ? `Range ${range.normal}${range.long ? `/${range.long}` : ""} ft.`
    : undefined;

export default function DefenceAndEquipmentPanel() {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  const {
    settings: { trackAmmunition },
  } = useSettings();
  if (!character) return <></>;
  const totalHitDice = character.totalHitDice || getHitDice(character);
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
      <div className="column rounded-border-box hp-box">
        <SingleValueDisplay
          cursor={charPath(FIELD.maxHp)}
          name="Hit Point Maximum"
          transform={calculateCustomFormula}
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          cursor={charPath(FIELD.currHp)}
          name="Current Hit Points"
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          cursor={charPath(FIELD.tempHp)}
          name="Temporary Hit Points"
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          cursor={charPath(FIELD.exhaustion)}
          name="Exhaustion"
          flipped
          removeBorder
          editable
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
        <div className="column rounded-border-box tracker-box">
          <div className="column death-save-row">
            <span>Successes</span>
            <SlotPips
              total={3}
              expended={character.deathSaves.successes}
              fillMode
              onChange={(value) =>
                dispatch(
                  updateAt(charPath(FIELD.deathSaves).k("successes"), value),
                )
              }
            />
          </div>
          <div className="column death-save-row">
            <span>Failures</span>
            <SlotPips
              total={3}
              expended={character.deathSaves.failures}
              fillMode
              onChange={(value) =>
                dispatch(
                  updateAt(charPath(FIELD.deathSaves).k("failures"), value),
                )
              }
            />
          </div>
          <b className="section-heading">Death Saves</b>
        </div>
      </div>
      {/* Attacks */}
      <div className="column rounded-border-box">
        <table>
          <thead>
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
              const ammoTotal = linkedAmmo.reduce((sum, a) => sum + a.count, 0);
              return (
                <tr key={index}>
                  <td>
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
                  <td>
                    {attackBonus !== undefined
                      ? attackBonus > 0
                        ? `+${attackBonus}`
                        : attackBonus
                      : attack.save
                        ? formatSaveEffect(attack.save, character)
                        : "—"}
                  </td>
                  <td>
                    {formatCustomFormulaWithDamage(attack.formula, character)}
                  </td>
                  <td>
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
