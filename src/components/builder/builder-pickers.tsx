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

// Domain-aware pickers for the two wizards — the widgets that know about
// spells, feats, languages and class option lists. Split from
// `builder-common.tsx`, which is now just layout primitives (Field, ChoiceGrid,
// ChipMultiSelect); mixing the two had turned that file into a grab-bag.

const LANGUAGE_OPTIONS = DEFAULT_LANGUAGES.flatMap((g) => g.options);
const TOOL_OPTIONS = DEFAULT_TOOLS.flatMap((g) => g.options);
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
  // Spell names already on the sheet (or picked elsewhere in the wizard), so a
  // Magic Initiate can't "learn" a cantrip the character already has.
  knownSpells?: string[];
  // Names of feats already taken. 5e allows each feat once (no repeatable feat
  // is in the catalog), so these leave the dropdown entirely.
  takenFeats?: string[];
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
//
// A group whose picks at this level are *tagged* (a Kensei's one melee and one
// ranged weapon) becomes one labelled single-choice per tag, so the split can't
// be got wrong rather than being flagged after the fact.
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
  // The class level these picks are granted at — the only thing `tagged` keys
  // off, since the constraint belongs to a level and not to the whole group.
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
    // One pick per tag, held in tag order so the stored list reads
    // melee-then-ranged however the player filled the fields in.
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

// The Tasha's swaps a level offers — each an opt-in toggle rather than a pick
// from a list, because leaving them all off *is* the 2014 class and that has to
// be the thing you get by not answering. The replaced feature is named on each
// row, since the choice is only legible as a trade.
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

// N combobox slots over a suggestion list, each still accepting custom entries
// (the "default or custom" feel the rest of the wizard has). The shape behind
// both the language picker and the custom background's tools.
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
  // Entries dropped from the *suggestions* — things the character already has
  // (an Elf's Elvish shouldn't be suggested as the background's extra
  // language). Free text still accepts anything; this only stops the dropdown
  // offering a pick that would silently be a duplicate. Each slot also hides
  // the other slots' current picks, so "choose two" can't suggest the same
  // thing twice.
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

// One slot per tool proficiency granted, suggesting the standard kits, sets and
// instruments. The list is flat here — the groups exist to keep the data
// readable, not because the combobox filters by them.
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

// The stat block shown while a checklist row is hovered or focused. The list
// scrolls (`.builder-spell-list` clips overflow), so the card is fixed-position
// and placed from the row's viewport rect: beside the list where there's room,
// flipped to the other side where there isn't, clamped vertically either way.
// Portalled to <body> because the wizard modal's centering transform would
// otherwise both re-root the fixed coordinates and clip the card at the modal
// edge (a transformed ancestor is a containing block even for `fixed`).
// Mouse-transparent so it never steals the hover that opened it.
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
  // The PHB prints these as one phrase: "Concentration, up to 1 minute".
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
      {/* Paragraph breaks collapse to a sentence gap: the card is a clamped
          preview, and `pre-line` breaks the clamp's ellipsis mid-word. */}
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
  // Undefined shows every catalog spell (used for classes the catalog doesn't tag,
  // e.g. Artificer); a class name filters to that class's spell list.
  className?: string;
  // One spell level, or several in one list — the latter for an allowance that
  // isn't tied to a level (a bard's Magical Secrets), where splitting it into a
  // box per level would spread one two-spell choice over five widgets. Each row
  // names its own level when the list spans more than one.
  level: number | number[];
  selected: string[];
  max: number | null;
  // Spell *names* to drop from the list — the ones the character already has
  // (the sheet stores titles, not catalog indices, so names are the join key).
  // Offering a known spell again would let a pick silently waste itself, the
  // same reasoning as ChosenOptionPicker's `alreadyKnown`. A row that's
  // currently ticked in *this* list always stays visible, so a pick can't
  // become un-untickable when a cross-listed choice lands elsewhere.
  alreadyKnown?: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  // The row under the mouse (or holding focus) and its viewport rect, for the
  // hover card. Cleared on scroll rather than repositioned — the rect is stale
  // the moment the list moves, and the next mouseenter re-anchors it anyway.
  const [hovered, setHovered] = useState<{
    spell: CatalogSpell;
    anchor: DOMRect;
  } | null>(null);
  const levels = Array.isArray(level) ? level : [level];
  // Keyed on the levels' *contents*: a caller passing a fresh array literal
  // every render would otherwise re-filter the whole catalog on each one.
  const levelKey = levels.join(",");
  // Same contents-keying as the levels, for callers building the list inline.
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
    // `selected` is deliberately keyed by contents too — a re-created array of
    // the same picks shouldn't re-filter the catalog.
  }, [query, className, levelKey, knownKey, selected.join(",")]);
  // A list spanning several levels is grouped under level headings rather than
  // tagging each of ~300 rows: the level is the one axis a player scans by, and
  // repeating "Cantrip" forty times says it worst.
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
  knownSpells,
  takenFeats = [],
}: FeatPickerProps) {
  const feat = FEATS.find((f) => f.index === state.featIndex);
  // Taken feats leave the list — except the current pick, which must stay
  // renderable while it's the selection.
  const taken = new Set(takenFeats);
  const offeredFeats = FEATS.filter(
    (f) => f.index === state.featIndex || !taken.has(f.name),
  );
  const grants = feat?.grants;
  // The names of any always-granted spells, for an informational line.
  const fixedSpellNames = [
    ...(grants?.fixedCantrips ?? []),
    ...(grants?.fixedSpells ?? []),
  ]
    .map((i) => getCatalogSpell(i)?.name)
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
          {offeredFeats.map((f) => (
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
