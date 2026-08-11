import classNames from "classnames";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";

interface StepperInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
}

// Numeric field with themed increment/decrement chevrons (native spinners are
// suppressed in CSS). Chevrons clamp to [min, max]; typed edits commit on
// blur/Enter, not per keystroke. Used for small inline counts (item quantity,
// ammunition).
export default function StepperInput({
  value,
  onChange,
  min = 0,
  max,
  ariaLabel,
  className,
}: StepperInputProps) {
  const { step, atMin, atMax, inputProps } = useDeferredNumber({
    value,
    min,
    max,
    onCommit: onChange,
  });

  return (
    <span className={classNames("stepper", className)}>
      <input
        type="number"
        className="stepper-input"
        min={min}
        max={max}
        aria-label={ariaLabel}
        {...inputProps}
      />
      <span className="stepper-btns">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={atMax}
          onClick={(e) => {
            e.preventDefault();
            step(1);
          }}
        >
          <FaChevronUp />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={atMin}
          onClick={(e) => {
            e.preventDefault();
            step(-1);
          }}
        >
          <FaChevronDown />
        </button>
      </span>
    </span>
  );
}
