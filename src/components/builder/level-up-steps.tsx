import classNames from "classnames";
import { FaArrowRightLong } from "react-icons/fa6";
import { Character } from "src/lib/types";
import {
  HIT_DICE,
  REAL_SKILLS,
  OfficialClass,
  SkillName,
  StatKey,
  spellLevelLabel,
} from "src/lib/data/data-definitions";
import {
  averageDie,
  dieFaces,
  getPB,
  isPreparedCaster,
  maxSpellLevelForClass,
  modifier,
  preparedSpellCount,
  statCapFor,
} from "src/lib/rules";
import {
  ELDRITCH_INVOCATIONS,
  getFightingStyle,
  newCantripsAt,
  newSpellsAt,
} from "src/lib/builder/class-features";
import {
  LevelUpState,
  MULTICLASS_PREREQS,
  additionalMagicalSecretsAt,
  applyLevelUp,
  classHasCantrips,
  emptyFeatChoices,
  isCasterClass,
  mysticArcanumLevelAt,
  spellListFilterFor,
  summarizeLevelUp,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { subclassesForClass } from "src/lib/builder/subclasses";
import { chosenIn } from "src/lib/builder/chosen-options";
import { ALL_SPELLS, getCatalogSpell } from "src/lib/spells/spell-catalog";
import { grantsForLevelUp } from "./level-up-wizard";
import { FEATS } from "src/lib/builder/feats";
import {
  ChipMultiSelect,
  Choice,
  ChoiceGrid,
  Field,
  SingleChoice,
  STAT_LABEL,
} from "./builder-common";
import {
  ChosenOptionPicker,
  FeatPicker,
  OptionalFeaturePicker,
  SpellChecklist,
} from "./builder-pickers";
import Select from "src/components/select";

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
      <HitPointChoice character={character} state={state} patch={patch} />
    </div>
  );
}

// Average vs. rolled hit points. A rolled result is entered, not generated,
// since the roll belongs to the player.
function HitPointChoice({ character, state, patch }: LevelUpStepProps) {
  const die =
    HIT_DICE[
      (Object.values(OfficialClass).find((c) => c === state.className) ??
        OfficialClass.Fighter) as OfficialClass
    ];
  const average = averageDie(die, Math.ceil);
  const conMod = modifier(character.stats.con);
  const faces = dieFaces(die);
  const gained = Math.max(
    1,
    (state.hpMethod === "roll" ? (state.hpRoll ?? average) : average) + conMod,
  );

  return (
    <Field
      label="Hit points"
      hint={`Hit die ${die}, CON ${conMod >= 0 ? "+" : ""}${conMod}. This level adds ${gained} HP.`}
    >
      <div className="row">
        {(["average", "roll"] as const).map((mode) => (
          <label key={mode} className="builder-radio">
            <input
              type="radio"
              checked={state.hpMethod === mode}
              onChange={() => patch({ hpMethod: mode })}
            />
            {mode === "average" ? `Average (${average})` : "Roll it"}
          </label>
        ))}
      </div>
      {state.hpMethod === "roll" && (
        <input
          className="builder-input"
          type="number"
          min={1}
          max={faces}
          value={state.hpRoll ?? ""}
          placeholder={`Your ${die} result`}
          onChange={(e) =>
            patch({
              hpRoll: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      )}
    </Field>
  );
}

// ------------------------------------------------------------- Subclass step
export function LevelUpSubclassStep({ state, patch }: LevelUpStepProps) {
  const options = subclassesForClass(classIndexOf(state.className));
  const chosen = options.find((s) => s.name === state.subclass);
  return (
    <div className="builder-step">
      <Field label={`${state.className} subclass`}>
        <Select
          className="builder-input"
          label={`${state.className} subclass`}
          value={state.subclass ?? ""}
          options={[
            { value: "", label: "Choose…" },
            ...options.map((s) => ({ value: s.name, label: s.name })),
          ]}
          onChange={(value) => patch({ subclass: value || undefined })}
        />
        {chosen && <p className="text-muted builder-hint">{chosen.summary}</p>}
      </Field>
    </div>
  );
}

// ------------------------------------------- Class feature choices step
// Fighting styles and eldritch invocations. Choices land as features titled
// with the bare style/invocation name, so mechanics the catalog knows
// (Great Weapon Fighting) activate their riders by title.
export function LevelUpFeatureChoicesStep({
  character,
  state,
  patch,
}: LevelUpStepProps) {
  // Shared with the wizard's step-visibility predicate.
  const grants = grantsForLevelUp(character, state);
  const styleNames = grants.fightingStyles;
  const newInvocations = grants.invocations;
  const newPicks = grants.optionPicks;
  const newExpertise = grants.expertise;
  const mcSkills = grants.multiclassSkills;
  const toolChoices = grants.toolChoices;
  const known = new Set(character.features.map((f) => f.title.trim()));
  // Skills already proficient in, minus ones already doubled.
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
          <Select
            className="builder-input"
            label="Fighting style"
            value={state.fightingStyle ?? ""}
            options={[
              { value: "", label: "Choose…" },
              // A style already on the sheet isn't offered again.
              ...styleNames
                .filter((name) => !known.has(name))
                .map((name) => ({ value: name, label: name })),
            ]}
            onChange={(value) => patch({ fightingStyle: value || undefined })}
          />
          {state.fightingStyle && (
            <p className="text-muted builder-hint">
              {getFightingStyle(state.fightingStyle)?.summary}
            </p>
          )}
        </Field>
      )}
      {grants.optionalFeatures && (
        <OptionalFeaturePicker
          features={grants.optionalFeatures}
          taken={state.optionalFeatures ?? []}
          onChange={(optionalFeatures) => patch({ optionalFeatures })}
        />
      )}
      {newInvocations > 0 && (
        <Field label="Eldritch invocations">
          <p className="text-muted builder-hint">
            Choose {newInvocations} new invocation
            {newInvocations > 1 ? "s" : ""}. Prerequisites are shown but not
            enforced, as with feats.
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
      {mcSkills && (
        <Field
          label={`Skill proficiency (choose ${mcSkills.choose})`}
          hint="Multiclassing grants a limited set of proficiencies — the armor, weapons and tools are applied for you; this is the part you choose."
        >
          <ChipMultiSelect<SkillName>
            options={mcSkills.from.filter(
              (s) => !character.proficiencies.skills[s],
            )}
            selected={state.multiclassSkills}
            max={mcSkills.choose}
            onChange={(multiclassSkills) => patch({ multiclassSkills })}
          />
        </Field>
      )}
      {toolChoices && (
        <Field label={`Tool proficiency (choose ${toolChoices.choose})`}>
          <ChipMultiSelect<string>
            options={toolChoices.from.filter(
              (t) =>
                !character.otherProficiencies.toolsAndOther.some(
                  (row) =>
                    row.title.trim().toLowerCase() === t.trim().toLowerCase(),
                ),
            )}
            selected={state.toolChoices}
            max={toolChoices.choose}
            onChange={(toolChoices) => patch({ toolChoices })}
          />
        </Field>
      )}
      {grants.subclassSkillChoices && (
        <Field
          label={`Subclass skills (choose ${grants.subclassSkillChoices.choose})`}
          hint={
            grants.subclassSkillChoices.expertise
              ? "Your subclass grants these with expertise (double proficiency bonus)."
              : "Skill proficiencies granted by your subclass."
          }
        >
          <ChipMultiSelect<SkillName>
            // A plain grant hides already-proficient skills; an
            // expertise-flavored grant (Scout's Survivalist) only hides
            // already-doubled ones.
            options={grants.subclassSkillChoices.from.filter((s) =>
              grants.subclassSkillChoices!.expertise
                ? !character.proficiencies.expertise[s]
                : !character.proficiencies.skills[s],
            )}
            selected={state.subclassSkillChoices}
            max={grants.subclassSkillChoices.choose}
            onChange={(subclassSkillChoices) => patch({ subclassSkillChoices })}
          />
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
      {/* Class lists plus anything the character's race owes at this total
          level (e.g. Simic Hybrid's 5th-level Animal Enhancement). */}
      {[...newPicks, ...(grants.raceOptionPicks ?? [])].map(
        ({ group, count }) => (
          <ChosenOptionPicker
            key={group.category}
            group={group}
            count={count}
            classLevel={targetClassLevel(character, state)}
            alreadyKnown={chosenIn(character, group.category).map(
              (o) => o.name,
            )}
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
        ),
      )}
    </div>
  );
}

// ------------------------------------------------------ ASI / feat step
// Two independent +1 picks; same stat in both columns spends the ASI as +2.
function AsiPicker({ character, state, patch }: LevelUpStepProps) {
  // Reconstruct the two +1 slots from the delta record.
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

  // A stat at its ceiling isn't offered; the ceiling counts the increase
  // spent in the other column too, so two +1s can't walk past it.
  const optionsFor = (idx: number) =>
    Object.values(StatKey)
      .filter((s) => {
        if (slots[idx] === s) return true; // never hide the current pick
        const spentElsewhere = slots.filter(
          (v, i) => i !== idx && v === s,
        ).length;
        return character.stats[s] + spentElsewhere < statCapFor(character, s);
      })
      .map((s) => ({ value: s, label: STAT_LABEL[s] }));

  return (
    <div className="builder-asi-columns">
      {[0, 1].map((idx) => (
        <div key={idx} className="builder-asi-column">
          <span className="builder-field-label">
            {idx === 0 ? "First increase (+1)" : "Second increase (+1)"}
          </span>
          <SingleChoice
            name={`asi-slot-${idx}`}
            label={idx === 0 ? "First increase" : "Second increase"}
            value={slots[idx] || undefined}
            onChange={(next) => setSlot(idx, next ?? "")}
            options={optionsFor(idx)}
            placeholder="No increase"
          />
        </div>
      ))}
    </div>
  );
}

const signedMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// All six abilities with current and (where changed) resulting score/mod.
// Used on both the ASI picker step and the review step.
function AsiStatChanges({
  character,
  deltas,
}: {
  character: Character;
  deltas: Partial<Record<StatKey, number>>;
}) {
  return (
    <div className="builder-asi-preview">
      {Object.values(StatKey).map((s) => {
        const current = character.stats[s];
        const resulting = Math.min(
          current + (deltas[s] ?? 0),
          statCapFor(character, s),
        );
        const changed = resulting !== current;
        return (
          <div
            key={s}
            className={classNames("builder-asi-preview-stat", { changed })}
          >
            <span className="builder-asi-preview-name">{STAT_LABEL[s]}</span>
            <span className="builder-asi-preview-values">
              <span className="builder-asi-preview-score">
                {current}{" "}
                <span className="builder-asi-preview-mod">
                  ({signedMod(modifier(current))})
                </span>
              </span>
              {changed && (
                <>
                  <FaArrowRightLong className="builder-asi-preview-arrow" />
                  <span className="builder-asi-preview-score resulting">
                    {resulting}{" "}
                    <span className="builder-asi-preview-mod">
                      ({signedMod(modifier(resulting))})
                    </span>
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })}
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
          <AsiStatChanges
            character={props.character}
            deltas={props.state.asi}
          />
        </>
      ) : (
        <FeatPicker
          state={props.state}
          patch={props.patch}
          proficientSkills={REAL_SKILLS.filter(
            (s) => props.character.proficiencies.skills[s],
          )}
          expertSkills={REAL_SKILLS.filter(
            (s) => props.character.proficiencies.expertise[s],
          )}
          knownWeapons={props.character.otherProficiencies.weapons}
          knownLanguages={props.character.otherProficiencies.languages}
          // Any class's spells count — a feat's grant is character-wide.
          knownSpells={Object.values(props.character.spells).flatMap((list) =>
            (list ?? []).map((sp) => sp.info.title),
          )}
          // A taken feat is its feature row (`applyFeat` pushes one titled with
          // the feat's name), which is also how creation-taken feats surface.
          takenFeats={props.character.features.map((f) => f.title)}
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
  // Highest spell level offered is the leveled class's own limit at its new
  // level, as if single-classed (multiclass slot pooling affects casting,
  // not learning).
  const targetKlass = preview.class.find((c) => c.name === state.className);
  const maxSpellLevel = targetKlass ? maxSpellLevelForClass(targetKlass) : 0;
  const leveledSpellLevels = Array.from(
    { length: maxSpellLevel },
    (_, i) => i + 1,
  );
  // Artificer / homebrew aren't tagged in the catalog, so show every spell.
  const filterClass = spellListFilterFor(
    state.className,
    targetClassLevel(character, state),
  );
  const setLevel = (numeric: number, indices: string[]) =>
    patch({ newSpells: { ...state.newSpells, [numeric]: indices } });

  // Prepared casters re-prepare daily rather than swapping. `null` allowance
  // means the class prepares from its whole list.
  const newLevel = targetClassLevel(character, state);
  const cantripAllowance = newCantripsAt(state.className, newLevel);
  const spellAllowance = newSpellsAt(state.className, newLevel);
  // The allowance is per level but spent across the per-spell-level pickers;
  // each list caps at what's left plus what it already holds.
  const spentOnLeveled = Object.entries(state.newSpells)
    .filter(([bucket]) => Number(bucket) > 0)
    .reduce((n, [, arr]) => n + arr.length, 0);
  const remainingFor = (numeric: number) =>
    spellAllowance === null
      ? null
      : spellAllowance -
        spentOnLeveled +
        (state.newSpells[numeric]?.length ?? 0);

  // For a prepared caster, "spells preparable" at the new level.
  const preparedAllowance = targetKlass
    ? preparedSpellCount(preview, targetKlass)
    : null;

  // A pending subclass pick in this same run wins over what's on the sheet.
  const secretsCount = additionalMagicalSecretsAt(
    state.className,
    newLevel,
    state.subclass ?? targetKlass?.subclass,
  );

  // Spells already known for the leveled class, by name (the sheet stores
  // titles) — the checklists drop them so a pick can't waste itself.
  const knownNames = Object.values(character.spells).flatMap((list) =>
    (list ?? [])
      .filter((sp) => sp.spellcastingClass === targetKlass?.id)
      .map((sp) => sp.info.title),
  );
  // Cross-exclude pending picks (class list vs Magical Secrets).
  const pendingNames = (indices: string[]) =>
    indices
      .map((i) => getCatalogSpell(i)?.name)
      .filter((n): n is string => Boolean(n));
  const secretNames = pendingNames(state.secretSpells);
  const newSpellNames = pendingNames(Object.values(state.newSpells).flat());

  const canSwap = !isPreparedCaster(state.className);
  const knownSpells = canSwap
    ? Object.entries(character.spells).flatMap(([bucket, list]) =>
        (list ?? [])
          .map((spell, i) => ({
            key: `${bucket}.${i}`,
            label: `${spell.info.title} (${spellLevelLabel(Number(bucket))})`,
            classId: spell.spellcastingClass,
          }))
          .filter((e) => e.classId === targetKlass?.id),
      )
    : [];

  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        {spellAllowance === null
          ? `This class prepares spells from its whole list rather than learning a fixed set${
              preparedAllowance === null
                ? ""
                : `, and can have ${preparedAllowance} prepared at this level`
            } — add anything you want on the sheet.${
              cantripAllowance
                ? ` This level also grants ${cantripAllowance} new cantrip${cantripAllowance === 1 ? "" : "s"}.`
                : ""
            }`
          : `This level grants ${spellAllowance} new spell${spellAllowance === 1 ? "" : "s"}${
              cantripAllowance
                ? ` and ${cantripAllowance} cantrip${cantripAllowance === 1 ? "" : "s"}`
                : ""
            }.`}{" "}
        Only official spells are searchable here; add homebrew manually from the
        sheet afterward.
      </p>
      {(() => {
        const arcanumLevel = mysticArcanumLevelAt(state.className, newLevel);
        if (!arcanumLevel) return null;
        const options = ALL_SPELLS.filter(
          (s) => s.level === arcanumLevel && s.classes.includes("Warlock"),
        );
        return (
          <Field
            label={`Mystic Arcanum (${arcanumLevel}th-level spell)`}
            hint="Choose one warlock spell of this level; you can cast it once per long rest without a slot."
          >
            <Select
              className="builder-input"
              label="Mystic Arcanum spell"
              value={state.mysticArcanum ?? ""}
              options={[
                { value: "", label: "Choose a spell…" },
                ...options.map((s) => ({ value: s.index, label: s.name })),
              ]}
              onChange={(value) => patch({ mysticArcanum: value || undefined })}
            />
          </Field>
        );
      })()}
      {secretsCount > 0 && (
        <Field
          label={`Additional Magical Secrets (choose ${secretsCount})`}
          hint="Any class's spell list, of a level you can cast. These count as bard spells for you."
        >
          <SpellChecklist
            level={[0, ...leveledSpellLevels]}
            selected={state.secretSpells}
            max={secretsCount}
            alreadyKnown={[...knownNames, ...newSpellNames]}
            onChange={(secretSpells) => patch({ secretSpells })}
          />
        </Field>
      )}
      {knownSpells.length > 0 && (
        <Field
          label="Swap a known spell (optional)"
          hint="Known casters may replace one spell they know each level."
        >
          <Select
            className="builder-input"
            label="Swap a known spell"
            value={state.swapSpell ?? ""}
            options={[
              { value: "", label: "Keep everything" },
              ...knownSpells.map((e) => ({ value: e.key, label: e.label })),
            ]}
            onChange={(value) => patch({ swapSpell: value || undefined })}
          />
        </Field>
      )}
      {/* Allowance 0 = no cantrips this level, so the picker is skipped;
          null (homebrew caster) still shows it, uncapped. */}
      {classHasCantrips(state.className) && cantripAllowance !== 0 && (
        <Field
          label={
            cantripAllowance
              ? `Cantrips (choose ${cantripAllowance})`
              : "Cantrips"
          }
        >
          <SpellChecklist
            className={filterClass}
            level={0}
            selected={state.newSpells[0] ?? []}
            max={cantripAllowance}
            alreadyKnown={[...knownNames, ...secretNames]}
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
            max={remainingFor(numeric)}
            alreadyKnown={[...knownNames, ...secretNames]}
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
      if (feat.abilityIncrease) {
        const stat = state.featAbilityChoice ?? feat.abilityIncrease.from[0];
        rows.push([
          "Ability score",
          `+${feat.abilityIncrease.by} ${STAT_LABEL[stat]}`,
        ]);
      }
      if (state.featSkillChoices.length)
        rows.push(["Skill proficiency", state.featSkillChoices.join(", ")]);
      if (state.featLanguageChoices.length)
        rows.push(["Languages", state.featLanguageChoices.join(", ")]);
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
  if (state.secretSpells.length > 0)
    rows.push([
      "Additional Magical Secrets",
      state.secretSpells.map((i) => getCatalogSpell(i)?.name ?? i).join(", "),
    ]);

  // Diffed off the preview the wizard is about to commit.
  const summary = summarizeLevelUp(character, preview);
  const gains: [string, string[]][] = [
    ["Features", summary.features],
    ["New abilities", summary.abilities],
    ["Improved", summary.changedAbilities],
    ["Attacks", summary.attacks],
    ["Proficiencies", summary.proficiencies],
    ["Spells learned", summary.spells],
  ];
  const shownGains = gains.filter(([, items]) => items.length > 0);

  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Hit dice and spell slots update automatically from your new level.
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
      {state.advancement === "asi" && Object.keys(state.asi).length > 0 && (
        <Field label="Ability scores">
          <AsiStatChanges character={character} deltas={state.asi} />
        </Field>
      )}
      <Field label="You gain">
        <ul className="builder-gain-list">
          {summary.hp > 0 && (
            <li>
              <b>+{summary.hp} hit points</b>
            </li>
          )}
          {shownGains.map(([label, items]) => (
            <li key={label}>
              <b>{label}:</b> {items.join(", ")}
            </li>
          ))}
        </ul>
        {shownGains.length === 0 && summary.hp <= 0 && (
          <p className="text-muted builder-hint">
            Nothing beyond the numbers above at this level.
          </p>
        )}
      </Field>
    </div>
  );
}
