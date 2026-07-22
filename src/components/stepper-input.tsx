import classNames from "classnames";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";

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
export default function StepperInput({
  value,
  onChange,
  min = 0,
  max,
  ariaLabel,
  className,
}: StepperInputProps) {
  const clamp = (n: number) => {
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  };
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <span className={classNames("stepper", className)}>
      <input
        type="number"
        className="stepper-input"
        value={value}
        min={min}
        max={max}
        aria-label={ariaLabel}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
      />
      <span className="stepper-btns">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={atMax}
          onClick={(e) => {
            e.preventDefault();
            onChange(clamp(value + 1));
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
            onChange(clamp(value - 1));
          }}
        >
          <FaChevronDown />
        </button>
      </span>
    </span>
  );
}
