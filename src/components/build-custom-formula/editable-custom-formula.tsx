import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { CustomFormula, isAtomicVariable, isExpression } from "src/lib/types";
import { formatAtomicVariable, formatCustomFormula } from "src/lib/formula";
import { FaChevronRight, FaXmark } from "react-icons/fa6";

interface EditableCustomFormulaProps {
  formula: CustomFormula;
  setFormula: (newVal: CustomFormula) => void;
  removeOperand?: () => void;
  subField?: string;
  /** Whether this operand's inline editor is the one currently open. */
  open?: boolean;
  /** Toggle this operand's inline editor (only meaningful for atoms). */
  onToggle?: () => void;
}

export function EditableCustomFormula({
  formula,
  removeOperand,
  subField,
  open,
  onToggle,
}: EditableCustomFormulaProps) {
  const { targetedField, pushTargetedField } = useTargetedField();
  const { character } = useCharacter();
  if (!character || !targetedField) return <></>;

  if (isAtomicVariable(formula)) {
    // A value pip; clicking opens its editor inline beneath the formula line.
    return (
      <button
        type="button"
        className={`formula-pip${open ? " open" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          onToggle?.();
        }}
      >
        {formatAtomicVariable(formula, character, false)}
      </button>
    );
  }

  if (isExpression(formula)) {
    // A nested sub-formula is a pip you drill into (back button returns here),
    // so the inline expression stays compact no matter how deep it nests.
    return (
      <span className="formula-pip-wrap">
        <button
          type="button"
          className="formula-pip formula-pip-group"
          onClick={(e) => {
            e.preventDefault();
            pushTargetedField(targetedField, subField);
          }}
        >
          {formatCustomFormula(formula, character, false)}
          <FaChevronRight className="formula-pip-chevron" />
        </button>
        {removeOperand && (
          <button
            type="button"
            className="formula-pip-remove"
            title="Remove"
            aria-label="Remove operand"
            onClick={(e) => {
              e.preventDefault();
              removeOperand();
            }}
          >
            <FaXmark />
          </button>
        )}
      </span>
    );
  }
  throw new Error(
    "Reached unreachable code in EditableCustomFormula due to" +
      JSON.stringify(formula),
  );
}
