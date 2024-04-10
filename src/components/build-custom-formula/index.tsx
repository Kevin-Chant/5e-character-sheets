import { useEffect, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  CustomFormula,
  isAtomicVariable,
  isCustomFormula,
} from "src/lib/types";
import {
  getFieldValue,
  traverse,
  OPTIONAL_FIELD_INITIALIZERS,
} from "src/lib/utils";
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
      character
    );
  }
  if (subField) {
    formula =
      traverse(subField, formula) ||
      OPTIONAL_FIELD_INITIALIZERS[targetedField]?.call(
        undefined,
        character,
        subField
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
      <>
        <EditableAtomicVariable atomicVar={formula} setVar={setFormula} />
      </>
    );
  }

  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Formula Builder</b>
        </div>
        <div>
          <span className="margin-small">Edit</span>
          <Switch onChange={setEdit} checked={edit} />
        </div>
        <EditableExpression expr={formula} setExpr={setFormula} edit={edit} />
        <button className="margin-small" onClick={saveData}>
          Save
        </button>
      </div>
    </form>
  );
}
