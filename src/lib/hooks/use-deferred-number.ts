import { useEffect, useState } from "react";

interface DeferredNumberOptions {
  value: number;
  // Called only when the value actually changes — a no-op write still costs an
  // undo entry and a live-session broadcast.
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}

// A numeric field committed on blur/Enter (Escape abandons), not per keystroke:
// committing each keystroke would clip against a max mid-type (typing "50"
// against max 49 sticks at "5"). Empty/unparseable reverts to the stored
// value rather than committing 0.
export function useDeferredNumber({
  value,
  onCommit,
  min = 0,
  max,
}: DeferredNumberOptions) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) =>
    Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, n));

  const commit = (n: number) => {
    const next = clamp(n);
    if (next !== value) onCommit(next);
    return next;
  };

  const commitDraft = () => {
    const parsed = parseInt(draft, 10);
    setDraft(String(isNaN(parsed) ? value : commit(parsed)));
  };

  // The ± buttons must step off this, not `value` — a button click blurs the
  // input first but its handler closes over the pre-blur render, so stepping
  // off the stored value made "type 8, click −" produce 11 instead of 7.
  const parsed = parseInt(draft, 10);
  const shown = isNaN(parsed) ? value : clamp(parsed);

  return {
    shown,
    atMin: shown <= min,
    atMax: max !== undefined && shown >= max,
    step: (delta: number) => setDraft(String(commit(shown + delta))),
    // Spread onto the <input>. Works for both `type="number"` and a plain text
    // field with `inputMode="numeric"`.
    inputProps: {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDraft(e.target.value.replace(/[^\d-]/g, "")),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitDraft();
        } else if (e.key === "Escape") {
          setDraft(String(value));
        }
      },
      onBlur: commitDraft,
    },
  };
}
