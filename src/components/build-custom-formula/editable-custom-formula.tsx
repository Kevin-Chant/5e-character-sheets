import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isAtomicVariable, isExpression } from "src/lib/types";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";
import { FaPencil } from "react-icons/fa6";

interface EditableCustomFormulaProps {
  formula: CustomFormula;
  setFormula: (newVal: CustomFormula) => void;
  removeOperand?: () => void;
  subField?: string;
}

export function EditableCustomFormula({
  formula,
  setFormula,
  removeOperand,
  subField,
}: EditableCustomFormulaProps) {
  const { targetedField, pushTargetedField } = useTargetedField();
  const { character } = useCharacter();
  if (!character || !targetedField) return <></>;
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
        <div className="row">
          <button
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(targetedField, subField);
            }}
          >
            <FaPencil />
          </button>
          {removeOperand && (
            <button
              onClick={(e) => {
                e.preventDefault();
                removeOperand();
              }}
            >
              x
            </button>
          )}
        </div>
        <EditableExpression
          expr={formula}
          setExpr={setFormula}
          edit={false}
          subField={subField}
        />
      </div>
    );
  }
  throw new Error(
    "Reached unreachable code in EditableCustomFormula due to" +
      JSON.stringify(formula)
  );
}
