import { uniq } from "lodash";
import { Character } from "src/lib/types";
import {
  OfficialClass,
  SkillName,
  SpellLevel,
  StatKey,
} from "src/lib/data/data-definitions";
import {
  getDefaultSpellSlots,
  getNumericSpellSlotLevel,
  getPactSlotInfo,
  getPB,
} from "src/lib/rules";
import { WEAPON_PRESETS } from "src/lib/data/weapon-presets";
import { getSrdSpell } from "src/lib/spells/srd-spells";
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
import { FEATS } from "src/lib/builder/feats";
import {
  ChipMultiSelect,
  Choice,
  ChoiceGrid,
  Field,
  STAT_LABEL,
} from "./builder-common";
import { SpellChecklist } from "./builder-steps";

// Real skills (the SkillName enum also carries "Thieves Tools", a tool).
const SKILL_OPTIONS = Object.values(SkillName).filter(
  (s) => s !== SkillName["Thieves Tools"],
);
const WEAPON_OPTIONS = WEAPON_PRESETS.flatMap((g) =>
  g.options.map((w) => w.name),
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

// Skills the character is already proficient in / already has expertise in.
const proficientSkillsOf = (character: Character): SkillName[] =>
  SKILL_OPTIONS.filter((s) => character.proficiencies.skills[s]);
const expertiseSkillsOf = (character: Character): SkillName[] =>
  SKILL_OPTIONS.filter((s) => character.proficiencies.expertise[s]);

function FeatPicker({ character, state, patch }: LevelUpStepProps) {
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
  const alreadyProficient = proficientSkillsOf(character);
  const alreadyExpert = expertiseSkillsOf(character);
  const skillOptions = SKILL_OPTIONS.filter(
    (s) => !alreadyProficient.includes(s),
  );
  const expertiseOptions = uniq([
    ...alreadyProficient,
    ...state.featSkillChoices,
  ]).filter((s) => !alreadyExpert.includes(s));

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
                  (w) => !character.otherProficiencies.weapons.includes(w),
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
        <FeatPicker {...props} />
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
  // The highest leveled spell the character can now cast. Standard casters read
  // it from the shared multiclass slot table; Warlocks cast via pact magic,
  // which that table reports as zero, so fold in their pact-slot level too.
  const standardMax = Math.max(
    0,
    ...Object.values(SpellLevel)
      .filter((sl) => getDefaultSpellSlots(preview, sl) > 0)
      .map((sl) => getNumericSpellSlotLevel(sl)),
  );
  const pactMax = preview.class.some((c) => c.name === OfficialClass.Warlock)
    ? getPactSlotInfo(preview).level
    : 0;
  const maxSpellLevel = Math.max(standardMax, pactMax);
  const leveledSpellLevels = Array.from(
    { length: maxSpellLevel },
    (_, i) => i + 1,
  );
  // Artificer / homebrew aren't tagged in the SRD spell catalog, so show every
  // spell rather than an empty class-filtered list.
  const filterClass = spellListFilterFor(state.className);
  const setLevel = (numeric: number, indices: string[]) =>
    patch({ newSpells: { ...state.newSpells, [numeric]: indices } });

  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Add any new spells you learn this level. Known-spell counts aren&apos;t
        enforced — pick what fits, and you can always adjust on the sheet. Only
        SRD spells are searchable here; add spells from other books or homebrew
        manually from the sheet afterward.
      </p>
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
