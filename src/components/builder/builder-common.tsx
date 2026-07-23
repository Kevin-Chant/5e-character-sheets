import classNames from "classnames";
import { ReactNode, Ref } from "react";
import { BuilderState } from "src/lib/builder/types";

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

// A search box that filters a ChoiceGrid (races, classes). Kept above the grid.
export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      className="builder-input builder-filter"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
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

// The feat's own choices, shared by both wizards. `LevelUpState` and
// `BuilderState` both satisfy `FeatChoices` structurally, and the character's
// existing proficiencies come in as plain lists rather than a `Character` — so
// the creation wizard, which has no character yet, can pass what the wizard
// state implies instead.
