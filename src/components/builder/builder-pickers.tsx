import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { uniq } from "lodash";
import {
  REAL_SKILLS,
  SkillName,
  spellLevelLabel,
  StatKey,
} from "src/lib/data/data-definitions";
import { DEFAULT_LANGUAGES, DEFAULT_TOOLS } from "src/lib/data/option-lists";
import { WEAPON_PRESETS } from "src/lib/data/weapon-presets";
import { FEATS } from "src/lib/builder/feats";
import { FeatChoices } from "src/lib/builder/feats";
import { emptyFeatChoices } from "src/lib/builder/level-up";
import { OptionGroup, taggedPicksAt } from "src/lib/builder/chosen-options";
import { OptionalClassFeature } from "src/lib/builder/optional-class-features";
import {
  getCatalogSpell,
  searchCatalogSpells,
  CatalogSpell,
} from "src/lib/spells/spell-catalog";
import {
  ChipMultiSelect,
  Field,
  SingleChoice,
  STAT_LABEL,
} from "./builder-common";
import Select from "src/components/select";

// Domain-aware pickers for the two wizards: widgets that know about spells,
// feats, languages and class option lists.

const LANGUAGE_OPTIONS = DEFAULT_LANGUAGES.flatMap((g) => g.options);
const TOOL_OPTIONS = DEFAULT_TOOLS.flatMap((g) => g.options);
const WEAPON_OPTIONS = WEAPON_PRESETS.flatMap((g) =>
  g.options.map((w) => w.name),
);

export type FeatState = FeatChoices & { featIndex?: string };

export interface FeatPickerProps {
  state: FeatState;
  patch: (partial: Partial<FeatState>) => void;
  proficientSkills: SkillName[];
  expertSkills: SkillName[];
  knownWeapons: string[];
  knownLanguages?: string[];
  // Spells already on the sheet, so a Magic Initiate can't "learn" a duplicate.
  knownSpells?: string[];
  // Feats already taken; each feat is takeable once.
  takenFeats?: string[];
}

// Suggestion dropdown that still accepts free text. Replaces a native
// `<input list>` datalist, whose Chrome popup needs a second click on an
// empty field — this shows on first focus.
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

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // No cap: the list scrolls, and a cap would hide options past it.
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
                // mousedown fires before blur, so the pick registers.
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
// ranger's favored enemy). Options already known from an earlier level are
// filtered out, and boxes lock once `count` are ticked. A group whose picks
// are *tagged* at this level (a Kensei's one melee + one ranged weapon)
// becomes one labelled single-choice per tag.
export function ChosenOptionPicker({
  group,
  count,
  classLevel,
  alreadyKnown,
  picked,
  onChange,
}: {
  group: OptionGroup;
  count: number;
  // Class level these picks are granted at; `tagged` keys off this level, not
  // the whole group.
  classLevel: number;
  alreadyKnown: string[];
  picked: string[];
  onChange: (names: string[]) => void;
}) {
  const known = new Set(alreadyKnown);
  const atLimit = picked.length >= count;
  const offered = group.options.filter((option) => !known.has(option.name));
  const tags = taggedPicksAt(group, classLevel, count);

  if (tags) {
    // One pick per tag, held in tag order.
    const tagOf = (name: string) =>
      group.options.find((o) => o.name === name)?.tag;
    const setTag = (tag: string, next?: string) =>
      onChange(
        tags
          .map(({ tag: t }) =>
            t === tag ? next : picked.find((n) => tagOf(n) === t),
          )
          .filter((n): n is string => Boolean(n)),
      );
    return (
      <Field label={group.label} hint="Choose one of each.">
        {group.summary && (
          <p className="text-muted builder-hint">{group.summary}</p>
        )}
        <div className="builder-tagged-slots">
          {tags.map(({ tag, label }) => (
            <Field key={tag} label={label}>
              <SingleChoice
                name={`${group.label} — ${label}`}
                value={picked.find((n) => tagOf(n) === tag)}
                onChange={(next) => setTag(tag, next)}
                options={offered
                  .filter((o) => o.tag === tag)
                  .map((option) => ({
                    value: option.name,
                    label: option.name,
                    summary: option.summary,
                  }))}
              />
            </Field>
          ))}
        </div>
      </Field>
    );
  }

  return (
    <Field
      label={group.label}
      hint={`Choose ${count}${alreadyKnown.length ? " more" : ""}.`}
    >
      {group.summary && (
        <p className="text-muted builder-hint">{group.summary}</p>
      )}
      {/* Single choice uses the shared radio/dropdown widget; multi-pick
          groups stay checkboxes so the cap and running count are visible. */}
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

// Each Tasha's swap is an opt-in toggle; leaving them all off is the 2014
// class. The replaced feature is named on each row.
export function OptionalFeaturePicker({
  features,
  taken,
  onChange,
}: {
  features: OptionalClassFeature[];
  taken: string[];
  onChange: (names: string[]) => void;
}) {
  if (!features.length) return <></>;
  return (
    <Field
      label="Optional class features"
      hint="Tasha's Cauldron of Everything replaces some class features with alternatives. Leave these off to play the 2014 version."
    >
      <div className="column invocation-options">
        {features.map((feature) => (
          <label key={feature.name} className="row invocation-option">
            <input
              type="checkbox"
              checked={taken.includes(feature.name)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...taken, feature.name]
                    : taken.filter((n) => n !== feature.name),
                )
              }
            />
            <span>
              <b>{feature.name}</b>
              <i className="text-muted">
                {" "}
                (replaces {feature.replaces[0]})
              </i>{" "}
              <span className="text-muted">{feature.summary}</span>
            </span>
          </label>
        ))}
      </div>
    </Field>
  );
}

// N combobox slots over a suggestion list, each still accepting free text.
// Backs both the language picker and the custom background's tools.
export function SlotPicker({
  count,
  options,
  placeholder,
  value,
  exclude = [],
  onChange,
}: {
  count: number;
  options: readonly string[];
  placeholder: string;
  value: string[];
  // Entries dropped from the *suggestions* only (free text still accepts
  // anything) — things already known, plus each slot hides the others' picks.
  exclude?: string[];
  onChange: (next: string[]) => void;
}) {
  const set = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  const taken = new Set(
    [...exclude, ...value].map((v) => v.trim().toLowerCase()),
  );
  const optionsFor = (i: number) =>
    options.filter((o) => {
      const key = o.trim().toLowerCase();
      return key === (value[i] ?? "").trim().toLowerCase() || !taken.has(key);
    });
  return (
    <div className="builder-language-picker">
      {Array.from({ length: count }).map((_, i) => (
        <Combobox
          key={i}
          value={value[i] ?? ""}
          options={optionsFor(i)}
          placeholder={placeholder}
          onChange={(v) => set(i, v)}
        />
      ))}
    </div>
  );
}

// One slot per language granted: suggests standard/exotic languages.
export function LanguagePicker(props: {
  count: number;
  value: string[];
  exclude?: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <SlotPicker
      {...props}
      options={LANGUAGE_OPTIONS}
      placeholder="Choose or type a language"
    />
  );
}

// One slot per tool proficiency granted.
export function ToolPicker(props: {
  count: number;
  value: string[];
  exclude?: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <SlotPicker
      {...props}
      options={TOOL_OPTIONS}
      placeholder="Choose or type a tool"
    />
  );
}

// Stat card shown while a checklist row is hovered/focused, fixed-positioned
// from the row's viewport rect (flips side/clamps to stay on screen).
// Portalled to <body> because a transformed ancestor (the modal's centering
// transform) would otherwise become the containing block for `fixed`.
function SpellHoverCard({
  spell,
  anchor,
}: {
  spell: CatalogSpell;
  anchor: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 10;
    let left = anchor.right + gap;
    if (left + width > window.innerWidth - gap)
      left = Math.max(gap, anchor.left - width - gap);
    const top = Math.max(
      gap,
      Math.min(anchor.top, window.innerHeight - height - gap),
    );
    setPos({ left, top });
  }, [spell, anchor]);

  const components = [
    spell.verbal && "V",
    spell.somatic && "S",
    spell.material !== undefined && `M (${spell.material})`,
  ]
    .filter(Boolean)
    .join(", ");
  const duration = spell.concentration
    ? `Concentration, ${spell.duration.charAt(0).toLowerCase()}${spell.duration.slice(1)}`
    : spell.duration;

  return createPortal(
    <div
      ref={ref}
      className="builder-spell-popover"
      role="tooltip"
      style={pos ?? { visibility: "hidden" }}
    >
      <h4>{spell.name}</h4>
      <p className="builder-spell-popover-school">
        {spell.level === 0
          ? `${spell.school} cantrip`
          : `${spellLevelLabel(spell.level)}-level ${spell.school}`}
        {spell.ritual ? " (ritual)" : ""}
      </p>
      <div className="builder-spell-popover-stats">
        <span>
          <b>Casting time</b> {spell.castingTime}
        </span>
        <span>
          <b>Range</b> {spell.range}
        </span>
        <span>
          <b>Components</b> {components || "None"}
        </span>
        <span>
          <b>Duration</b> {duration}
        </span>
        {spell.baseDamage && (
          <span>
            <b>Damage</b> {spell.baseDamage}
            {spell.damageType ? ` ${spell.damageType.toLowerCase()}` : ""}
          </span>
        )}
        {spell.save && (
          <span>
            <b>Save</b> {spell.save}
          </span>
        )}
        {spell.areaOfEffect && (
          <span>
            <b>Area</b> {spell.areaOfEffect}
          </span>
        )}
      </div>
      <p className="builder-spell-popover-desc">
        {spell.desc.replace(/\n+/g, " ")}
      </p>
      {spell.higherLevel && (
        <p className="builder-spell-popover-higher">
          <b>At higher levels.</b> {spell.higherLevel}
        </p>
      )}
    </div>,
    document.body,
  );
}

export function SpellChecklist({
  className,
  level,
  selected,
  max,
  alreadyKnown,
  onChange,
}: {
  // Undefined shows every catalog spell (classes the catalog doesn't tag, e.g.
  // Artificer); a class name filters to that class's list.
  className?: string;
  // One level, or several in one list (e.g. a bard's Magical Secrets, not
  // tied to one level). Each row names its level when the list spans more than one.
  level: number | number[];
  selected: string[];
  max: number | null;
  // Spell names to drop from the list (already known elsewhere on the
  // sheet/wizard); a currently-ticked row in this list stays visible regardless.
  alreadyKnown?: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  // Row under the mouse/focus and its viewport rect, for the hover card.
  // Cleared (not repositioned) on scroll — a stale rect, re-anchored on the
  // next mouseenter.
  const [hovered, setHovered] = useState<{
    spell: CatalogSpell;
    anchor: DOMRect;
  } | null>(null);
  const levels = Array.isArray(level) ? level : [level];
  // Keyed on contents so a fresh array literal each render doesn't re-filter.
  const levelKey = levels.join(",");
  const knownKey = (alreadyKnown ?? [])
    .map((n) => n.trim().toLowerCase())
    .join("\n");
  const spells = useMemo(() => {
    const known = new Set(knownKey ? knownKey.split("\n") : []);
    return searchCatalogSpells(query, className).filter(
      (s) =>
        levelKey.split(",").includes(String(s.level)) &&
        (selected.includes(s.index) || !known.has(s.name.toLowerCase())),
    );
  }, [query, className, levelKey, knownKey, selected.join(",")]);
  const showLevel = levels.length > 1;
  const sorted = showLevel
    ? [...spells].sort((a, b) => a.level - b.level)
    : spells;
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
      <div className="builder-spell-list" onScroll={() => setHovered(null)}>
        {spells.length === 0 ? (
          <p className="builder-spell-empty text-muted">
            {query.trim()
              ? `No spells match "${query.trim()}". Only official spells are searchable here — add homebrew manually from the sheet.`
              : "No spells at this level. Add homebrew manually from the sheet."}
          </p>
        ) : (
          sorted.map((s: CatalogSpell, i) => {
            const on = selected.includes(s.index);
            const startsLevel = showLevel && sorted[i - 1]?.level !== s.level;
            return (
              <Fragment key={s.index}>
                {startsLevel && (
                  <h4 className="builder-spell-level">
                    {s.level === 0
                      ? "Cantrips"
                      : `${spellLevelLabel(s.level)} level`}
                  </h4>
                )}
                <label
                  className={
                    on ? "builder-spell-row selected" : "builder-spell-row"
                  }
                  onMouseEnter={(e) =>
                    setHovered({
                      spell: s,
                      anchor: e.currentTarget.getBoundingClientRect(),
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                  onFocus={(e) =>
                    setHovered({
                      spell: s,
                      anchor: e.currentTarget.getBoundingClientRect(),
                    })
                  }
                  onBlur={() => setHovered(null)}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && atCap}
                    onChange={() => toggle(s.index)}
                  />
                  {s.name}
                </label>
              </Fragment>
            );
          })
        )}
      </div>
      {hovered && (
        <SpellHoverCard spell={hovered.spell} anchor={hovered.anchor} />
      )}
    </div>
  );
}

export function FeatPicker({
  state,
  patch,
  proficientSkills,
  expertSkills,
  knownWeapons,
  knownLanguages = [],
  knownSpells,
  takenFeats = [],
}: FeatPickerProps) {
  const feat = FEATS.find((f) => f.index === state.featIndex);
  // Taken feats leave the list except the currently selected one.
  const taken = new Set(takenFeats);
  const offeredFeats = FEATS.filter(
    (f) => f.index === state.featIndex || !taken.has(f.name),
  );
  const grants = feat?.grants;
  const fixedSpellNames = [
    ...(grants?.fixedCantrips ?? []),
    ...(grants?.fixedSpells ?? []),
  ]
    .map((i) => getCatalogSpell(i)?.name)
    .filter(Boolean);

  // Expertise applies only to a skill you're proficient in (existing or
  // gained from this feat) and not already expert in.
  const alreadyProficient = proficientSkills;
  const alreadyExpert = expertSkills;
  const skillOptions = REAL_SKILLS.filter(
    (s) => !alreadyProficient.includes(s),
  );
  const expertiseOptions = uniq([
    ...alreadyProficient,
    ...state.featSkillChoices,
  ]).filter((s: SkillName) => !alreadyExpert.includes(s));

  // Drop any expertise pick that's no longer valid when the skill changes.
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
        <Select
          className="builder-input"
          label="Feat"
          value={state.featIndex ?? ""}
          options={[
            { value: "", label: "Choose a feat…" },
            ...offeredFeats.map((f) => ({ value: f.index, label: f.name })),
          ]}
          onChange={(value) =>
            patch({
              featIndex: value || undefined,
              featAbilityChoice: undefined,
              ...emptyFeatChoices(),
            })
          }
        />
      </Field>
      {feat && (
        <>
          {feat.prerequisite && (
            <p className="text-muted builder-hint">
              Prerequisite: {feat.prerequisite}
            </p>
          )}
          <p className="builder-hint">{feat.effect}</p>

          {/* A single fixed stat renders as a static line; a choice of stats gets a picker. */}
          {feat.abilityIncrease &&
            (feat.abilityIncrease.from.length > 1 ? (
              <Field
                label={`Ability score increase (+${feat.abilityIncrease.by})`}
              >
                <Select
                  className="builder-input"
                  label="Which ability to raise"
                  value={
                    state.featAbilityChoice ?? feat.abilityIncrease.from[0]
                  }
                  options={feat.abilityIncrease.from.map((s) => ({
                    value: s,
                    label: STAT_LABEL[s],
                  }))}
                  onChange={(value) =>
                    patch({ featAbilityChoice: value as StatKey })
                  }
                />
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

          {grants?.chooseLanguages && (
            <Field
              label={`Languages (choose ${grants.chooseLanguages})`}
              hint="Languages you already know are hidden."
            >
              <ChipMultiSelect
                options={LANGUAGE_OPTIONS.filter(
                  (l) => !knownLanguages.includes(l),
                )}
                selected={state.featLanguageChoices}
                max={grants.chooseLanguages}
                onChange={(featLanguageChoices) =>
                  patch({ featLanguageChoices })
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
                alreadyKnown={knownSpells}
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
