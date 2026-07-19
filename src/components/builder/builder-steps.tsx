import { useEffect, useMemo, useRef, useState } from "react";
import { countBy } from "lodash";
import {
  Alignment,
  OfficialSubclasses,
  SkillName,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { modifier } from "src/lib/rules";
import {
  SRD_RACES,
  getSrdRace,
  getSubrace,
  subracesForRace,
} from "src/lib/builder/srd-races";
import {
  SRD_CLASSES,
  castsAtLevelOne,
  getSrdClass,
} from "src/lib/builder/srd-classes";
import { PHB_BACKGROUNDS, getBackground } from "src/lib/builder/backgrounds";
import {
  parseEquipmentOption,
  weaponSlotsForText,
  weaponsInCategory,
} from "src/lib/builder/equipment";
import { buildCharacter } from "src/lib/builder/build-character";
import { calculateCustomFormula } from "src/lib/formula";
import { searchSrdSpells } from "src/lib/spells/srd-spells";
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
  RaceBonus,
  SrdRace,
  SrdSubrace,
} from "src/lib/builder/types";
import {
  ChipMultiSelect,
  Choice,
  ChoiceGrid,
  Field,
  LanguagePicker,
  LinesInput,
  STAT_LABEL,
  StepProps,
  patchPersonality,
} from "src/components/builder/builder-common";

const ALL_SKILLS = Object.values(SkillName).filter(
  (s) => s !== SkillName["Thieves Tools"],
) as SkillName[];

const STAT_KEYS = Object.values(StatKey);
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

const seedBonuses = (race?: SrdRace, subrace?: SrdSubrace): RaceBonus[] =>
  defaultRaceBonuses(race, subrace);

function RaceBonusEditor({ state, patch }: StepProps) {
  if (!state.raceBonuses.length) return null;
  const race = getSrdRace(state.raceIndex);
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
    >
      <div className="builder-bonus-rows">
        {state.raceBonuses.map((b, i) => (
          <div key={i} className="builder-bonus-row">
            <span className="builder-bonus-amount">+{b.bonus}</span>
            <select
              className="builder-input"
              value={b.stat}
              onChange={(e) => setStat(i, e.target.value as StatKey | "")}
            >
              <option value="">— choose —</option>
              {STAT_KEYS.map((s) => (
                <option key={s} value={s}>
                  {STAT_LABEL[s]}
                </option>
              ))}
            </select>
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
  const race = getSrdRace(state.raceIndex);
  const custom = state.raceIsCustom;
  const subraces = subracesForRace(race);

  // When the player switches to a race that offers subraces, the subrace picker
  // unfolds below the fold — scroll it into view so it isn't missed.
  const subraceRef = useRef<HTMLDivElement>(null);
  const prevRaceIndex = useRef(state.raceIndex);
  useEffect(() => {
    if (prevRaceIndex.current !== state.raceIndex) {
      prevRaceIndex.current = state.raceIndex;
      if (subraces.length)
        subraceRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
    }
  }, [state.raceIndex, subraces.length]);

  const pickRace = (r: SrdRace) => {
    const firstSub = subracesForRace(r)[0]?.index;
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
      index === CUSTOM_SUBRACE ? undefined : getSubrace(race, index);
    patch({ subraceIndex: index, raceBonuses: seedBonuses(race, subrace) });
  };

  const raceChoices: Choice[] = [
    ...SRD_RACES.map((r) => ({
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
      <ChoiceGrid choices={raceChoices} />

      {race && (
        <Field label="Subrace" innerRef={subraceRef}>
          <ChoiceGrid
            choices={[
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

      <RaceBonusEditor state={state} patch={patch} />

      {race?.skillChoices && (
        <Field label="Skill proficiencies (from your race)">
          <ChipMultiSelect<SkillName>
            options={race.skillChoices.from}
            selected={state.raceSkillChoices}
            max={race.skillChoices.choose}
            onChange={(raceSkillChoices) => patch({ raceSkillChoices })}
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
  const klass = getSrdClass(state.classIndex);
  const custom = state.classIsCustom;
  const choices: Choice[] = [
    ...SRD_CLASSES.map((c) => ({
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
      <ChoiceGrid choices={choices} />

      {klass?.skillChoices && (
        <p className="text-muted builder-hint">
          You&apos;ll choose this class&apos;s {klass.skillChoices.choose} skill
          proficiencies in the Background &amp; skills step.
        </p>
      )}

      {klass?.subclassAtLevel1 && (
        <Field label="Subclass">
          <select
            className="builder-input"
            value={state.subclass ?? ""}
            onChange={(e) => patch({ subclass: e.target.value || undefined })}
          >
            <option value="">Choose… (optional)</option>
            {(
              OfficialSubclasses[
                klass.name as keyof typeof OfficialSubclasses
              ] ?? []
            ).map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </Field>
      )}

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
            <select
              className="builder-input"
              value={state.customHitDie}
              onChange={(e) =>
                patch({ customHitDie: e.target.value as StandardDie })
              }
            >
              {[
                StandardDie.d6,
                StandardDie.d8,
                StandardDie.d10,
                StandardDie.d12,
              ].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
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
            <span className="builder-stat-score">{final[stat]}</span>
            <span className="text-muted builder-stat-mod">
              {fmtMod(modifier(final[stat]))}
              {bonus ? ` (${base[stat]}+${bonus})` : ""}
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
              <input
                type="number"
                className="builder-input"
                value={state.baseStats[stat]}
                onChange={(e) =>
                  patch({
                    baseStats: {
                      ...state.baseStats,
                      [stat]: Number(e.target.value) || 0,
                    },
                  })
                }
              />
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

// Assign a value pool (standard array or rolled scores) onto the six abilities.
// The array is shown above; each ability starts empty and each pool value can
// be used only as many times as it appears (handles duplicate rolls).
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
              <select
                className="builder-input"
                value={current ?? ""}
                onChange={(e) => setStat(stat, e.target.value)}
              >
                <option value="">—</option>
                {distinct.map((v) => {
                  const free =
                    (poolCounts[v] ?? 0) -
                    (usedCounts[v] ?? 0) +
                    (current === v ? 1 : 0);
                  return (
                    <option key={v} value={v} disabled={free <= 0}>
                      {v}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Background

export function BackgroundStep({ state, patch }: StepProps) {
  const bg = getBackground(state.backgroundName);
  const custom = state.backgroundIsCustom;
  const languageCount = bg?.languages ?? 0;
  const klass = getSrdClass(state.classIndex);
  const race = getSrdRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);

  const choices: Choice[] = [
    ...PHB_BACKGROUNDS.map((b) => ({
      key: b.name,
      title: b.name,
      subtitle: b.skills.join(", "),
      selected: state.backgroundName === b.name,
      onClick: () =>
        patch({
          backgroundName: b.name,
          backgroundIsCustom: false,
          backgroundLanguageChoices: [],
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

  // Skills already granted by background + race, so class picks don't waste on
  // duplicates (BG3-style).
  const bgSkills = custom ? state.customBackgroundSkills : (bg?.skills ?? []);
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

  return (
    <div className="builder-step">
      <ChoiceGrid choices={choices} />

      {bg && (
        <p className="text-muted builder-hint">
          Skills: {bg.skills.join(", ")}
          {bg.tools.length ? ` · Tools: ${bg.tools.join(", ")}` : ""} · Feature:{" "}
          {bg.feature.title}
        </p>
      )}

      {custom && (
        <>
          <Field label="Background skill proficiencies" hint="Choose 2">
            <ChipMultiSelect<SkillName>
              options={ALL_SKILLS}
              selected={state.customBackgroundSkills}
              max={2}
              onChange={(customBackgroundSkills) =>
                patch({ customBackgroundSkills })
              }
            />
          </Field>
          <Field label="Tool proficiencies / languages" hint="Comma separated">
            <input
              className="builder-input"
              value={state.customBackgroundTools}
              onChange={(e) => patch({ customBackgroundTools: e.target.value })}
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
    </div>
  );
}

// ------------------------------------------------------------------- Spells

function SpellChecklist({
  className,
  level,
  selected,
  max,
  onChange,
}: {
  className: string;
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
        {spells.map((s) => {
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
        })}
      </div>
    </div>
  );
}

export function SpellsStep({ state, patch }: StepProps) {
  const klass = getSrdClass(state.classIndex);
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
  return (
    <div className="builder-step">
      <p className="text-muted builder-hint">
        Only SRD spells are listed here. Pick what you like now — you can always
        add more (including spells from other books or homebrew) from the sheet
        afterward, and you&apos;re free to skip this step.
      </p>
      <Field
        label={`Cantrips (${state.cantripIndices.length} of ${sc.cantripsKnown})`}
      >
        <SpellChecklist
          className={klass.name}
          level={0}
          selected={state.cantripIndices}
          max={sc.cantripsKnown}
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
          onChange={(levelOneSpellIndices) => patch({ levelOneSpellIndices })}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- Equipment

export function EquipmentStep({ state, patch }: StepProps) {
  const klass = getSrdClass(state.classIndex);
  const bg = getBackground(state.backgroundName);
  const parsedOptions = klass
    ? klass.startingEquipmentOptions.map(parseEquipmentOption)
    : [];
  // Fixed grants: the class's flat items plus any option line with no "(x)"
  // choice (e.g. "holy symbol").
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
  return (
    <div className="builder-step">
      {klass && (
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
                  <select
                    key={slot}
                    className="builder-input builder-weapon-select"
                    value={value}
                    onChange={(e) => setWeapon(i, slot, e.target.value)}
                  >
                    {weapons.map((w) => (
                      <option key={w.name} value={w.name}>
                        {w.name}
                      </option>
                    ))}
                  </select>
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
        <select
          className="builder-input"
          value={state.alignment}
          onChange={(e) => patch({ alignment: e.target.value as Alignment })}
        >
          {Object.values(Alignment).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>
      {(
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
  const race = getSrdRace(state.raceIndex);
  const subrace = getSubrace(race, state.subraceIndex);
  const klass = getSrdClass(state.classIndex);
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
  // Assemble the character now so the summary reflects the same derived numbers
  // (HP, AC, proficient skills, gold) the sheet will show.
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
