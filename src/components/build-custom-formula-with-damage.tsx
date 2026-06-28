import { FaPencil, FaPlus, FaTrash } from "react-icons/fa6";
import {
  DamageType,
  DieOperation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isCustomFormulaWithDamage } from "src/lib/types";
import { formatCustomFormula } from "src/lib/formula";
import { getFieldValue, traverse } from "src/lib/fields";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function BuildCustomFormulaWithDamage() {
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character || !targetedField) return <></>;
  let formulaWithDamage = getFieldValue(targetedField, character);
  if (subField) {
    formulaWithDamage = traverse(subField, formulaWithDamage);
  }
  if (!isCustomFormulaWithDamage(formulaWithDamage)) return <></>;

  const formulaEntries = Object.entries(formulaWithDamage);
  const usedDamageTypes = formulaEntries.map((entry) => entry[0]);
  const unusedDamageTypes = Object.keys(DamageType).filter(
    (dType) => !usedDamageTypes.includes(dType),
  );

  const addEntry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (unusedDamageTypes.length < 1) return;
    formulaEntries.push([
      unusedDamageTypes[0],
      [1, StandardDie.d6, DieOperation.roll],
    ]);
    dispatch(
      updateData(
        targetedField,
        {
          value: Object.fromEntries(formulaEntries),
        },
        subField,
      ),
    );
  };

  const updateFormula = (
    e: React.MouseEvent<HTMLButtonElement>,
    damageType: DamageType,
  ) => {
    e.preventDefault();
    const subFieldPrefix = subField ? subField + "." : "";
    pushTargetedField(targetedField, subFieldPrefix + damageType);
  };

  const updateDamageType = (
    e: React.ChangeEvent<HTMLSelectElement>,
    index: number,
  ) => {
    e.preventDefault();
    const formulaEntries = Object.entries(formulaWithDamage);
    formulaEntries[index][0] = e.target.value;
    dispatch(
      updateData(
        targetedField,
        {
          value: Object.fromEntries(formulaEntries),
        },
        subField,
      ),
    );
  };

  const removeEntry = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number,
  ) => {
    e.preventDefault();
    const formulaEntries = Object.entries(formulaWithDamage);
    formulaEntries.splice(index, 1);
    dispatch(
      updateData(
        targetedField,
        {
          value: Object.fromEntries(formulaEntries),
        },
        subField,
      ),
    );
  };

  return (
    <form className="formula-with-damage">
      <p className="modal-hint">
        Each damage type rolls its own dice and modifiers — e.g. 1d8 piercing
        plus 1d6 fire.
      </p>
      <div className="damage-entry-list">
        {(
          Object.entries(formulaWithDamage) as Array<
            [DamageType, CustomFormula]
          >
        ).map(([damageType, customFormula], index) => {
          return (
            <div className="damage-entry" key={index}>
              <button
                type="button"
                className="formula-edit-button"
                onClick={(e) => updateFormula(e, damageType)}
              >
                <span className="formula-preview">
                  {formatCustomFormula(customFormula, character, false)}
                </span>
                <FaPencil />
              </button>
              <select
                value={damageType}
                onChange={(e) => updateDamageType(e, index)}
              >
                {unusedDamageTypes.concat([damageType]).map((dType) => (
                  <option key={dType} value={dType}>
                    {dType}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn btn-danger"
                aria-label="Remove damage type"
                onClick={(e) => removeEntry(e, index)}
              >
                <FaTrash />
              </button>
            </div>
          );
        })}
      </div>
      {unusedDamageTypes.length > 0 && (
        <button type="button" className="add-row-button" onClick={addEntry}>
          <FaPlus /> Add damage type
        </button>
      )}
      <button className="btn-primary" onClick={saveData}>
        Save
      </button>
    </form>
  );
}
