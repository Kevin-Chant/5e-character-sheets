import { without } from "lodash";
import React, { useEffect, useState } from "react";
import {
  FIELD,
  OfficialClass,
  OfficialSubclasses,
  StandardDie,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  Attack,
  DieDefinition,
  HitDice,
  IClass,
  isOfficialClass,
} from "src/lib/types";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
  getFieldValue,
  getHitDice,
  traverse,
} from "src/lib/utils";
import { FaPencil } from "react-icons/fa6";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function EditAttack() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { saveData } = useSave();

  if (
    !character ||
    !targetedField ||
    !subField ||
    subField.split(".").length > 1
  )
    return <></>;

  const attack = getFieldValue(FIELD.attacks, character)[subField];

  const updateName = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    dispatch(
      updateData(targetedField, { value: e.target.value }, subField + ".name")
    );
  };

  const editBonus = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushTargetedField(targetedField, `${subField}.bonus`);
  };

  const editFormula = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushTargetedField(targetedField, `${subField}.formula`);
  };

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData();
  };

  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Edit Attack</b>
        </div>
        <table>
          <tr>
            <th>Attack Name</th>
            <th>To-hit Bonus</th>
            <th>Damage on hit</th>
          </tr>
          <tr>
            <td>
              <input type="text" value={attack.name} onChange={updateName} />
            </td>
            <td>
              <div className="column">
                <button onClick={editBonus}>
                  <FaPencil></FaPencil>
                </button>
                <p>{formatCustomFormula(attack.bonus, character, false)}</p>
              </div>
            </td>
            <td>
              <div className="column">
                <button onClick={editFormula}>
                  <FaPencil></FaPencil>
                </button>
                <p>
                  {formatCustomFormulaWithDamage(
                    attack.formula,
                    character,
                    false
                  )}
                </p>
              </div>
            </td>
          </tr>
        </table>
        <button className="margin-small" onClick={onSubmit}>
          Save
        </button>
      </div>
    </form>
  );
}
