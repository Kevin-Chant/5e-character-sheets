import { useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  CustomFormula,
  isAtomicVariable,
  isCustomFormula,
} from "src/lib/types";
import { getFieldValue, traverse } from "src/lib/fields";
import { StatKey } from "src/lib/data/data-definitions";
import { getOptionalInitializer } from "src/lib/rules";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";
import Switch from "react-switch";
import { useSave } from "../modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";

export default function BuildCustomFormula() {
  const { targetedField, subField } = useTargetedField();
  const { character, dispatch } = useCharacter();
  const [edit, setEdit] = useState(true);
  const { saveData } = useSave();

  if (!character || !targetedField) return <></>;

  let formula = getFieldValue(targetedField, character);
  if (!formula) {
    formula = getOptionalInitializer(targetedField, undefined, character);
  }
  if (subField) {
    formula =
      traverse(subField, formula) ||
      getOptionalInitializer(targetedField, subField, character);
  }

  const setFormula = (newVal: CustomFormula) => {
    dispatch(
      updateAt(fromStack<CustomFormula>(targetedField, subField), newVal),
    );
  };

  if (!formula) {
    // Nothing stored yet — offer starting points that seed an editable
    // formula; picking one drops straight into the editor rendered below.
    return (
      <div className="build-custom-formula column">
        <p className="font-large bold">Build a formula</p>
        <i>Start from a single value or an expression, then customize it.</i>
        <button type="button" onClick={() => setFormula(0)}>
          Single value
        </button>
        <button
          type="button"
          onClick={() =>
            setFormula({ operation: "addition", operands: [StatKey.dex, 2] })
          }
        >
          Expression
        </button>
      </div>
    );
  }

  if (!isCustomFormula(formula)) return <></>;

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
