import { ReactNode, useState } from "react";
import { useDeferredNumber } from "src/lib/hooks/use-deferred-number";

// The play surface's third numeric shape, declared once so it stops being
// re-invented: a value that reads as text until you click it, then becomes a
// deferred number field that closes when the edit ends.
//
// It exists for corrections rather than for play — setting hit points to exactly
// 14 after a stat-block fix, changing how long a condition has left. Those are
// rare enough that a permanent input beside every number would be five controls
// competing for the eye with the one you actually reach for, and important
// enough that they can't live in a menu. Hiding them behind the number they
// edit puts them exactly where you'd look.
//
// Commit semantics come from `useDeferredNumber` (blur or Enter commits,
// Escape reverts, empty reverts rather than writing 0); the only addition is
// that all three of those also *close* the editor, because a revealed field
// with no way back is a trap.
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
  // The button announces the act ("Set Grish hit points directly"); the input
  // announces the field ("Grish hit points"). Same control, two moments.
  buttonLabel: string;
  inputLabel: string;
  title?: string;
  className?: string;
  inputClassName?: string;
  // Show a stored 0 as an empty box — for fields where zero means "unset"
  // rather than the number zero. Typing 0 still says zero unambiguously.
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

// A separate component so the draft state inside `useDeferredNumber` is born
// with the editor and dies with it — mounting it alongside the button would
// leave a stale draft waiting for the next reveal.
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
