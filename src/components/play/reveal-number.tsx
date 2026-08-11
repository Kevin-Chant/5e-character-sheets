import { ReactNode, useState } from "react";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";

// A value that reads as text until clicked, then becomes a deferred number
// field (for corrections — e.g. setting HP exactly after a stat-block fix).
// Commit semantics come from useDeferredNumber (blur/Enter commits, Escape
// reverts); blur/Enter/Escape here also close the editor.
export default function RevealNumber({
  value,
  onCommit,
  min,
  max,
  buttonLabel,
  inputLabel,
  title,
  className,
  inputClassName,
  blankZero,
  children,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  buttonLabel: string;
  inputLabel: string;
  title?: string;
  className?: string;
  inputClassName?: string;
  // Shows a stored 0 as an empty box (zero means "unset"); typing 0 still commits as zero.
  blankZero?: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={buttonLabel}
        onClick={() => setEditing(true)}
      >
        {children}
      </button>
    );
  }

  return (
    <RevealedInput
      value={value}
      onCommit={onCommit}
      min={min}
      max={max}
      inputLabel={inputLabel}
      inputClassName={inputClassName}
      blankZero={blankZero}
      done={() => setEditing(false)}
    />
  );
}

// Separate component so useDeferredNumber's draft state is born/dies with the editor.
function RevealedInput({
  value,
  onCommit,
  min,
  max,
  inputLabel,
  inputClassName,
  blankZero,
  done,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  inputLabel: string;
  inputClassName?: string;
  blankZero?: boolean;
  done: () => void;
}) {
  const { inputProps } = useDeferredNumber({ value, min, max, onCommit });
  return (
    <input
      type="text"
      inputMode="numeric"
      className={inputClassName}
      aria-label={inputLabel}
      autoFocus
      {...inputProps}
      value={blankZero && inputProps.value === "0" ? "" : inputProps.value}
      onBlur={() => {
        inputProps.onBlur();
        done();
      }}
      onKeyDown={(e) => {
        inputProps.onKeyDown(e);
        if (e.key === "Enter" || e.key === "Escape") done();
      }}
    />
  );
}
