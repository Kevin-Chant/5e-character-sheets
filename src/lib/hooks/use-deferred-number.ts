import { useEffect, useState } from "react";

interface DeferredNumberOptions {
  // The stored value — the source of truth the field displays and reverts to.
  value: number;
  // Called only when the value actually changes. Every character edit lands in
  // undo history and is broadcast to a live session, so a no-op write isn't free.
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}

// A numeric field whose edits are committed when the edit is *finished*, not on
// every keystroke.
//
// Committing per keystroke looks harmless and isn't: typing 50 wrote 5 and then
// 50 — two undo entries, two messages to every peer in a live session, and a
// flicker through a value the player never meant. Worse, with a maximum in play
// it's lossy rather than merely noisy: typing "50" against a max of 49 passes
// through 5, and a typist who pauses after the first digit leaves it there.
//
// So the draft is local text, and the commit happens on blur or Enter; Escape
// abandons it. An empty or unparseable field reverts to the stored value rather
// than persisting a 0 — clearing a field is more often abandonment than an
// intent to zero it, and typing "0" says that unambiguously.
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

  // What the field currently *reads*, which is no longer always what's stored.
  // Anything acting on the field (the ± buttons, their disabled states) has to
  // work from this: clicking a button blurs the input first, but the click
  // handler still closes over the value from the render before that commit — so
  // stepping off the stored value made "type 8, click −" produce 11, not 7.
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
