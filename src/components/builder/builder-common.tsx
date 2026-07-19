import classNames from "classnames";
import { ReactNode, Ref } from "react";
import { BuilderState } from "src/lib/builder/types";
import { DEFAULT_LANGUAGES } from "src/lib/data/option-lists";

const LANGUAGE_OPTIONS = DEFAULT_LANGUAGES.flatMap((g) => g.options);

// Every wizard step receives the working state and a shallow-merge patcher.
export interface StepProps {
  state: BuilderState;
  patch: (partial: Partial<BuilderState>) => void;
}

// A grid of large selectable cards (races, classes, backgrounds, start modes).
export interface Choice {
  key: string;
  title: string;
  subtitle?: ReactNode;
  selected: boolean;
  onClick: () => void;
}

export function ChoiceGrid({ choices }: { choices: Choice[] }) {
  return (
    <div className="builder-choice-grid">
      {choices.map((c) => (
        <button
          key={c.key}
          type="button"
          className={classNames("builder-choice", { selected: c.selected })}
          aria-pressed={c.selected}
          onClick={c.onClick}
        >
          <span className="builder-choice-title">{c.title}</span>
          {c.subtitle && (
            <span className="builder-choice-subtitle text-muted">
              {c.subtitle}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Toggle chips for "choose up to N" from a list. Enforces the cap and reports
// how many remain so the parent can gate progression.
export function ChipMultiSelect<T extends string>({
  options,
  selected,
  max,
  onChange,
  label,
}: {
  options: readonly T[];
  selected: T[];
  max: number;
  onChange: (next: T[]) => void;
  label?: (option: T) => string;
}) {
  const toggle = (opt: T) => {
    if (selected.includes(opt)) onChange(selected.filter((o) => o !== opt));
    else if (selected.length < max) onChange([...selected, opt]);
  };
  const remaining = max - selected.length;
  return (
    <div className="builder-chips-block">
      <div className="builder-chips">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              className={classNames("builder-chip", { selected: on })}
              aria-pressed={on}
              disabled={!on && remaining === 0}
              onClick={() => toggle(opt)}
            >
              {label ? label(opt) : opt}
            </button>
          );
        })}
      </div>
      <span className="text-muted builder-hint">
        {remaining > 0
          ? `Choose ${remaining} more`
          : max > 0
            ? "All choices made"
            : ""}
      </span>
    </div>
  );
}

// A labelled section wrapper used throughout the steps.
export function Field({
  label,
  hint,
  children,
  innerRef,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  innerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="builder-field" ref={innerRef}>
      <label className="builder-field-label">{label}</label>
      {hint && <span className="text-muted builder-hint">{hint}</span>}
      {children}
    </div>
  );
}

// A simple editor for a list of short text lines (personality traits, extra
// equipment) — one entry per line of a textarea.
export function LinesInput({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string[];
  onChange: (lines: string[]) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="builder-textarea"
      rows={rows}
      placeholder={placeholder}
      value={value.join("\n")}
      onChange={(e) =>
        onChange(e.target.value.split("\n").map((l) => l.replace(/^\s+/, "")))
      }
    />
  );
}

// One datalist-backed input per language slot: a dropdown of standard/exotic
// languages that still accepts custom entries (same "default or custom" feel as
// the other suggestion fields).
export function LanguagePicker({
  count,
  value,
  onChange,
}: {
  count: number;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const set = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="builder-language-picker">
      {Array.from({ length: count }).map((_, i) => (
        <input
          key={i}
          className="builder-input"
          list="builder-languages"
          placeholder="Choose or type a language"
          value={value[i] ?? ""}
          onChange={(e) => set(i, e.target.value)}
        />
      ))}
      <datalist id="builder-languages">
        {LANGUAGE_OPTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </div>
  );
}

// The stat abbreviations shown in the ability-score step.
export const STAT_LABEL: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const patchPersonality = (
  state: BuilderState,
  key: keyof BuilderState["personality"],
  lines: string[],
): Partial<BuilderState> => ({
  personality: { ...state.personality, [key]: lines },
});
