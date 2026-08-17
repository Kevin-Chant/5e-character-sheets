import { Ref, useEffect, useRef, useState } from "react";
import { countBy, uniq } from "lodash";
import {
  REAL_SKILLS,
  Alignment,
  DRACONIC_ANCESTRIES,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { modifier } from "src/lib/rules";
import {
  ALL_RACES,
  getCatalogRace,
  getSubrace,
  raceGrantsFeat,
  subracesForRace,
} from "src/lib/builder/race-catalog";
import { ALL_SPELLS, getCatalogSpell } from "src/lib/spells/spell-catalog";
import {
  ALL_CLASSES,
  castsAtLevelOne,
  getCatalogClass,
} from "src/lib/builder/class-catalog";
import {
  expertiseDueAt,
  fightingStyleDueAt,
  getFightingStyle,
} from "src/lib/builder/class-features";
import { subclassesForClass } from "src/lib/builder/subclasses";
import { ALL_BACKGROUNDS, getBackground } from "src/lib/builder/backgrounds";
import {
  describeStartingWealth,
  parseEquipmentOption,
  rollStartingWealth,
  startingWealthFor,
  weaponSlotsForText,
  weaponsInCategory,
} from "src/lib/builder/equipment";
import { buildCharacter } from "src/lib/builder/build-character";
import {
  newOptionPicksAt,
  newRaceOptionPicksAt,
} from "src/lib/builder/chosen-options";
import { calculateCustomFormula } from "src/lib/formula";
import {
  POINT_BUY_BUDGET,
  STAT_ORDER,
  pointBuyCost,
  pointBuyRemaining,
  rollScore,
  RollMethod,
} from "src/lib/builder/ability-scores";
import {
  defaultRaceBonuses,
  resolveBaseStats,
  resolveFinalStats,
  scorePool,
} from "src/lib/builder/resolve";
import {
  CUSTOM_SUBRACE,
  NO_SUBRACE,
  RaceBonus,
  CatalogRace,
  CatalogSubrace,
} from "src/lib/builder/types";
import {
  ChipMultiSelect,
  Choice,
  ChoiceGrid,
  Field,
  FilterSearch,
  LinesInput,
  STAT_LABEL,
  StepProps,
  patchPersonality,
} from "src/components/builder/builder-common";
import { useSettings } from "src/lib/hooks/use-settings";
import {
  ChosenOptionPicker,
  FeatPicker,
  LanguagePicker,
  OptionalFeaturePicker,
  SpellChecklist,
  ToolPicker,
} from "./builder-pickers";
import { optionalFeaturesAt } from "src/lib/builder/optional-class-features";
import Select from "src/components/select";

const STAT_KEYS = Object.values(StatKey);
// Matches the comma/newline split `buildCharacter` applies to free-text
// proficiency fields.
const splitList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// --------------------------------------------------------------------- Start

export function StartStep({ state, patch }: StepProps) {
  return (
    <div className="builder-step">
      <p className="text-muted">
        Build a character step by step, or skip straight to the sheet.
      </p>
      <ChoiceGrid
        choices={[
          {
            key: "guided",
            title: "Guided build",
            subtitle: "Walk through race, class, ability scores, and more.",
            selected: state.mode === "guided",
            onClick: () => patch({ mode: "guided" }),
          },
          {
            key: "blank",
            title: "Blank sheet",
            subtitle: "Start empty and fill everything in yourself.",
            selected: state.mode === "blank",
            onClick: () => patch({ mode: "blank" }),
          },
          {
            key: "sample",
            title: "Sample character",
            subtitle: "A pre-filled example to explore and edit.",
            selected: state.mode === "sample",
            onClick: () => patch({ mode: "sample" }),
          },
        ]}
      />
      <p className="text-muted builder-hint">
        Blank and Sample create the sheet immediately. Guided continues below.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------- Race

const seedBonuses = (
  race?: CatalogRace,
  subrace?: CatalogSubrace,
): RaceBonus[] => defaultRaceBonuses(race, subrace);

function RaceBonusEditor({
  state,
  patch,
  innerRef,
}: StepProps & { innerRef?: Ref<HTMLDivElement> }) {
  if (!state.raceBonuses.length) return null;
  const race = getCatalogRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);
  const setStat = (i: number, stat: StatKey | "") =>
    patch({
      raceBonuses: state.raceBonuses.map((b, j) =>
        j === i ? { ...b, stat } : b,
      ),
    });
  return (
    <Field
      label="Ability score bonuses"
      hint="Defaults from your race — reassign these if your game uses floating bonuses."
      innerRef={innerRef}
    >
      <div className="builder-bonus-rows">
        {state.raceBonuses.map((b, i) => (
          <div key={i} className="builder-bonus-row">
            <span className="builder-bonus-amount">+{b.bonus}</span>
            <Select
              className="builder-input"
              label={`Which ability gets +${b.bonus}`}
              value={b.stat}
              options={[
                { value: "", label: "— choose —" },
                ...STAT_KEYS.map((s) => ({ value: s, label: STAT_LABEL[s] })),
              ]}
              onChange={(value) => setStat(i, value as StatKey | "")}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className="builder-linkish"
        onClick={() => patch({ raceBonuses: seedBonuses(race, subrace) })}
      >
        Reset to default
      </button>
    </Field>
  );
}

export function RaceStep({ state, patch }: StepProps) {
  const race = getCatalogRace(state.raceIndex);
  const custom = state.raceIsCustom;
  const subraces = subracesForRace(race);
  const [query, setQuery] = useState("");

  // Picking a race scrolls to the subrace picker; picking a subrace scrolls
  // to the ability-score bonuses. Race wins over subrace when both change at
  // once, to avoid a double scroll.
  const subraceRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef<HTMLDivElement>(null);
  const prev = useRef({
    raceIndex: state.raceIndex,
    subraceIndex: state.subraceIndex,
  });
  useEffect(() => {
    const changedRace = prev.current.raceIndex !== state.raceIndex;
    const changedSubrace = prev.current.subraceIndex !== state.subraceIndex;
    prev.current = {
      raceIndex: state.raceIndex,
      subraceIndex: state.subraceIndex,
    };
    if (changedRace) {
      if (state.raceIndex)
        subraceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
    } else if (changedSubrace) {
      bonusRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [state.raceIndex, state.subraceIndex]);

  const pickRace = (r: CatalogRace) => {
    const subs = subracesForRace(r);
    const firstSub = subs.length ? subs[0].index : NO_SUBRACE;
    const subrace = getSubrace(r, firstSub);
    patch({
      raceIndex: r.index,
      raceIsCustom: false,
      subraceIndex: firstSub,
      raceBonuses: seedBonuses(r, subrace),
      raceSkillChoices: [],
      raceLanguageChoices: [],
    });
  };

  const pickSubrace = (index?: string) => {
    const subrace =
      index === CUSTOM_SUBRACE || index === NO_SUBRACE
        ? undefined
        : getSubrace(race, index);
    patch({ subraceIndex: index, raceBonuses: seedBonuses(race, subrace) });
  };

  const q = query.trim().toLowerCase();
  const matches = ALL_RACES.filter((r) => r.name.toLowerCase().includes(q));
  const raceChoices: Choice[] = [
    ...matches.map((r) => ({
      key: r.index,
      title: r.name,
      subtitle: r.abilityBonuses
        .map((b) => `+${b.bonus} ${b.stat.toUpperCase()}`)
        .join(", "),
      selected: state.raceIndex === r.index,
      onClick: () => pickRace(r),
    })),
    {
      key: "__other",
      title: "Other race",
      subtitle: "A race beyond the core list — name it and add traits later.",
      selected: custom,
      onClick: () =>
        patch({
          raceIndex: undefined,
          raceIsCustom: true,
          subraceIndex: undefined,
          raceBonuses: [],
        }),
    },
  ];

  return (
    <div className="builder-step">
      <FilterSearch
        value={query}
        onChange={setQuery}
        placeholder="Search races…"
      />
      <ChoiceGrid choices={raceChoices} />

      {race && (
        <Field label="Subrace" innerRef={subraceRef}>
          <ChoiceGrid
            choices={[
              ...(subraces.length
                ? []
                : [
                    {
                      key: NO_SUBRACE,
                      title: "No subrace",
                      subtitle: "This race has no subrace.",
                      // Also the default when nothing is recorded yet.
                      selected:
                        state.subraceIndex === NO_SUBRACE ||
                        state.subraceIndex === undefined,
                      onClick: () => pickSubrace(NO_SUBRACE),
                    },
                  ]),
              ...subraces.map((s) => ({
                key: s.index,
                title: s.name,
                subtitle: s.abilityBonuses
                  .map((b) => `+${b.bonus} ${b.stat.toUpperCase()}`)
                  .join(", "),
                selected: state.subraceIndex === s.index,
                onClick: () => pickSubrace(s.index),
              })),
              {
                key: CUSTOM_SUBRACE,
                title: "Other subrace",
                subtitle: "From another book or homebrew.",
                selected: state.subraceIndex === CUSTOM_SUBRACE,
                onClick: () => pickSubrace(CUSTOM_SUBRACE),
              },
            ]}
          />
          {state.subraceIndex === CUSTOM_SUBRACE && (
            <input
              className="builder-input"
              value={state.customSubraceName}
              placeholder="Subrace name (e.g. Sea Elf)"
              onChange={(e) => patch({ customSubraceName: e.target.value })}
            />
          )}
        </Field>
      )}

      <RaceBonusEditor state={state} patch={patch} innerRef={bonusRef} />

      {(() => {
        // The skill choice can come from either race or subrace level.
        const subrace = getSubrace(race, state.subraceIndex);
        const skillChoices = race?.skillChoices ?? subrace?.skillChoices;
        if (!skillChoices) return null;
        // Custom Lineage's grant is darkvision *or* a skill.
        const eitherOr = race?.darkvisionOrSkill;
        return (
          <>
            {eitherOr && (
              <Field
                label="Darkvision or a skill"
                hint="Your lineage grants one of the two."
              >
                <div className="row">
                  {[
                    { took: true, label: `Darkvision ${eitherOr} ft` },
                    { took: false, label: "One skill proficiency" },
                  ].map((opt) => (
                    <label key={opt.label} className="builder-radio">
                      <input
                        type="radio"
                        checked={state.raceTookDarkvision === opt.took}
                        onChange={() => patch({ raceTookDarkvision: opt.took })}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            {!(eitherOr && state.raceTookDarkvision) && (
              <Field label="Skill proficiencies (from your race)">
                <ChipMultiSelect<SkillName>
                  options={skillChoices.from}
                  selected={state.raceSkillChoices}
                  max={skillChoices.choose}
                  onChange={(raceSkillChoices) => patch({ raceSkillChoices })}
                />
              </Field>
            )}
          </>
        );
      })()}

      {race?.draconicAncestry && (
        <Field
          label="Draconic ancestry"
          hint="Your dragon type sets your damage resistance and your breath weapon's shape, save, and damage type."
        >
          <Select
            className="builder-input"
            label="Draconic ancestry"
            value={state.draconicAncestry ?? ""}
            options={[
              { value: "", label: "Choose a dragon…" },
              ...Object.keys(DRACONIC_ANCESTRIES).map((color) => ({
                value: color,
                label: color,
              })),
            ]}
            onChange={(value) =>
              patch({ draconicAncestry: value || undefined })
            }
          />
        </Field>
      )}

      {(() => {
        const subrace = getSubrace(race, state.subraceIndex);
        const hasHighElfCantrip = [
          ...(race?.traits ?? []),
          ...(subrace?.traits ?? []),
        ].some((t) => t.title.trim().toLowerCase() === "high elf cantrip");
        if (!hasHighElfCantrip) return null;
        // Minus any cantrip already picked as a class or feat spell.
        const pickedElsewhere = [
          ...state.cantripIndices,
          ...Object.values(state.featSpellChoices).flat(),
        ];
        const wizardCantrips = ALL_SPELLS.filter(
          (s) =>
            s.level === 0 &&
            s.classes.includes("Wizard") &&
            (s.index === state.highElfCantrip ||
              !pickedElsewhere.includes(s.index)),
        );
        return (
          <Field
            label="Wizard cantrip (High Elf)"
            hint="You know one wizard cantrip, cast with Intelligence."
          >
            <Select
              className="builder-input"
              label="Wizard cantrip"
              value={state.highElfCantrip ?? ""}
              options={[
                { value: "", label: "Choose a cantrip…" },
                ...wizardCantrips.map((s) => ({
                  value: s.index,
                  label: s.name,
                })),
              ]}
              onChange={(value) =>
                patch({ highElfCantrip: value || undefined })
              }
            />
          </Field>
        );
      })()}

      {/* "One language of your choice" (Human, Half-Elf, …). */}
      {(() => {
        const subrace = getSubrace(race, state.subraceIndex);
        const count =
          (race?.languageChoices ?? 0) + (subrace?.languageChoices ?? 0);
        if (!count) return null;
        return (
          <Field
            label="Extra languages"
            hint={`Your race grants ${count} language(s) of your choice.`}
          >
            <LanguagePicker
              count={count}
              value={state.raceLanguageChoices}
              exclude={race?.languages ?? []}
              onChange={(raceLanguageChoices) => patch({ raceLanguageChoices })}
            />
          </Field>
        );
      })()}

      {/* Closed option lists a race grants at 1st level (e.g. Simic Hybrid's
          Animal Enhancement); same picker the class lists use. */}
      {newRaceOptionPicksAt(race?.name, 1).map(({ group, count }) => (
        <ChosenOptionPicker
          key={group.category}
          group={group}
          count={count}
          classLevel={1}
          alreadyKnown={[]}
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

      {raceGrantsFeat(race, getSubrace(race, state.subraceIndex)) && (
        <Field
          label="Feat"
          hint="Your race grants a feat at 1st level. Prerequisites are advisory."
        >
          <FeatPicker
            state={state}
            patch={patch}
            // Class and background aren't chosen yet at this step, but race
            // grants are known, so those lists at least exclude them.
            proficientSkills={[
              ...(race?.proficiencies.skills ?? []),
              ...(getSubrace(race, state.subraceIndex)?.proficiencies.skills ??
                []),
              ...state.raceSkillChoices,
            ]}
            expertSkills={[]}
            knownWeapons={[
              ...(race?.proficiencies.weapons ?? []),
              ...(getSubrace(race, state.subraceIndex)?.proficiencies.weapons ??
                []),
            ]}
            knownLanguages={[
              ...(race?.languages ?? []),
              ...state.raceLanguageChoices,
            ]}
            knownSpells={[
              state.highElfCantrip,
              ...state.cantripIndices,
              ...state.levelOneSpellIndices,
            ]
              .map((i) => (i ? getCatalogSpell(i)?.name : undefined))
              .filter((n): n is string => Boolean(n))}
          />
        </Field>
      )}

      {race &&
        (() => {
          const subrace = getSubrace(race, state.subraceIndex);
          const traitTitles = [...race.traits, ...(subrace?.traits ?? [])].map(
            (t) => t.title,
          );
          const fixedSkills = [
            ...race.proficiencies.skills,
            ...(subrace?.proficiencies.skills ?? []),
          ];
          return (
            <p className="text-muted builder-hint">
              Speed {subrace?.speed ?? race.speed} ft · Languages:{" "}
              {race.languages.join(", ")}
              {fixedSkills.length
                ? ` · Skill proficiencies: ${fixedSkills.join(", ")}`
                : ""}
              {traitTitles.length ? ` · Traits: ${traitTitles.join(", ")}` : ""}
            </p>
          );
        })()}

      {custom && (
        <Field label="Race name">
          <input
            className="builder-input"
            value={state.customRaceName}
            placeholder="e.g. Aarakocra"
            onChange={(e) => patch({ customRaceName: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- Class

export function ClassStep({ state, patch }: StepProps) {
  const klass = getCatalogClass(state.classIndex);
  const custom = state.classIsCustom;
  const [query, setQuery] = useState("");

  // Picking a class unfolds questions below the grid (fighting style, Tasha's
  // swaps, subclass, etc); scroll to whatever appeared, as the race step does.
  const belowRef = useRef<HTMLDivElement>(null);
  // A second-order answer (e.g. Superior Technique's maneuver) gets its own
  // scroll target so it doesn't land above the control the player just used.
  const picksRef = useRef<HTMLDivElement>(null);
  const selectionKey = custom ? "__custom" : state.classIndex;
  const prev = useRef({ selectionKey, style: state.fightingStyle });
  useEffect(() => {
    const changedClass = prev.current.selectionKey !== selectionKey;
    const changedStyle = prev.current.style !== state.fightingStyle;
    prev.current = { selectionKey, style: state.fightingStyle };
    if (changedClass) {
      if (selectionKey)
        belowRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
    } else if (changedStyle)
      picksRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [selectionKey, state.fightingStyle]);

  const q = query.trim().toLowerCase();
  const matches = ALL_CLASSES.filter((c) => c.name.toLowerCase().includes(q));
  const choices: Choice[] = [
    ...matches.map((c) => ({
      key: c.index,
      title: c.name,
      subtitle: `d${c.hitDie} · ${c.savingThrows
        .map((s) => s.toUpperCase())
        .join("/")} saves`,
      selected: state.classIndex === c.index,
      onClick: () =>
        patch({
          classIndex: c.index,
          classIsCustom: false,
          subclass: undefined,
          classEquipmentChoices: {},
          classWeaponChoices: {},
        }),
    })),
    {
      key: "__other",
      title: "Other class",
      subtitle: "Beyond the core list — set a name and hit die.",
      selected: custom,
      onClick: () =>
        patch({
          classIndex: undefined,
          classIsCustom: true,
          subclass: undefined,
          classEquipmentChoices: {},
          classWeaponChoices: {},
        }),
    },
  ];

  return (
    <div className="builder-step">
      <FilterSearch
        value={query}
        onChange={setQuery}
        placeholder="Search classes…"
      />
      <ChoiceGrid choices={choices} />

      <div ref={belowRef} className="builder-below-grid">
        {klass?.skillChoices && (
          <p className="text-muted builder-hint">
            You&apos;ll choose this class&apos;s {klass.skillChoices.choose}{" "}
            skill proficiencies in the Background &amp; skills step.
          </p>
        )}

        {klass && fightingStyleDueAt(klass.name, 1) && (
          <Field label="Fighting style">
            <Select
              className="builder-input"
              label="Fighting style"
              value={state.fightingStyle ?? ""}
              options={[
                { value: "", label: "Choose… (optional)" },
                ...fightingStyleDueAt(klass.name, 1)!.map((name) => ({
                  value: name,
                  label: name,
                })),
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

        {/* Tasha's swaps due at level 1 (e.g. ranger's Favored Foe / Deft Explorer). */}
        {klass && (
          <OptionalFeaturePicker
            features={optionalFeaturesAt(klass.name, 1)}
            taken={state.optionalFeatures ?? []}
            onChange={(optionalFeatures) => patch({ optionalFeatures })}
          />
        )}

        {klass?.subclassAtLevel1 && (
          <Field label="Subclass">
            <Select
              className="builder-input"
              label="Subclass"
              value={state.subclass ?? ""}
              options={[
                { value: "", label: "Choose… (optional)" },
                ...subclassesForClass(klass.index).map((sub) => ({
                  value: sub.name,
                  label: sub.name,
                })),
              ]}
              onChange={(value) => patch({ subclass: value || undefined })}
            />
            {(() => {
              const chosen = subclassesForClass(klass.index).find(
                (s) => s.name === state.subclass,
              );
              return chosen ? (
                <p className="text-muted builder-hint">{chosen.summary}</p>
              ) : null;
            })()}
          </Field>
        )}

        {/* A level-1 subclass whose grant includes "choose N skills" (e.g.
          Knowledge cleric). Other classes pick theirs in level-up. */}
        {(() => {
          if (!klass?.subclassAtLevel1 || !state.subclass) return null;
          const sc = subclassesForClass(klass.index).find(
            (s) => s.name === state.subclass,
          )?.grants?.skillChoices;
          if (!sc) return null;
          return (
            <Field
              label={`Subclass skills (choose ${sc.choose})`}
              hint={
                sc.expertise
                  ? "Your subclass grants these with expertise (double proficiency bonus)."
                  : "Skill proficiencies granted by your subclass."
              }
            >
              <ChipMultiSelect<SkillName>
                options={sc.from}
                selected={state.subclassSkillChoices}
                max={sc.choose}
                onChange={(subclassSkillChoices) =>
                  patch({ subclassSkillChoices })
                }
              />
            </Field>
          );
        })()}

        {/* Closed option lists this class grants at level 1 (e.g. ranger's
          Favored Enemy). Nothing is known yet at creation, so `alreadyKnown`
          is always empty. */}
        <div ref={picksRef} className="builder-below-grid">
          {klass &&
            newOptionPicksAt(klass.name, 1, {
              subclass: state.subclass,
              fightingStyle: state.fightingStyle,
              optionalFeatures: state.optionalFeatures,
            }).map(({ group, count }) => (
              <ChosenOptionPicker
                key={group.category}
                group={group}
                count={count}
                classLevel={1}
                alreadyKnown={[]}
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

        {custom && (
          <>
            <Field label="Class name">
              <input
                className="builder-input"
                value={state.customClassName}
                placeholder="e.g. Blood Hunter"
                onChange={(e) => patch({ customClassName: e.target.value })}
              />
            </Field>
            <Field label="Hit die">
              <Select
                className="builder-input"
                label="Hit die"
                value={state.customHitDie}
                options={[
                  StandardDie.d6,
                  StandardDie.d8,
                  StandardDie.d10,
                  StandardDie.d12,
                ].map((d) => ({ value: d, label: d }))}
                onChange={(value) =>
                  patch({ customHitDie: value as StandardDie })
                }
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------- Ability scores

function StatPreview({ state }: { state: StepProps["state"] }) {
  const base = resolveBaseStats(state);
  const final = resolveFinalStats(state);
  return (
    <div className="builder-stat-preview">
      {STAT_ORDER.map((stat) => {
        const bonus = final[stat] - base[stat];
        return (
          <div key={stat} className="builder-stat-final">
            <span className="builder-stat-name">{stat.toUpperCase()}</span>
            <span className="builder-stat-score">
              {final[stat]}
              {bonus ? (
                <span className="builder-stat-breakdown">
                  {" "}
                  ({base[stat]} + {bonus})
                </span>
              ) : null}
            </span>
            <span className="text-muted builder-stat-mod">
              {fmtMod(modifier(final[stat]))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const emptyAssignment = () => ({
  str: null,
  dex: null,
  con: null,
  int: null,
  wis: null,
  cha: null,
});

export function AbilityScoresStep({ state, patch }: StepProps) {
  const [rollMethod, setRollMethod] = useState<RollMethod>("4d6-drop-lowest");

  const setMethod = (scoreMethod: typeof state.scoreMethod) => {
    if (scoreMethod === "pointbuy")
      patch({
        scoreMethod,
        baseStats: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
      });
    else if (scoreMethod === "standard")
      patch({ scoreMethod, assignment: emptyAssignment() });
    else if (scoreMethod === "roll")
      patch({ scoreMethod, rolledPool: [], assignment: emptyAssignment() });
    else patch({ scoreMethod });
  };

  const rollOne = () => {
    if (state.rolledPool.length >= 6) return;
    patch({ rolledPool: [...state.rolledPool, rollScore(rollMethod)] });
  };

  const pool = scorePool(state);
  const assigned = Object.values(state.assignment).filter(
    (v) => v !== null,
  ).length;

  return (
    <div className="builder-step">
      <div className="builder-method-tabs">
        {(
          [
            ["pointbuy", "Point buy"],
            ["standard", "Standard array"],
            ["roll", "Roll"],
            ["manual", "Manual entry"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={
              state.scoreMethod === m ? "builder-tab selected" : "builder-tab"
            }
            onClick={() => setMethod(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {state.scoreMethod === "pointbuy" && (
        <PointBuyEditor state={state} patch={patch} />
      )}

      {state.scoreMethod === "roll" && (
        <div className="builder-roll-controls">
          <div className="builder-method-tabs">
            {(["4d6-drop-lowest", "3d6"] as RollMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                className={
                  rollMethod === m ? "builder-tab selected" : "builder-tab"
                }
                onClick={() => setRollMethod(m)}
              >
                {m === "3d6" ? "3d6" : "4d6 drop lowest"}
              </button>
            ))}
          </div>
          <div className="builder-roll-buttons">
            <button
              type="button"
              className="btn-primary"
              disabled={state.rolledPool.length >= 6}
              onClick={rollOne}
            >
              Roll a score ({state.rolledPool.length}/6)
            </button>
            {state.rolledPool.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  patch({ rolledPool: [], assignment: emptyAssignment() })
                }
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {(state.scoreMethod === "standard" || state.scoreMethod === "roll") && (
        <AssignEditor
          state={state}
          patch={patch}
          pool={pool}
          assigned={assigned}
        />
      )}

      {state.scoreMethod === "manual" && (
        <div className="builder-stat-inputs">
          {STAT_ORDER.map((stat) => (
            <Field key={stat} label={STAT_LABEL[stat]}>
              <ManualStatInput state={state} patch={patch} stat={stat} />
            </Field>
          ))}
        </div>
      )}

      <Field label="Final scores (with racial bonuses)">
        <StatPreview state={state} />
      </Field>
    </div>
  );
}

function ManualStatInput({
  state,
  patch,
  stat,
}: StepProps & { stat: StatKey }) {
  const value = state.baseStats[stat];
  // Local string draft so clearing the field shows empty rather than 0.
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if ((draft === "" ? 0 : Number(draft)) !== value) setDraft(String(value));
  }, [value]);

  return (
    <input
      type="number"
      className="builder-input"
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        patch({
          baseStats: {
            ...state.baseStats,
            [stat]: raw === "" ? 0 : Number(raw),
          },
        });
      }}
      onBlur={() => {
        if (draft === "") setDraft("0");
      }}
    />
  );
}

function PointBuyEditor({ state, patch }: StepProps) {
  const remaining = pointBuyRemaining(state.baseStats);
  const set = (stat: StatKey, value: number) =>
    patch({ baseStats: { ...state.baseStats, [stat]: value } });
  return (
    <div>
      <p className={remaining < 0 ? "builder-budget over" : "builder-budget"}>
        Points remaining: <strong>{remaining}</strong> / {POINT_BUY_BUDGET}
      </p>
      <div className="builder-stat-inputs">
        {STAT_ORDER.map((stat) => {
          const v = state.baseStats[stat];
          const canInc =
            v < 15 && remaining - (pointBuyCost(v + 1) - pointBuyCost(v)) >= 0;
          return (
            <div key={stat} className="builder-stepper-row">
              <span className="builder-stat-name">{STAT_LABEL[stat]}</span>
              <div className="builder-stepper">
                <button
                  type="button"
                  disabled={v <= 8}
                  onClick={() => set(stat, v - 1)}
                >
                  −
                </button>
                <span className="builder-stepper-value">{v}</span>
                <button
                  type="button"
                  disabled={!canInc}
                  onClick={() => set(stat, v + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Assign a value pool (standard array or rolled scores) onto the six
// abilities; each pool value can be used only as many times as it appears.
function AssignEditor({
  state,
  patch,
  pool,
  assigned,
}: StepProps & { pool: number[]; assigned: number }) {
  const poolCounts = countBy(pool);
  const usedCounts = countBy(
    Object.values(state.assignment).filter((v): v is number => v !== null),
  );
  const distinct = Array.from(new Set(pool)).sort((a, b) => b - a);

  const setStat = (stat: StatKey, raw: string) =>
    patch({
      assignment: {
        ...state.assignment,
        [stat]: raw === "" ? null : Number(raw),
      },
    });

  return (
    <div>
      {pool.length > 0 && (
        <div className="builder-pool">
          {pool.map((v, i) => {
            const usedBefore = pool.slice(0, i).filter((x) => x === v).length;
            const used = usedBefore < (usedCounts[v] ?? 0);
            return (
              <span
                key={i}
                className={
                  used ? "builder-pool-chip used" : "builder-pool-chip"
                }
              >
                {v}
              </span>
            );
          })}
          <span className="text-muted builder-hint">{assigned}/6 assigned</span>
        </div>
      )}
      <div className="builder-stat-inputs">
        {STAT_ORDER.map((stat) => {
          const current = state.assignment[stat];
          return (
            <div key={stat} className="builder-stepper-row">
              <span className="builder-stat-name">{STAT_LABEL[stat]}</span>
              <Select
                className="builder-input"
                label={`${STAT_LABEL[stat]} score`}
                value={current === null ? "" : String(current)}
                options={[
                  { value: "", label: "—" },
                  // A score spent elsewhere stays on the list but dims.
                  ...distinct.map((v) => ({
                    value: String(v),
                    label: String(v),
                    disabled:
                      (poolCounts[v] ?? 0) -
                        (usedCounts[v] ?? 0) +
                        (current === v ? 1 : 0) <=
                      0,
                  })),
                ]}
                onChange={(value) => setStat(stat, value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Background

export function BackgroundStep({ state, patch }: StepProps) {
  const [query, setQuery] = useState("");
  const bg = getBackground(state.backgroundName);
  const custom = state.backgroundIsCustom;
  const languageCount = bg?.languages ?? 0;
  const klass = getCatalogClass(state.classIndex);
  const race = getCatalogRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);

  const belowRef = useRef<HTMLDivElement>(null);
  const selectionKey = custom ? "__custom" : state.backgroundName;
  const prevSelection = useRef(selectionKey);
  useEffect(() => {
    if (prevSelection.current !== selectionKey && selectionKey)
      belowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    prevSelection.current = selectionKey;
  }, [selectionKey]);

  const q = query.trim().toLowerCase();
  const matches = ALL_BACKGROUNDS.filter((b) =>
    [b.name, b.source ?? "", ...b.skills, ...(b.skillChoices?.from ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
  const choices: Choice[] = [
    ...matches.map((b) => ({
      key: b.name,
      title: b.name,
      subtitle: [
        b.skills.join(", "),
        b.skillChoices && `+${b.skillChoices.choose} of your choice`,
        b.source,
      ]
        .filter(Boolean)
        .join(" · "),
      selected: state.backgroundName === b.name,
      onClick: () =>
        patch({
          backgroundName: b.name,
          backgroundIsCustom: false,
          backgroundLanguageChoices: [],
          backgroundSkillChoices: [],
        }),
    })),
    {
      key: "__custom",
      title: "Custom background",
      subtitle: "Pick your own skills and feature.",
      selected: custom,
      onClick: () =>
        patch({ backgroundName: undefined, backgroundIsCustom: true }),
    },
  ];

  // Fed to the pickers' `exclude` so a duplicate suggestion needs deliberate free text.
  const knownLanguages = [
    ...(race?.languages ?? []),
    ...state.raceLanguageChoices,
  ];
  const knownTools = [
    ...(klass?.proficiencies.tools ?? []),
    ...state.toolChoices,
    ...(race?.proficiencies.tools ?? []),
    ...(subrace?.proficiencies.tools ?? []),
  ];

  const bgSkillChoices = state.backgroundSkillChoices.filter((sk) =>
    (bg?.skillChoices?.from ?? []).includes(sk),
  );
  const bgSkills = custom
    ? state.customBackgroundSkills
    : [...(bg?.skills ?? []), ...bgSkillChoices];
  const grantedSkills = [
    ...bgSkills,
    ...state.raceSkillChoices,
    ...(race?.proficiencies.skills ?? []),
    ...(subrace?.proficiencies.skills ?? []),
  ];
  const classSkillOptions = (klass?.skillChoices?.from ?? []).filter(
    (s) => !grantedSkills.includes(s),
  );
  const classSelected = state.classSkillChoices.filter((s) =>
    classSkillOptions.includes(s),
  );
  // Everything the character will be proficient in; Thieves' Tools is
  // modeled as a pseudo-skill so a rogue's grant shows up here too.
  const expertiseOptions = uniq([
    ...grantedSkills,
    ...classSelected,
    ...((klass?.proficiencies.tools ?? []).includes("Thieves' Tools")
      ? [SkillName["Thieves Tools"]]
      : []),
  ]);
  const expertiseDue = klass
    ? expertiseDueAt(klass.name, 1, state.optionalFeatures ?? [])
    : 0;

  return (
    <div className="builder-step">
      <FilterSearch
        value={query}
        onChange={setQuery}
        placeholder="Search backgrounds…"
      />
      <ChoiceGrid choices={choices} />

      <div ref={belowRef} className="builder-below-grid">
        {bg?.skillChoices && (
          <Field
            label={`Background skill proficiencies (choose ${bg.skillChoices.choose})`}
            hint={`${bg.name} grants ${bg.skills.length ? bg.skills.join(", ") + " plus " : ""}your pick of these.`}
          >
            <ChipMultiSelect<SkillName>
              options={bg.skillChoices.from}
              selected={bgSkillChoices}
              max={bg.skillChoices.choose}
              onChange={(backgroundSkillChoices) =>
                patch({ backgroundSkillChoices })
              }
            />
          </Field>
        )}

        {bg && (
          <p className="text-muted builder-hint">
            {[
              bgSkills.length && `Skills: ${bgSkills.join(", ")}`,
              bg.tools.length && `Tools: ${bg.tools.join(", ")}`,
              `Feature: ${bg.feature.title}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {custom && (
          <>
            <Field label="Background skill proficiencies" hint="Choose 2">
              <ChipMultiSelect<SkillName>
                options={REAL_SKILLS}
                selected={state.customBackgroundSkills}
                max={2}
                onChange={(customBackgroundSkills) =>
                  patch({ customBackgroundSkills })
                }
              />
            </Field>
            {/* Two tool proficiencies or languages in any combination; kept
                as separate fields since they land in different places on the sheet. */}
            <Field
              label="Tool proficiencies"
              hint="Your background grants two tool proficiencies or languages, in any combination."
            >
              <ToolPicker
                count={2}
                value={splitList(state.customBackgroundTools)}
                exclude={knownTools}
                onChange={(tools) =>
                  patch({
                    customBackgroundTools: tools.filter(Boolean).join(", "),
                  })
                }
              />
            </Field>
            <Field label="Languages">
              <LanguagePicker
                count={2}
                value={state.backgroundLanguageChoices}
                exclude={knownLanguages}
                onChange={(backgroundLanguageChoices) =>
                  patch({ backgroundLanguageChoices })
                }
              />
            </Field>
            <Field label="Background feature">
              <input
                className="builder-input"
                placeholder="Feature name"
                value={state.customBackgroundFeatureTitle}
                onChange={(e) =>
                  patch({ customBackgroundFeatureTitle: e.target.value })
                }
              />
              <textarea
                className="builder-textarea"
                rows={2}
                placeholder="What it does (optional)"
                value={state.customBackgroundFeatureDetail}
                onChange={(e) =>
                  patch({ customBackgroundFeatureDetail: e.target.value })
                }
              />
            </Field>
          </>
        )}

        {languageCount > 0 && (
          <Field
            label="Extra languages"
            hint={`Your background grants ${languageCount} language(s) of your choice`}
          >
            <LanguagePicker
              count={languageCount}
              value={state.backgroundLanguageChoices}
              exclude={knownLanguages}
              onChange={(backgroundLanguageChoices) =>
                patch({ backgroundLanguageChoices })
              }
            />
          </Field>
        )}

        {klass?.skillChoices && (
          <Field
            label={`Class skill proficiencies (${klass.name})`}
            hint={`Choose ${klass.skillChoices.choose}${
              grantedSkills.length
                ? " — skills from your background/race are hidden to avoid duplicates"
                : ""
            }`}
          >
            <ChipMultiSelect<SkillName>
              options={classSkillOptions}
              selected={classSelected}
              max={klass.skillChoices.choose}
              onChange={(classSkillChoices) => patch({ classSkillChoices })}
            />
          </Field>
        )}

        {klass?.toolChoices && (
          <Field
            label={`Tool proficiencies (${klass.name})`}
            hint={`Choose ${klass.toolChoices.choose}`}
          >
            <ChipMultiSelect
              // Minus tools the background or race already grants.
              options={klass.toolChoices.from.filter(
                (t) =>
                  !(bg?.tools ?? []).includes(t) &&
                  !(race?.proficiencies.tools ?? []).includes(t) &&
                  !(subrace?.proficiencies.tools ?? []).includes(t),
              )}
              selected={state.toolChoices.filter((t) =>
                klass.toolChoices!.from.includes(t),
              )}
              max={klass.toolChoices.choose}
              onChange={(toolChoices) => patch({ toolChoices })}
            />
          </Field>
        )}

        {/* After the skill pickers: expertise can only double a proficiency you have. */}
        {klass && expertiseDue > 0 && (
          <Field
            label={`Expertise (choose ${expertiseDue})`}
            hint={
              expertiseOptions.length
                ? "Double your proficiency bonus for these. Thieves' Tools counts."
                : "Choose your skill proficiencies above first."
            }
          >
            <ChipMultiSelect<SkillName>
              options={expertiseOptions}
              selected={state.expertiseChoices.filter((s) =>
                expertiseOptions.includes(s),
              )}
              max={expertiseDue}
              onChange={(expertiseChoices) => patch({ expertiseChoices })}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Spells

export function SpellsStep({ state, patch }: StepProps) {
  const klass = getCatalogClass(state.classIndex);
  if (!klass || !castsAtLevelOne(klass) || !klass.spellcasting) {
    return (
      <div className="builder-step">
        <p className="text-muted">
          This class does not cast spells at level 1.
        </p>
      </div>
    );
  }
  const sc = klass.spellcasting;
  // Spells already picked elsewhere (racial cantrip, feat-granted picks)
  // leave the class lists so creation can't take the same spell twice.
  const pickedElsewhere = [
    state.highElfCantrip,
    ...Object.values(state.featSpellChoices).flat(),
  ]
    .map((i) => (i ? getCatalogSpell(i)?.name : undefined))
    .filter((n): n is string => Boolean(n));
  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Only official spells are listed here. Pick what you like now — you can
        always add more (including homebrew) from the sheet afterward, and
        you&apos;re free to skip this step.
      </p>
      <Field
        label={`Cantrips (${state.cantripIndices.length} of ${sc.cantripsKnown})`}
      >
        <SpellChecklist
          className={klass.name}
          level={0}
          selected={state.cantripIndices}
          max={sc.cantripsKnown}
          alreadyKnown={pickedElsewhere}
          onChange={(cantripIndices) => patch({ cantripIndices })}
        />
      </Field>
      <Field
        label={
          sc.spellsKnown !== null
            ? `Level 1 spells (${state.levelOneSpellIndices.length} of ${sc.spellsKnown})`
            : `Level 1 spells (${state.levelOneSpellIndices.length} chosen)`
        }
        hint={
          sc.spellsKnown === null
            ? "Prepared caster — pick the spells you want on hand to start."
            : undefined
        }
      >
        <SpellChecklist
          className={klass.name}
          level={1}
          selected={state.levelOneSpellIndices}
          max={sc.spellsKnown}
          alreadyKnown={pickedElsewhere}
          onChange={(levelOneSpellIndices) => patch({ levelOneSpellIndices })}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- Equipment

export function EquipmentStep({ state, patch }: StepProps) {
  const klass = getCatalogClass(state.classIndex);
  const bg = getBackground(state.backgroundName);
  const parsedOptions = klass
    ? klass.startingEquipmentOptions.map(parseEquipmentOption)
    : [];
  // Fixed grants: flat items plus any option line with no "(x)" choice.
  const fixedItems = [
    ...(klass?.startingEquipment ?? []),
    ...parsedOptions.flatMap((o) => (o.kind === "fixed" ? [o.text] : [])),
  ];
  const setChoice = (i: number, idx: number) =>
    patch({
      classEquipmentChoices: { ...state.classEquipmentChoices, [i]: idx },
    });
  const setWeapon = (i: number, slot: number, name: string) => {
    const picks = [...(state.classWeaponChoices[i] ?? [])];
    picks[slot] = name;
    patch({ classWeaponChoices: { ...state.classWeaponChoices, [i]: picks } });
  };
  const wealth = startingWealthFor(klass?.name);
  const tookGold = state.startingWealth === "gold";
  return (
    <div className="builder-step">
      {wealth && (
        <Field
          label="Class equipment or starting gold"
          hint={`The PHB alternative: forgo your class's package and roll ${describeStartingWealth(wealth)} to buy your own. Your background's equipment comes with you either way.`}
        >
          <div className="row">
            {(
              [
                ["equipment", "Take the equipment"],
                ["gold", "Roll for gold"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="builder-radio">
                <input
                  type="radio"
                  checked={state.startingWealth === value}
                  onChange={() => patch({ startingWealth: value })}
                />
                {label}
              </label>
            ))}
          </div>
          {tookGold && (
            <div className="builder-roll-buttons">
              <input
                className="builder-input"
                type="number"
                min={0}
                value={state.startingGold ?? ""}
                placeholder={`Your ${describeStartingWealth(wealth)} result`}
                onChange={(e) =>
                  patch({
                    startingGold: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  patch({ startingGold: rollStartingWealth(wealth) })
                }
              >
                Roll
              </button>
            </div>
          )}
        </Field>
      )}
      {klass && !tookGold && (
        <label className="builder-check-row">
          <input
            type="checkbox"
            checked={state.acceptClassEquipment}
            onChange={(e) => patch({ acceptClassEquipment: e.target.checked })}
          />
          <span>
            <strong>Class equipment ({klass.name})</strong>
            {fixedItems.length > 0 && (
              <span className="text-muted builder-hint">
                Includes: {fixedItems.join(", ")}
              </span>
            )}
          </span>
        </label>
      )}
      {klass &&
        !tookGold &&
        state.acceptClassEquipment &&
        parsedOptions.map((opt, i) => {
          if (opt.kind !== "choice") return null;
          const selIdx = state.classEquipmentChoices[i] ?? 0;
          const slots = weaponSlotsForText(opt.choices[selIdx]?.text ?? "");
          return (
            <Field key={i} label="Choose one">
              {opt.choices.map((c, idx) => (
                <label key={c.key} className="builder-check-row">
                  <input
                    type="radio"
                    name={`class-equip-${i}`}
                    checked={selIdx === idx}
                    onChange={() => setChoice(i, idx)}
                  />
                  <span>{c.text}</span>
                </label>
              ))}
              {slots.map((category, slot) => {
                const weapons = weaponsInCategory(category);
                const value = state.classWeaponChoices[i]?.[slot] ?? weapons[0]?.name; // prettier-ignore
                return (
                  <Select
                    key={slot}
                    className="builder-input builder-weapon-select"
                    label={`Which ${category} to take`}
                    value={value}
                    options={weapons.map((w) => ({
                      value: w.name,
                      label: w.name,
                    }))}
                    onChange={(value) => setWeapon(i, slot, value)}
                  />
                );
              })}
            </Field>
          );
        })}
      {bg && (
        <label className="builder-check-row">
          <input
            type="checkbox"
            checked={state.acceptBackgroundEquipment}
            onChange={(e) =>
              patch({ acceptBackgroundEquipment: e.target.checked })
            }
          />
          <span>
            <strong>Background equipment</strong>
            <span className="text-muted builder-hint">
              {bg.equipment.join(", ")}
              {bg.gold ? ` · ${bg.gold} gp` : ""}
            </span>
          </span>
        </label>
      )}
      <Field label="Anything else" hint="One item per line">
        <LinesInput
          value={state.extraEquipment}
          placeholder="e.g. Rope, 50 ft"
          onChange={(extraEquipment) => patch({ extraEquipment })}
        />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ Details

export function DetailsStep({ state, patch }: StepProps) {
  const {
    settings: { trackPersonality },
  } = useSettings();
  return (
    <div className="builder-step">
      <Field label="Character name">
        <input
          className="builder-input"
          value={state.name}
          placeholder="Optional — defaults to “New Character”"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </Field>
      <Field label="Player name">
        <input
          className="builder-input"
          value={state.playerName}
          onChange={(e) => patch({ playerName: e.target.value })}
        />
      </Field>
      <Field label="Alignment">
        <Select
          className="builder-input"
          label="Alignment"
          value={state.alignment}
          options={Object.values(Alignment).map((a) => ({
            value: a,
            label: a,
          }))}
          onChange={(value) => patch({ alignment: value as Alignment })}
        />
      </Field>
      {trackPersonality &&
        (
          [
            ["traits", "Personality traits"],
            ["ideals", "Ideals"],
            ["bonds", "Bonds"],
            ["flaws", "Flaws"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} hint="Optional — one per line">
            <LinesInput
              rows={2}
              value={state.personality[key]}
              onChange={(lines) => patch(patchPersonality(state, key, lines))}
            />
          </Field>
        ))}
    </div>
  );
}

// ------------------------------------------------------------------- Review

export function ReviewStep({ state }: StepProps) {
  const race = getCatalogRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);
  const klass = getCatalogClass(state.classIndex);
  const subraceName =
    state.subraceIndex === CUSTOM_SUBRACE
      ? state.customSubraceName
      : subrace?.name;
  const baseRaceName = race ? race.name : state.customRaceName || "Custom race";
  const raceName = subraceName
    ? `${baseRaceName} (${subraceName})`
    : baseRaceName;
  const className = klass?.name ?? (state.customClassName || "Custom class");
  const final = resolveFinalStats(state);
  // So the summary reflects the same derived numbers the sheet will show.
  const char = buildCharacter(state);
  const ac = calculateCustomFormula(char.acFormula, char);
  const skills = Object.keys(char.proficiencies.skills);
  const gold = char.coins.GP ?? 0;
  const rows: [string, string][] = [
    ["Name", state.name || "New Character"],
    ["Race", raceName],
    ["Class", state.subclass ? `${className} (${state.subclass})` : className],
    ["Background", char.background || "—"],
    [
      "Ability scores",
      STAT_ORDER.map((s) => `${s.toUpperCase()} ${final[s]}`).join("  "),
    ],
    ["HP / AC", `${char.currHp} HP · AC ${ac}`],
    ["Skills", skills.length ? skills.join(", ") : "—"],
  ];
  if (klass && castsAtLevelOne(klass))
    rows.push([
      "Spells",
      `${state.cantripIndices.length} cantrips, ${state.levelOneSpellIndices.length} level-1`,
    ]);
  if (gold) rows.push(["Starting gold", `${gold} gp`]);
  return (
    <div className="builder-step">
      <p className="text-muted">
        Review your level-1 character, then create it.
      </p>
      <dl className="builder-review">
        {rows.map(([k, v]) => (
          <div key={k} className="builder-review-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
