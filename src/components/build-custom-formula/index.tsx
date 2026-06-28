import { useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  CustomFormula,
  isAtomicVariable,
  isCustomFormula,
} from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import { OPTIONAL_FIELD_INITIALIZERS } from "src/lib/rules";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";
import Switch from "react-switch";
import { useSave } from "../modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function BuildCustomFormula() {
  const { targetedField, subField } = useTargetedField();
  const { character, dispatch } = useCharacter();
  const [edit, setEdit] = useState(true);
  const { saveData } = useSave();

  if (!character || !targetedField) return <></>;

  let formula = getFieldValue(targetedField, character);
  if (!formula && OPTIONAL_FIELD_INITIALIZERS[targetedField]) {
    formula = OPTIONAL_FIELD_INITIALIZERS[targetedField]?.call(
      undefined,
      character,
    );
  }
  if (subField) {
    formula =
      traverse(subField, formula) ||
      OPTIONAL_FIELD_INITIALIZERS[targetedField]?.call(
        undefined,
        character,
        subField,
      );
  }

  if (!formula) {
    // TODO: empty state
    // Display function types or presets or (forgot the 3rd option)
    return <></>;
  }

  if (!isCustomFormula(formula)) return <></>;

  const setFormula = (newVal: CustomFormula) => {
    dispatch(updateData(targetedField, { value: newVal }, subField));
  };

  if (isAtomicVariable(formula)) {
    return (
      <form className="build-custom-formula">
        <div className="formula-canvas">
          <EditableAtomicVariable atomicVar={formula} setVar={setFormula} />
        </div>
        <button className="btn-primary" onClick={saveData}>
          Save
        </button>
      </form>
    );
  }

  return (
    <form className="build-custom-formula">
      <label className="edit-toggle">
        <Switch
          onChange={setEdit}
          checked={edit}
          height={20}
          width={40}
          onColor="#3992ff"
          uncheckedIcon={false}
          checkedIcon={false}
        />
        <span>{edit ? "Editing formula" : "Preview"}</span>
      </label>
      <div className="formula-canvas">
        <EditableExpression expr={formula} setExpr={setFormula} edit={edit} />
      </div>
      <button className="btn-primary" onClick={saveData}>
        Save
      </button>
    </form>
  );
}
