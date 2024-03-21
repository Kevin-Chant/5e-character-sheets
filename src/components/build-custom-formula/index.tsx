import { useEffect, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isAtomicVariable } from "src/lib/types";
import { getFieldValue } from "src/lib/utils";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";

export interface BuildCustomFormulaProps {
  onSubmit: (data: any) => void;
}

export default function BuildCustomFormula(props: BuildCustomFormulaProps) {
  const { targetedField } = useTargetedField();
  const { character } = useCharacter();
  const [edit, setEdit] = useState(false);

  const [formula, setFormula] = useState<CustomFormula | null>();
  useEffect(() => {
    if (character && targetedField) {
      setFormula(getFieldValue(targetedField, character));
    }
  }, [character, targetedField]);

  if (!character || !targetedField) return <></>;

  const onSubmit = () => {
    if (formula && targetedField) {
      props.onSubmit({ value: formula });
    }
  };

  if (!formula) {
    // TODO: empty state
    // Display function types or presets or (forgot the 3rd option)
    return <></>;
  }

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
        <EditableExpression
          expr={formula}
          setExpr={setFormula}
          edit={edit}
          setEdit={setEdit}
          fieldPath={targetedField}
        />
        <button className="margin-small" onClick={onSubmit}>
          Save
        </button>
      </div>
    </form>
  );
}
