import { useCharacter } from "src/lib/hooks/use-character";
import { CustomFormula, isAtomicVariable, isExpression } from "src/lib/types";
import { formatAtomicVariable, formatCustomFormula } from "src/lib/formula";
import { FaChevronRight, FaXmark } from "react-icons/fa6";

interface EditableCustomFormulaProps {
  formula: CustomFormula;
  removeOperand?: () => void;
  /** Whether this operand's inline editor is the one currently open. */
  open?: boolean;
  /** Toggle this operand's inline editor open/closed. */
  onToggle?: () => void;
}

export function EditableCustomFormula({
  formula,
  removeOperand,
  open,
  onToggle,
}: EditableCustomFormulaProps) {
  const { character } = useCharacter();
  if (!character) return <></>;

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
    // A nested sub-formula; clicking expands its editor inline below the line so
    // the parent formula stays visible above it (no modal drilling).
    return (
      <span className="formula-pip-wrap">
        <button
          type="button"
          className={`formula-pip formula-pip-group${open ? " open" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            onToggle?.();
          }}
        >
          {formatCustomFormula(formula, character, false)}
          <FaChevronRight
            className={`formula-pip-chevron${open ? " open" : ""}`}
          />
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
