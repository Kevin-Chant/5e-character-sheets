import {
  CoinType,
  DieOperation,
  FIELD,
  Operation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  calculateCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/formula";
import { getHitDice, totalGP } from "src/lib/rules";
import MultiLineTextDisplay from "./display/multi-line-text-display";
import SingleValueDisplay from "./display/single-value-display";
import SlotPips from "./display/slot-pips";
import RollButton from "./roll-button";
import { FaPencil } from "react-icons/fa6";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function DefenceAndEquipmentPanel() {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  const { editMode } = useEditMode();
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
    pushTargetedField(FIELD.attacks, "new");
  };
  const removeAttackRow = (index: number) => {
    const newValue = structuredClone(character.attacks);
    newValue.splice(index, 1);
    dispatch(updateData(FIELD.attacks, { value: newValue }));
  };
  return (
    <div className="column">
      {/* AC, Init, Speed */}
      <div className="row">
        <SingleValueDisplay
          field={FIELD.acFormula}
          transform={calculateCustomFormula}
          name="Armor Class"
          vertical
          editable
        />
        <SingleValueDisplay
          field={FIELD.initiativeFormula}
          name="Initiative"
          transform={calculateCustomFormula}
          vertical
          editable
          rollCheck="Initiative"
        />
        <SingleValueDisplay
          field={FIELD.speed}
          name="Speed"
          vertical
          editable
        />
      </div>
      {/* HP */}
      <div className="column rounded-border-box hp-box">
        <SingleValueDisplay
          field={FIELD.maxHp}
          name="Hit Point Maximum"
          transform={calculateCustomFormula}
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          field={FIELD.currHp}
          name="Current Hit Points"
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          field={FIELD.tempHp}
          name="Temporary Hit Points"
          flipped
          removeBorder
          editable
        />
        <SingleValueDisplay
          field={FIELD.exhaustion}
          name="Exhaustion"
          flipped
          removeBorder
          editable
        />
      </div>
      {/* Hit dice, death saves */}
      <div className="row">
        <div className="column rounded-border-box">
          <table>
            <thead>
              <tr>
                <th>
                  {editMode && (
                    <button
                      onClick={() => pushTargetedField(FIELD.totalHitDice)}
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
                        <RollButton
                          label={`Hit Die (${die})`}
                          formula={{
                            operation: Operation.addition,
                            operands: [
                              [1, die, DieOperation.roll],
                              StatKey.con,
                            ],
                          }}
                        />
                      </span>
                    </td>
                    <td>{totalHitDice[die] || 0}</td>
                    <td>
                      <SingleValueDisplay
                        field={FIELD.expendedHitDice}
                        subField={die}
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
          <b>Hit Dice</b>
        </div>
        <div className="column rounded-border-box">
          <div className="column death-save-row">
            <span>Successes</span>
            <SlotPips
              total={3}
              expended={character.deathSaves.successes}
              fillMode
              onChange={(value) =>
                dispatch(updateData(FIELD.deathSaves, { value }, "successes"))
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
                dispatch(updateData(FIELD.deathSaves, { value }, "failures"))
              }
            />
          </div>
          <b>Death Saves</b>
        </div>
      </div>
      {/* Attacks */}
      <div className="column rounded-border-box">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Atk Bonus</th>
              <th>Damage/Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {character.attacks.map((attack, index) => {
              const attackBonus = calculateCustomFormula(
                attack.bonus,
                character,
              );
              return (
                <tr key={index}>
                  <td>{attack.name}</td>
                  <td>{attackBonus > 0 ? `+${attackBonus}` : attackBonus}</td>
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
                            pushTargetedField(FIELD.attacks, index.toString());
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
                        damage={attack.formula}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row">
          <b>Weapon Attacks</b>
          {editMode && <button onClick={addAttackRow}>+</button>}
        </div>
      </div>
      {/* Equipment */}
      <div className="row rounded-border-box">
        <div className="column">
          {(Object.keys(CoinType) as CoinType[]).map((coinType) => {
            return (
              <SingleValueDisplay
                field={FIELD.coins}
                subField={coinType}
                name={coinType}
                flipped
                key={coinType}
                editable
              />
            );
          })}
          <SingleValueDisplay
            field={FIELD.coins}
            transform={totalGP}
            name={"Total Value"}
            flipped
          />
        </div>
        <MultiLineTextDisplay title="Equipment" field={FIELD.equipment} />
      </div>
    </div>
  );
}
