import React from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";

import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/formula";
import { getFieldValue } from "src/lib/fields";
import { FaPencil } from "react-icons/fa6";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import { Attack } from "src/lib/types";

export default function EditAttack() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (
    !character ||
    !targetedField ||
    !subField ||
    subField.split(".").length > 1
  )
    return <></>;

  // Re-enter the typed world from the string stack: the modal knows it points at
  // a single Attack (bare index subField, guarded above).
  const attackCursor = fromStack<Attack>(targetedField, subField);
  const attack = getFieldValue(FIELD.attacks, character)[subField];

  const updateName = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    dispatch(updateAt(attackCursor.k("name"), e.target.value));
  };

  const editBonus = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(attackCursor.k("bonus"));
  };

  const editFormula = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(attackCursor.k("formula"));
  };

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData();
  };

  return (
    <form className="edit-attack">
      <label className="field">
        <span className="field-label">Attack name</span>
        <input
          type="text"
          value={attack.name}
          onChange={updateName}
          placeholder="e.g. Greatsword"
        />
      </label>
      <div className="formula-field-grid">
        <div className="field">
          <span className="field-label">To-hit bonus</span>
          <button className="formula-edit-button" onClick={editBonus}>
            <span className="formula-preview">
              {formatCustomFormula(attack.bonus, character, false)}
            </span>
            <FaPencil />
          </button>
        </div>
        <div className="field">
          <span className="field-label">Damage on hit</span>
          <button className="formula-edit-button" onClick={editFormula}>
            <span className="formula-preview">
              {formatCustomFormulaWithDamage(attack.formula, character, false)}
            </span>
            <FaPencil />
          </button>
        </div>
      </div>
      <button className="btn-primary" onClick={onSubmit}>
        Save
      </button>
    </form>
  );
}
