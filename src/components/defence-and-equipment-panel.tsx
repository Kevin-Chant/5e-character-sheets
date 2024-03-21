import { CoinType, StandardDie } from "src/lib/data/data-definitions";
import { FIELD } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  calculateCustomFormula,
  formatCustomFormulaWithDamage,
  modifier,
  totalGP,
} from "src/lib/utils";
import MultiLineTextDisplay from "./display/multi-line-text-display";
import SingleValueDisplay from "./display/single-value-display";

export default function DefenceAndEquipmentPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
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
          field={FIELD["stats.dex"]}
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
          transform={calculateCustomFormula}
          name="Hit Point Maximum"
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
                <th> </th>
                <th>Total</th>
                <th>Expended</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(StandardDie) as StandardDie[]).map((die) => {
                const dieInfo = character.hitDice[die] || {
                  total: 0,
                  expended: 0,
                };
                return (
                  <tr key={die}>
                    <td>{die}</td>
                    <td>{dieInfo.total}</td>
                    <td>{dieInfo.expended}</td>
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
          />
        </div>
        <div className="column rounded-border-box">
          <SingleValueDisplay
            name="Successes"
            field={FIELD.deathSaves}
            transform={(deathSaves) => deathSaves.successes}
            flipped
            removeBorder
          />
          <SingleValueDisplay
            name="Failures"
            field={FIELD.deathSaves}
            transform={(deathSaves) => deathSaves.failures}
            flipped
            removeBorder
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
            </tr>
          </thead>
          <tbody>
            {character.attacks.map((attack, index) => {
              return (
                <tr key={index}>
                  <td>{attack.name}</td>
                  <td>{calculateCustomFormula(attack.bonus, character)}</td>
                  <td>
                    {formatCustomFormulaWithDamage(attack.formula, character)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <b>Attacks & Spellcasting</b>
      </div>
      {/* Equipment */}
      <div className="row rounded-border-box">
        <div className="column">
          {(Object.keys(CoinType) as CoinType[]).map((coinType) => {
            return (
              <SingleValueDisplay
                field={FIELD.coins}
                transform={(coins) => coins[coinType] || 0}
                name={coinType}
                flipped
                key={coinType}
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
