import { FIELD } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isAtomicVariable, isExpression } from "src/lib/types";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";

interface EditableCustomFormulaProps {
  formula: CustomFormula;
  setFormula: (newVal: CustomFormula) => void;
  removeOperand?: () => void;
  fieldPath: FIELD;
}

export function EditableCustomFormula({
  formula,
  setFormula,
  removeOperand,
  fieldPath,
}: EditableCustomFormulaProps) {
  const { pushTargetedField } = useTargetedField();
  const { character } = useCharacter();
  if (!character) return <></>;
  if (isAtomicVariable(formula)) {
    return (
      <EditableAtomicVariable
        atomicVar={formula}
        setVar={setFormula}
        removeVar={removeOperand}
      />
    );
  }
  if (isExpression(formula)) {
    return (
      <div className="column">
        <button onClick={removeOperand}>x</button>
        <EditableExpression
          expr={formula}
          setExpr={setFormula}
          edit={false}
          setEdit={() => {
            pushTargetedField(fieldPath);
          }}
          fieldPath={fieldPath}
        />
      </div>
    );
  }
  throw new Error(
    "Reached unreachable code in EditableCustomFormula due to" +
      JSON.stringify(formula)
  );
}
