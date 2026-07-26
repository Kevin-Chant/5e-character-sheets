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

// A compact numeric field with custom increment/decrement chevrons that match
// the sheet's accent + radius, replacing the browser's default spin buttons
// (which don't theme). Native spinners are suppressed in CSS; typing still works
// and the chevrons clamp to [min, max]. Used for the small inline counts in the
// equipment box (item quantity, ammunition).
//
// Typed edits commit on blur/Enter rather than per keystroke — setting a stack
// of 50 arrows used to write 5 and then 50. See `useDeferredNumber`.
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
