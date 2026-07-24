import { useEffect, useMemo, useRef, useState } from "react";
import { uniq } from "lodash";
import { REAL_SKILLS, SkillName, StatKey } from "src/lib/data/data-definitions";
import { DEFAULT_LANGUAGES } from "src/lib/data/option-lists";
import { WEAPON_PRESETS } from "src/lib/data/weapon-presets";
import { FEATS } from "src/lib/builder/feats";
import { FeatChoices } from "src/lib/builder/feats";
import { emptyFeatChoices } from "src/lib/builder/level-up";
import { OptionGroup } from "src/lib/builder/chosen-options";
import {
  getSrdSpell,
  searchSrdSpells,
  SrdSpell,
} from "src/lib/spells/srd-spells";
import {
  ChipMultiSelect,
  Field,
  SingleChoice,
  STAT_LABEL,
} from "./builder-common";

// Domain-aware pickers for the two wizards — the widgets that know about
// spells, feats, languages and class option lists. Split from
// `builder-common.tsx`, which is now just layout primitives (Field, ChoiceGrid,
// ChipMultiSelect); mixing the two had turned that file into a grab-bag.

const LANGUAGE_OPTIONS = DEFAULT_LANGUAGES.flatMap((g) => g.options);
const WEAPON_OPTIONS = WEAPON_PRESETS.flatMap((g) =>
  g.options.map((w) => w.name),
);

export type FeatState = FeatChoices & { featIndex?: string };

export interface FeatPickerProps {
  state: FeatState;
  patch: (partial: Partial<FeatState>) => void;
  // Skills already proficient in / already doubled, and weapons already known.
  proficientSkills: SkillName[];
  expertSkills: SkillName[];
  knownWeapons: string[];
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
  const offered = group.options.filter((option) => !known.has(option.name));
  return (
    <Field
      label={group.label}
      hint={`Choose ${count}${alreadyKnown.length ? " more" : ""}.`}
    >
      {group.summary && (
        <p className="text-muted builder-hint">{group.summary}</p>
      )}
      {/* Picking one of many is a single choice, so it gets the shared widget
          that decides between radios and a dropdown by list length — a ranger's
          fourteen favored enemies were fourteen checkboxes. Multi-pick groups
          (two maneuvers, three metamagics) stay checkboxes: the cap and the
          running count are the point there, and a multi-select does neither. */}
      {count === 1 ? (
        <SingleChoice
          name={group.label}
          value={picked[0]}
          onChange={(next) => onChange(next ? [next] : [])}
          options={offered.map((option) => ({
            value: option.name,
            label: option.name,
            summary: option.summary,
          }))}
        />
      ) : (
        <div className="column invocation-options">
          {offered.map((option) => {
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
      )}
    </Field>
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
  const skillOptions = REAL_SKILLS.filter(
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
