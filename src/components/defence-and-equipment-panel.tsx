import {
  CoinType,
  DamageType,
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
  getHitDice,
  getHpFormula,
  modifier,
  totalGP,
} from "src/lib/utils";
import MultiLineTextDisplay from "./display/multi-line-text-display";
import SingleValueDisplay from "./display/single-value-display";
import { FaPencil } from "react-icons/fa6";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function DefenceAndEquipmentPanel() {
  const { character, dispatch } = useCharacter();
  const { pushTargetedField } = useTargetedField();
  if (!character) return <></>;
  const totalHitDice = character.totalHitDice || getHitDice(character);
  const hitDice = [
    StandardDie.d4,
    StandardDie.d6,
    StandardDie.d8,
    StandardDie.d10,
    StandardDie.d12,
  ] as const;
  const addAttackRow = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const newValue = JSON.parse(JSON.stringify(character.attacks));
    newValue.push({
      name: "Shortsword",
      bonus: {
        operation: Operation.addition,
        operands: [StatKey.dex, "proficiencyBonus"],
      },
      formula: {
        [DamageType.Piercing]: {
          operation: Operation.addition,
          operands: [[1, StandardDie.d6, DieOperation.roll], StatKey.dex],
        },
      },
    });
    dispatch(updateData(FIELD.attacks, { value: newValue }));
    pushTargetedField(FIELD.attacks, (newValue.length - 1).toString());
  };
  const removeAttackRow = (index: number) => {
    const newValue = JSON.parse(JSON.stringify(character.attacks));
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
          field={FIELD.stats}
          subField="dex"
          name="Initiative"
          transform={(dex) => modifier(dex)}
          vertical
        />
        <SingleValueDisplay
          field={FIELD.speed}
          name="Speed"
          vertical
          editable
        />
      </div>
      {/* HP */}
      <div className="column rounded-border-box">
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
      </div>
      {/* Hit dice, death saves, exhaustion */}
      <div className="row">
        <div className="column rounded-border-box">
          <table>
            <thead>
              <tr>
                <th>
                  <button onClick={() => pushTargetedField(FIELD.totalHitDice)}>
                    <FaPencil />
                  </button>
                </th>
                <th>Total</th>
                <th>Expended</th>
              </tr>
            </thead>
            <tbody>
              {hitDice.map((die) => {
                return (
                  <tr key={die}>
                    <td>{die}</td>
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
        <div className="rounded-border-box">
          <SingleValueDisplay
            name="Exhaustion"
            field={FIELD.exhaustion}
            flipped
            removeBorder
            editable
          />
        </div>
        <div className="column rounded-border-box">
          <SingleValueDisplay
            name="Successes"
            field={FIELD.deathSaves}
            subField="successes"
            flipped
            removeBorder
            editable
          />
          <SingleValueDisplay
            name="Failures"
            field={FIELD.deathSaves}
            subField="failures"
            flipped
            removeBorder
            editable
          />
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
                character
              );
              return (
                <tr key={index}>
                  <td>{attack.name}</td>
                  <td>{attackBonus > 0 ? `+${attackBonus}` : attackBonus}</td>
                  <td>
                    {formatCustomFormulaWithDamage(attack.formula, character)}
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        pushTargetedField(FIELD.attacks, index.toString());
                      }}
                    >
                      <FaPencil />
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        removeAttackRow(index);
                      }}
                    >
                      x
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row">
          <b>Attacks & Spellcasting</b>
          <button onClick={addAttackRow}>+</button>
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
