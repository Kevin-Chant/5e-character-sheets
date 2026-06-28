import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isAtomicVariable, isExpression } from "src/lib/types";
import { EditableAtomicVariable } from "./editable-atomic-variable";
import { EditableExpression } from "./editable-expression";
import { FaPencil, FaTrash } from "react-icons/fa6";

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
      <div className="formula-operand">
        <div className="formula-operand-controls">
          <button
            type="button"
            className="icon-btn"
            title="Edit formula"
            aria-label="Edit formula"
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(targetedField, subField);
            }}
          >
            <FaPencil />
          </button>
          {removeOperand && (
            <button
              type="button"
              className="icon-btn btn-danger"
              title="Remove"
              aria-label="Remove operand"
              onClick={(e) => {
                e.preventDefault();
                removeOperand();
              }}
            >
              <FaTrash />
            </button>
          )}
        </div>
        <div className="formula-operand-body">
          <EditableExpression
            expr={formula}
            setExpr={setFormula}
            edit={false}
            subField={subField}
          />
        </div>
      </div>
    );
  }
  throw new Error(
    "Reached unreachable code in EditableCustomFormula due to" +
      JSON.stringify(formula),
  );
}
