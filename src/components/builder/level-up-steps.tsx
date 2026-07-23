import { Character } from "src/lib/types";
import {
  OfficialClass,
  SkillName,
  StatKey,
  spellLevelLabel,
} from "src/lib/data/data-definitions";
import { getPB, isPreparedCaster, maxSpellLevelForClass } from "src/lib/rules";
import {
  ELDRITCH_INVOCATIONS,
  expertiseDueAt,
  fightingStyleDueAt,
  getFightingStyle,
  newInvocationsAt,
} from "src/lib/builder/class-features";
import {
  LevelUpState,
  MULTICLASS_PREREQS,
  applyLevelUp,
  classHasCantrips,
  emptyFeatChoices,
  isCasterClass,
  spellListFilterFor,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { subclassesForClass } from "src/lib/builder/subclasses";
import { chosenIn, newOptionPicksAt } from "src/lib/builder/chosen-options";
import { FEATS } from "src/lib/builder/feats";
import {
  ChipMultiSelect,
  Choice,
  ChoiceGrid,
  ChosenOptionPicker,
  FeatPicker,
  Field,
  STAT_LABEL,
  SpellChecklist,
} from "./builder-common";

// Real skills (the SkillName enum also carries "Thieves Tools", a tool).
const SKILL_OPTIONS = Object.values(SkillName).filter(
  (s) => s !== SkillName["Thieves Tools"],
);

export interface LevelUpStepProps {
  character: Character;
  state: LevelUpState;
  patch: (partial: Partial<LevelUpState>) => void;
}

const classIndexOf = (className: string) => className.toLowerCase();

// ---------------------------------------------------------------- Class step
export function LevelUpClassStep({
  character,
  state,
  patch,
}: LevelUpStepProps) {
  const taken = new Set(character.class.map((c) => c.name));
  const multiclassOptions = Object.values(OfficialClass).filter(
    (c) => !taken.has(c),
  );

  const advanceChoices: Choice[] = character.class.map((c) => ({
    key: `advance-${c.name}`,
    title: c.name,
    subtitle: `Level ${c.level} → ${c.level + 1}`,
    selected: !state.isNewMulticlass && state.className === c.name,
    onClick: () =>
      patch({
        className: c.name,
        isNewMulticlass: false,
        subclass: undefined,
        advancement: "asi",
        asi: {},
        featIndex: undefined,
        ...emptyFeatChoices(),
      }),
  }));

  const multiclassChoices: Choice[] = multiclassOptions.map((c) => ({
    key: `multi-${c}`,
    title: c,
    subtitle: MULTICLASS_PREREQS[c]
      ? `Needs ${MULTICLASS_PREREQS[c]}`
      : "No prerequisite",
    selected: state.isNewMulticlass && state.className === c,
    onClick: () =>
      patch({
        className: c,
        isNewMulticlass: true,
        subclass: undefined,
        advancement: "asi",
        asi: {},
        featIndex: undefined,
        ...emptyFeatChoices(),
      }),
  }));

  return (
    <div className="builder-step">
      <Field label="Advance a class">
        <ChoiceGrid choices={advanceChoices} />
      </Field>
      {multiclassChoices.length > 0 && (
        <Field
          label="Or multiclass"
          hint="Prerequisites are advisory — the wizard won't block you."
        >
          <ChoiceGrid choices={multiclassChoices} />
        </Field>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Subclass step
export function LevelUpSubclassStep({ state, patch }: LevelUpStepProps) {
  const options = subclassesForClass(classIndexOf(state.className));
  const chosen = options.find((s) => s.name === state.subclass);
  return (
    <div className="builder-step">
      <Field label={`${state.className} subclass`}>
        <select
          className="builder-input"
          value={state.subclass ?? ""}
          onChange={(e) => patch({ subclass: e.target.value || undefined })}
        >
          <option value="">Choose…</option>
          {options.map((s) => (
            <option key={s.index} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {chosen && <p className="text-muted builder-hint">{chosen.summary}</p>}
      </Field>
    </div>
  );
}

// ------------------------------------------- Class feature choices step
// Fighting styles (fighter 1 / paladin 2 / ranger 2) and eldritch invocations
// (whenever the warlock's known count grows). Choices land as features titled
// with the bare style/invocation name, so the ones the mechanics catalog
// knows (Great Weapon Fighting) activate their riders by title.
export function LevelUpFeatureChoicesStep({
  character,
  state,
  patch,
}: LevelUpStepProps) {
  const level = targetClassLevel(character, state);
  const styleNames = fightingStyleDueAt(state.className, level);
  const newInvocations =
    state.className === OfficialClass.Warlock ? newInvocationsAt(level) : 0;
  const known = new Set(character.features.map((f) => f.title.trim()));
  // The subclass may be chosen in this same level-up (a fighter taking Battle
  // Master at 3rd gets their first maneuvers now), so prefer the pending
  // choice over what's already on the sheet.
  const subclass =
    state.subclass ??
    character.class.find((k) => k.name === state.className)?.subclass;
  const newPicks = newOptionPicksAt(state.className, level, subclass);
  // Expertise doubles an existing proficiency, so the options are the skills
  // the character already has — minus the ones already doubled.
  const newExpertise = expertiseDueAt(state.className, level);
  const expertiseOptions = (
    Object.keys(character.proficiencies.skills) as SkillName[]
  ).filter(
    (s) =>
      character.proficiencies.skills[s] &&
      !character.proficiencies.expertise[s],
  );

  return (
    <div className="builder-step">
      {styleNames && (
        <Field label="Fighting style">
          <select
            className="builder-input"
            value={state.fightingStyle ?? ""}
            onChange={(e) =>
              patch({ fightingStyle: e.target.value || undefined })
            }
          >
            <option value="">Choose…</option>
            {styleNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {state.fightingStyle && (
            <p className="text-muted builder-hint">
              {getFightingStyle(state.fightingStyle)?.summary}
            </p>
          )}
        </Field>
      )}
      {newInvocations > 0 && (
        <Field label="Eldritch invocations">
          <p className="text-muted builder-hint">
            Choose {newInvocations} new invocation
            {newInvocations > 1 ? "s" : ""}. Only SRD invocations are listed —
            add others as features from the sheet.
          </p>
          <div className="column invocation-options">
            {ELDRITCH_INVOCATIONS.filter((inv) => !known.has(inv.name)).map(
              (inv) => (
                <label key={inv.name} className="row invocation-option">
                  <input
                    type="checkbox"
                    checked={state.invocations.includes(inv.name)}
                    onChange={(e) =>
                      patch({
                        invocations: e.target.checked
                          ? [...state.invocations, inv.name]
                          : state.invocations.filter((n) => n !== inv.name),
                      })
                    }
                  />
                  <span>
                    <b>{inv.name}</b>
                    {inv.prerequisite && (
                      <i className="text-muted"> ({inv.prerequisite})</i>
                    )}{" "}
                    <span className="text-muted">{inv.summary}</span>
                  </span>
                </label>
              ),
            )}
          </div>
        </Field>
      )}
      {newExpertise > 0 && (
        <Field
          label={`Expertise (choose ${newExpertise})`}
          hint="Double your proficiency bonus for these. Only skills you're already proficient in."
        >
          <ChipMultiSelect<SkillName>
            options={expertiseOptions}
            selected={state.expertiseChoices}
            max={newExpertise}
            onChange={(expertiseChoices) => patch({ expertiseChoices })}
          />
        </Field>
      )}
      {newPicks.map(({ group, count }) => (
        <ChosenOptionPicker
          key={group.category}
          group={group}
          count={count}
          // Options already on the sheet from an earlier level aren't offered
          // again — you're picking what's *new*.
          alreadyKnown={chosenIn(character, group.category).map((o) => o.name)}
          picked={state.chosenOptions[group.category] ?? []}
          onChange={(names) =>
            patch({
              chosenOptions: {
                ...state.chosenOptions,
                [group.category]: names,
              },
            })
          }
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------ ASI / feat step
// Two independent +1 picks. Choosing the same stat in both columns spends the
// whole ASI as +2 to one score; choosing two different stats gives +1/+1.
function AsiPicker({ state, patch }: LevelUpStepProps) {
  // Reconstruct the two +1 slots from the delta record so the radios stay in
  // sync with state.
  const slots: string[] = [];
  for (const [stat, delta] of Object.entries(state.asi))
    for (let i = 0; i < (delta ?? 0); i++) slots.push(stat);
  while (slots.length < 2) slots.push("");

  const setSlot = (idx: number, value: string) => {
    const next = [...slots];
    next[idx] = value;
    const asi: Partial<Record<StatKey, number>> = {};
    for (const s of next.filter(Boolean))
      asi[s as StatKey] = (asi[s as StatKey] ?? 0) + 1;
    patch({ asi });
  };

  return (
    <div className="builder-asi-columns">
      {[0, 1].map((idx) => (
        <div key={idx} className="builder-asi-column">
          <span className="builder-field-label">
            {idx === 0 ? "First increase (+1)" : "Second increase (+1)"}
          </span>
          {Object.values(StatKey).map((s) => (
            <label key={s} className="builder-radio">
              <input
                type="radio"
                name={`asi-slot-${idx}`}
                checked={slots[idx] === s}
                onChange={() => setSlot(idx, s)}
              />
              {STAT_LABEL[s]}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LevelUpAdvancementStep(props: LevelUpStepProps) {
  const { state, patch } = props;
  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        This level grants an Ability Score Improvement. Take the +2 (or two +1s)
        or pick a feat instead.
      </p>
      <div className="row">
        {(["asi", "feat"] as const).map((mode) => (
          <label key={mode} className="builder-radio">
            <input
              type="radio"
              checked={state.advancement === mode}
              onChange={() => patch({ advancement: mode })}
            />
            {mode === "asi" ? "Ability scores" : "Feat"}
          </label>
        ))}
      </div>
      {state.advancement === "asi" ? (
        <>
          <p className="builder-field-label">
            Choose which two stats to increase
          </p>
          <p className="text-muted builder-hint">
            Pick the same stat in both columns to raise it by +2.
          </p>
          <AsiPicker {...props} />
        </>
      ) : (
        <FeatPicker
          state={props.state}
          patch={props.patch}
          proficientSkills={SKILL_OPTIONS.filter(
            (s) => props.character.proficiencies.skills[s],
          )}
          expertSkills={SKILL_OPTIONS.filter(
            (s) => props.character.proficiencies.expertise[s],
          )}
          knownWeapons={props.character.otherProficiencies.weapons}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------- Spells step
export function LevelUpSpellsStep({
  character,
  state,
  patch,
}: LevelUpStepProps) {
  const preview = applyLevelUp(character, state);
  // The highest spell level offered is the *leveled class's own* limit at its
  // new level, as if single-classed — the RAW gate for spells known/prepared.
  // (Multiclass slot pooling affects casting, not learning: a Paladin 9 /
  // Warlock 1 picks warlock spells as a warlock 1, despite 3rd-level slots.)
  const targetKlass = preview.class.find((c) => c.name === state.className);
  const maxSpellLevel = targetKlass ? maxSpellLevelForClass(targetKlass) : 0;
  const leveledSpellLevels = Array.from(
    { length: maxSpellLevel },
    (_, i) => i + 1,
  );
  // Artificer / homebrew aren't tagged in the SRD spell catalog, so show every
  // spell rather than an empty class-filtered list.
  const filterClass = spellListFilterFor(state.className);
  const setLevel = (numeric: number, indices: string[]) =>
    patch({ newSpells: { ...state.newSpells, [numeric]: indices } });

  // Known casters may replace one spell they know each level; prepared casters
  // (cleric, druid, wizard, paladin, artificer) re-prepare daily instead, so
  // there's nothing to swap.
  const canSwap = !isPreparedCaster(state.className);
  const knownSpells = canSwap
    ? Object.entries(character.spells).flatMap(([bucket, list]) =>
        (list ?? [])
          .map((spell, i) => ({
            key: `${bucket}.${i}`,
            label: `${spell.info.title} (${spellLevelLabel(Number(bucket))})`,
            classId: spell.spellcastingClass,
          }))
          // Only this class's spells — you can't trade a wizard spell away on a
          // bard level-up.
          .filter((e) => e.classId === targetKlass?.id),
      )
    : [];

  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Add any new spells you learn this level. Known-spell counts aren&apos;t
        enforced — pick what fits, and you can always adjust on the sheet. Only
        SRD spells are searchable here; add spells from other books or homebrew
        manually from the sheet afterward.
      </p>
      {knownSpells.length > 0 && (
        <Field
          label="Swap a known spell (optional)"
          hint="Known casters may replace one spell they know each level."
        >
          <select
            className="builder-input"
            value={state.swapSpell ?? ""}
            onChange={(e) => patch({ swapSpell: e.target.value || undefined })}
          >
            <option value="">Keep everything</option>
            {knownSpells.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {classHasCantrips(state.className) && (
        <Field label="Cantrips">
          <SpellChecklist
            className={filterClass}
            level={0}
            selected={state.newSpells[0] ?? []}
            max={null}
            onChange={(indices) => setLevel(0, indices)}
          />
        </Field>
      )}
      {leveledSpellLevels.map((numeric) => (
        <Field key={numeric} label={`Level ${numeric} spells`}>
          <SpellChecklist
            className={filterClass}
            level={numeric}
            selected={state.newSpells[numeric] ?? []}
            max={null}
            onChange={(indices) => setLevel(numeric, indices)}
          />
        </Field>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- Review step
export function LevelUpReviewStep({ character, state }: LevelUpStepProps) {
  const preview = applyLevelUp(character, state);
  const newLevel = targetClassLevel(character, state);
  const totalLevel = preview.class.reduce((sum, c) => sum + c.level, 0);
  const newSpellCount = Object.values(state.newSpells).reduce(
    (n, arr) => n + arr.length,
    0,
  );

  const rows: [string, string][] = [
    [
      "Class",
      state.isNewMulticlass
        ? `${state.className} 1 (new multiclass)`
        : `${state.className} ${newLevel}`,
    ],
    ["Total level", String(totalLevel)],
    ["Proficiency bonus", `+${getPB(preview)}`],
  ];
  if (state.subclass) rows.push(["Subclass", state.subclass]);
  if (state.advancement === "asi") {
    const asi = Object.entries(state.asi)
      .map(([s, d]) => `+${d} ${STAT_LABEL[s as StatKey]}`)
      .join(", ");
    if (asi) rows.push(["Ability scores", asi]);
  } else if (state.featIndex) {
    const feat = FEATS.find((f) => f.index === state.featIndex);
    if (feat) {
      rows.push(["Feat", feat.name]);
      // Half-feat ability increase (the chosen stat, or the sole option).
      if (feat.abilityIncrease) {
        const stat = state.featAbilityChoice ?? feat.abilityIncrease.from[0];
        rows.push([
          "Ability score",
          `+${feat.abilityIncrease.by} ${STAT_LABEL[stat]}`,
        ]);
      }
      // Player choices the feat's grants required.
      if (state.featSkillChoices.length)
        rows.push(["Skill proficiency", state.featSkillChoices.join(", ")]);
      if (state.featExpertiseChoices.length)
        rows.push(["Expertise", state.featExpertiseChoices.join(", ")]);
      if (state.featWeaponChoices.length)
        rows.push(["Weapon proficiency", state.featWeaponChoices.join(", ")]);
      const featSpellCount = Object.values(state.featSpellChoices).reduce(
        (n, arr) => n + arr.length,
        0,
      );
      if (featSpellCount > 0)
        rows.push(["Feat spells", String(featSpellCount)]);
    }
  }
  if (isCasterClass(state.className) && newSpellCount > 0)
    rows.push(["New spells", String(newSpellCount)]);

  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Hit points, hit dice, and spell slots update automatically from your new
        level.
      </p>
      <table className="builder-review-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
