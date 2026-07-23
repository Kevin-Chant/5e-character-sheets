import classNames from "classnames";
import { uniq } from "lodash";
import { ReactNode, Ref, useEffect, useMemo, useRef, useState } from "react";
import { BuilderState } from "src/lib/builder/types";
import { SkillName, StatKey } from "src/lib/data/data-definitions";
import { FEATS } from "src/lib/builder/feats";
import { FeatChoices, emptyFeatChoices } from "src/lib/builder/level-up";
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { WEAPON_PRESETS } from "src/lib/data/weapon-presets";
import { OptionGroup } from "src/lib/builder/chosen-options";
import { DEFAULT_LANGUAGES } from "src/lib/data/option-lists";
import { searchSrdSpells, SrdSpell } from "src/lib/spells/srd-spells";

const LANGUAGE_OPTIONS = DEFAULT_LANGUAGES.flatMap((g) => g.options);

// Real skills (the SkillName enum also carries "Thieves Tools", a tool).
const SKILL_OPTIONS = Object.values(SkillName).filter(
  (s) => s !== SkillName["Thieves Tools"],
);
const WEAPON_OPTIONS = WEAPON_PRESETS.flatMap((g) =>
  g.options.map((w) => w.name),
);

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

// Picker for one of a class's closed option lists (Metamagic, maneuvers, a
// ranger's favored enemy). Shared by both wizards, since a level-1 pick during
// creation and a pick at level 10 are the same interaction.
//
// It offers only what's *new*: options already known from an earlier level are
// filtered out entirely, and the remaining boxes lock once `count` are ticked —
// the allowance is the whole point of the model, so the wizard enforces it
// rather than letting a player quietly over-pick.
export function ChosenOptionPicker({
  group,
  count,
  alreadyKnown,
  picked,
  onChange,
}: {
  group: OptionGroup;
  count: number;
  alreadyKnown: string[];
  picked: string[];
  onChange: (names: string[]) => void;
}) {
  const known = new Set(alreadyKnown);
  const atLimit = picked.length >= count;
  return (
    <Field
      label={group.label}
      hint={`Choose ${count}${alreadyKnown.length ? " more" : ""}.`}
    >
      {group.summary && (
        <p className="text-muted builder-hint">{group.summary}</p>
      )}
      <div className="column invocation-options">
        {group.options
          .filter((option) => !known.has(option.name))
          .map((option) => {
            const checked = picked.includes(option.name);
            return (
              <label key={option.name} className="row invocation-option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && atLimit}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...picked, option.name]
                        : picked.filter((n) => n !== option.name),
                    )
                  }
                />
                <span>
                  <b>{option.name}</b>
                  {option.summary && (
                    <span className="text-muted"> {option.summary}</span>
                  )}
                </span>
              </label>
            );
          })}
      </div>
    </Field>
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

// A text input with a suggestion dropdown that still accepts free-text entries.
// Replaces a native `<input list>` datalist, whose Chrome popup only appears on
// the *second* click of an empty field — this list shows on first focus.
function Combobox({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss on any click outside the widget.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Show every match — the list scrolls (see .builder-combobox-list max-height),
  // so no cap is needed, and a cap would silently hide options past it (e.g. the
  // exotic languages, which all sort after the 8 standard ones).
  const q = value.trim().toLowerCase();
  const matches = options.filter((o) => o.toLowerCase().includes(q));

  return (
    <div className="builder-combobox" ref={wrapRef}>
      <input
        className="builder-input"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="builder-combobox-list">
          {matches.map((o) => (
            <li key={o}>
              <button
                type="button"
                className="builder-combobox-option"
                // mousedown fires before the input's blur, so the pick lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One combobox per language slot: suggests standard/exotic languages but still
// accepts custom entries (same "default or custom" feel as the other fields).
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
        <Combobox
          key={i}
          value={value[i] ?? ""}
          options={LANGUAGE_OPTIONS}
          placeholder="Choose or type a language"
          onChange={(v) => set(i, v)}
        />
      ))}
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

export function SpellChecklist({
  className,
  level,
  selected,
  max,
  onChange,
}: {
  // Undefined shows every SRD spell (used for classes the catalog doesn't tag,
  // e.g. Artificer); a class name filters to that class's spell list.
  className?: string;
  level: number;
  selected: string[];
  max: number | null;
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const spells = useMemo(
    () => searchSrdSpells(query, className).filter((s) => s.level === level),
    [query, className, level],
  );
  const toggle = (index: string) => {
    if (selected.includes(index)) onChange(selected.filter((i) => i !== index));
    else if (max === null || selected.length < max)
      onChange([...selected, index]);
  };
  const atCap = max !== null && selected.length >= max;
  return (
    <div className="builder-spell-block">
      <input
        className="builder-input"
        placeholder="Search spells…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="builder-spell-list">
        {spells.length === 0 ? (
          <p className="builder-spell-empty text-muted">
            {query.trim()
              ? `No SRD spells match "${query.trim()}". Only SRD spells are searchable here — add spells from other books or homebrew manually from the sheet.`
              : "No SRD spells at this level. Add spells from other books or homebrew manually from the sheet."}
          </p>
        ) : (
          spells.map((s: SrdSpell) => {
            const on = selected.includes(s.index);
            return (
              <label
                key={s.index}
                className={
                  on ? "builder-spell-row selected" : "builder-spell-row"
                }
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && atCap}
                  onChange={() => toggle(s.index)}
                />
                {s.name}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

// The feat's own choices, shared by both wizards. `LevelUpState` and
// `BuilderState` both satisfy `FeatChoices` structurally, and the character's
// existing proficiencies come in as plain lists rather than a `Character` — so
// the creation wizard, which has no character yet, can pass what the wizard
// state implies instead.
export type FeatState = FeatChoices & { featIndex?: string };

export interface FeatPickerProps {
  state: FeatState;
  patch: (partial: Partial<FeatState>) => void;
  // Skills already proficient in / already doubled, and weapons already known.
  proficientSkills: SkillName[];
  expertSkills: SkillName[];
  knownWeapons: string[];
}

export function FeatPicker({
  state,
  patch,
  proficientSkills,
  expertSkills,
  knownWeapons,
}: FeatPickerProps) {
  const feat = FEATS.find((f) => f.index === state.featIndex);
  const grants = feat?.grants;
  // The names of any always-granted spells, for an informational line.
  const fixedSpellNames = [
    ...(grants?.fixedCantrips ?? []),
    ...(grants?.fixedSpells ?? []),
  ]
    .map((i) => getSrdSpell(i)?.name)
    .filter(Boolean);

  // A new skill proficiency must be one you don't already have. Expertise can
  // only apply to a skill you're proficient in — your existing proficiencies
  // plus any skill you're gaining from this same feat — and not one you already
  // have expertise in.
  const alreadyProficient = proficientSkills;
  const alreadyExpert = expertSkills;
  const skillOptions = SKILL_OPTIONS.filter(
    (s) => !alreadyProficient.includes(s),
  );
  const expertiseOptions = uniq([
    ...alreadyProficient,
    ...state.featSkillChoices,
  ]).filter((s: SkillName) => !alreadyExpert.includes(s));

  // When the chosen skill changes, drop any expertise pick that's no longer a
  // valid target (e.g. it was the skill just deselected).
  const setSkillChoices = (featSkillChoices: SkillName[]) => {
    const valid = new Set<SkillName>([
      ...alreadyProficient,
      ...featSkillChoices,
    ]);
    patch({
      featSkillChoices,
      featExpertiseChoices: state.featExpertiseChoices.filter((s) =>
        valid.has(s),
      ),
    });
  };

  return (
    <>
      <Field label="Feat">
        <select
          className="builder-input"
          value={state.featIndex ?? ""}
          onChange={(e) =>
            patch({
              featIndex: e.target.value || undefined,
              featAbilityChoice: undefined,
              ...emptyFeatChoices(),
            })
          }
        >
          <option value="">Choose a feat…</option>
          {FEATS.map((f) => (
            <option key={f.index} value={f.index}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      {feat && (
        <>
          {feat.prerequisite && (
            <p className="text-muted builder-hint">
              Prerequisite: {feat.prerequisite}
            </p>
          )}
          <p className="builder-hint">{feat.effect}</p>

          {/* Half-feat ability increase. A single fixed stat is shown as a
              static line so the +1 is never invisible; a choice of stats gets a
              picker. */}
          {feat.abilityIncrease &&
            (feat.abilityIncrease.from.length > 1 ? (
              <Field
                label={`Ability score increase (+${feat.abilityIncrease.by})`}
              >
                <select
                  className="builder-input"
                  value={
                    state.featAbilityChoice ?? feat.abilityIncrease.from[0]
                  }
                  onChange={(e) =>
                    patch({ featAbilityChoice: e.target.value as StatKey })
                  }
                >
                  {feat.abilityIncrease.from.map((s) => (
                    <option key={s} value={s}>
                      {STAT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Ability score increase">
                <p className="builder-hint">
                  +{feat.abilityIncrease.by}{" "}
                  {STAT_LABEL[feat.abilityIncrease.from[0]]}
                </p>
              </Field>
            ))}

          {grants?.chooseSkills && (
            <Field
              label={`Skill proficiency (choose ${grants.chooseSkills})`}
              hint="Skills you're already proficient in are hidden."
            >
              <ChipMultiSelect
                options={skillOptions}
                selected={state.featSkillChoices}
                max={grants.chooseSkills}
                onChange={setSkillChoices}
              />
            </Field>
          )}

          {grants?.chooseExpertise && (
            <Field
              label={`Expertise (choose ${grants.chooseExpertise})`}
              hint={
                expertiseOptions.length
                  ? "Only skills you're proficient in (including any chosen above) can gain expertise."
                  : "Choose a skill proficiency above first — expertise applies to a skill you're proficient in."
              }
            >
              <ChipMultiSelect
                options={expertiseOptions}
                selected={state.featExpertiseChoices}
                max={grants.chooseExpertise}
                onChange={(featExpertiseChoices) =>
                  patch({ featExpertiseChoices })
                }
              />
            </Field>
          )}

          {grants?.chooseWeapons && (
            <Field
              label={`Weapon proficiencies (choose ${grants.chooseWeapons})`}
            >
              <ChipMultiSelect
                options={WEAPON_OPTIONS.filter(
                  (w) => !knownWeapons.includes(w),
                )}
                selected={state.featWeaponChoices}
                max={grants.chooseWeapons}
                onChange={(featWeaponChoices) => patch({ featWeaponChoices })}
              />
            </Field>
          )}

          {fixedSpellNames.length > 0 && (
            <p className="text-muted builder-hint">
              You also learn: {fixedSpellNames.join(", ")}.
            </p>
          )}

          {grants?.chooseSpells?.map(({ level, count }) => (
            <Field
              key={level}
              label={
                level === 0
                  ? `Cantrips (choose ${count})`
                  : `Level ${level} spells (choose ${count})`
              }
            >
              <SpellChecklist
                level={level}
                selected={state.featSpellChoices[level] ?? []}
                max={count}
                onChange={(indices) =>
                  patch({
                    featSpellChoices: {
                      ...state.featSpellChoices,
                      [level]: indices,
                    },
                  })
                }
              />
            </Field>
          ))}
        </>
      )}
    </>
  );
}
