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
  applyLevelUp,
  classHasCantrips,
  emptyFeatChoices,
  isCasterClass,
  spellListFilterFor,
  summarizeLevelUp,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { subclassesForClass } from "src/lib/builder/subclasses";
import { chosenIn } from "src/lib/builder/chosen-options";
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
  SpellChecklist,
} from "./builder-pickers";

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

// Average vs. rolled hit points. Average is the default because it's what most
// tables use, and a rolled result is entered rather than rolled for you: the
// roll belongs to the player (and often has the DM watching), so the wizard
// records it instead of quietly generating one.
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
  // One description of what this level offers, shared with the wizard's
  // step-visibility predicate — so a new kind of choice can't appear in one
  // place and not the other.
  const grants = grantsForLevelUp(character, state);
  const styleNames = grants.fightingStyles;
  const newInvocations = grants.invocations;
  const newPicks = grants.optionPicks;
  const newExpertise = grants.expertise;
  const mcSkills = grants.multiclassSkills;
  const toolChoices = grants.toolChoices;
  const known = new Set(character.features.map((f) => f.title.trim()));
  // Expertise doubles an existing proficiency, so the options are the skills
  // the character already has — minus the ones already doubled.
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
      {mcSkills && (
        <Field
          label={`Skill proficiency (choose ${mcSkills.choose})`}
          hint="Multiclassing grants a limited set of proficiencies — the armor, weapons and tools are applied for you; this is the part you choose."
        >
          <ChipMultiSelect<SkillName>
            // Skills already on the sheet are dropped rather than shown and
            // ignored: picking one would silently waste the grant.
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
            options={toolChoices.from}
            selected={state.toolChoices}
            max={toolChoices.choose}
            onChange={(toolChoices) => patch({ toolChoices })}
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
function AsiPicker({ character, state, patch }: LevelUpStepProps) {
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

  // A stat already at its ceiling isn't offered. The ceiling is per-stat
  // because a feature can raise it (a barbarian 20's STR and CON go to 24), and
  // it counts the increase spent in the *other* column — otherwise two +1s
  // could walk a 19 up to 21 one column at a time.
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
          {/* Six abilities is past the point where a radio column reads at a
              glance, so this lands on the dropdown side of `SingleChoice`. */}
          <SingleChoice
            name={`asi-slot-${idx}`}
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
          proficientSkills={REAL_SKILLS.filter(
            (s) => props.character.proficiencies.skills[s],
          )}
          expertSkills={REAL_SKILLS.filter(
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
  // How many new cantrips / spells this level actually grants. Creation has
  // always enforced its level-1 counts; these are the same limits at level N,
  // so the two halves of the wizard finally agree. `null` means the class
  // prepares from its whole list — there's no repertoire to cap.
  const newLevel = targetClassLevel(character, state);
  const cantripAllowance = newCantripsAt(state.className, newLevel);
  const spellAllowance = newSpellsAt(state.className, newLevel);
  // The allowance is per level, but the picker is split into one list per spell
  // level, so it's spent across them: three 1st-level picks use up a three-spell
  // allowance. Each list caps at what's left plus what it already holds.
  const spentOnLeveled = Object.entries(state.newSpells)
    .filter(([bucket]) => Number(bucket) > 0)
    .reduce((n, [, arr]) => n + arr.length, 0);
  const remainingFor = (numeric: number) =>
    spellAllowance === null
      ? null
      : spellAllowance -
        spentOnLeveled +
        (state.newSpells[numeric]?.length ?? 0);

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
        {spellAllowance === null
          ? "This class prepares spells from its whole list, so there's no count to enforce — add anything you want on the sheet."
          : `This level grants ${spellAllowance} new spell${spellAllowance === 1 ? "" : "s"}${
              cantripAllowance
                ? ` and ${cantripAllowance} cantrip${cantripAllowance === 1 ? "" : "s"}`
                : ""
            }.`}{" "}
        Only SRD spells are searchable here; add spells from other books or
        homebrew manually from the sheet afterward.
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
            max={cantripAllowance}
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

  // What the level *gives* you, as opposed to what you chose above. Diffed off
  // the same preview the wizard is about to commit, so it can't promise
  // anything the confirm won't actually do.
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
