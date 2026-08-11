import classNames from "classnames";
import { ReactNode, Ref } from "react";
import { BuilderState } from "src/lib/builder/types";
import Select from "src/components/select";

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

// One option in a `SingleChoice`.
export interface SingleOption {
  value: string;
  label: string;
  // Shown beside the radio, or under the select once chosen.
  summary?: ReactNode;
}

// Above this many options, a radio list becomes a filtering dropdown.
const DROPDOWN_THRESHOLD = 3;

// Pick exactly one option, rendered as radios (<= threshold) or a filtering
// dropdown, with the chosen option's summary kept below it either way.
export function SingleChoice({
  options,
  value,
  onChange,
  name,
  label,
  placeholder = "Choose…",
}: {
  options: SingleOption[];
  value?: string;
  onChange: (next: string | undefined) => void;
  // Radio-group name; required so two groups on one step don't share state.
  name: string;
  // Accessible label, separate from `name` (which is sometimes machine-shaped, e.g. "asi-slot-0").
  label?: string;
  placeholder?: string;
}) {
  if (options.length > DROPDOWN_THRESHOLD) {
    const chosen = options.find((o) => o.value === value);
    return (
      <>
        <Select
          className="builder-input"
          label={label ?? name}
          placeholder={placeholder}
          value={value ?? ""}
          options={options.map((o) => ({
            value: o.value,
            label: o.label,
            // Only plain-string summaries: the hint doubles as filter text.
            hint: typeof o.summary === "string" ? o.summary : undefined,
          }))}
          onChange={(next) => onChange(next || undefined)}
        />
        {chosen?.summary && (
          <p className="text-muted builder-hint">{chosen.summary}</p>
        )}
      </>
    );
  }
  return (
    <div className="column">
      {options.map((o) => (
        <label key={o.value} className="builder-radio">
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>
            {o.label}
            {o.summary && <span className="text-muted"> {o.summary}</span>}
          </span>
        </label>
      ))}
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

// One entry per line of a textarea (personality traits, extra equipment).
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
