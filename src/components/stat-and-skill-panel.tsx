import ProficiencyDisplay from "src/components/display/proficiency-display";
import SingleValueDisplay from "src/components/display/single-value-display";
import StatDisplay from "src/components/display/stat-display";
import { FIELD, SkillName, StatKey } from "src/lib/data/data-definitions";
import { updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  SKILL_SOURCE_STATS,
  STAT_NAMES,
  calculateAtomicVariable,
  calculateCustomFormula,
  getPB,
  modifier,
} from "src/lib/utils";
import MultiLineTextDisplay from "./display/multi-line-text-display";

function SkillsColumn({ pb }: { pb: number }) {
  const { character, dispatch } = useCharacter();
  if (!character) return <></>;

  const createProficiencyUpdater = (field: FIELD, subField: string) => {
    return (value: boolean) => {
      dispatch(updateData(field, { value: value }, subField));
    };
  };

  return (
    <div className="column">
      <SingleValueDisplay
        name="Inspiration"
        field={FIELD.inspiration}
        editable
      />
      <SingleValueDisplay
        name="Proficiency Bonus"
        field={FIELD.pbOverride}
        transform={calculateCustomFormula}
        editable
      />
      <div className="column rounded-border-box margin-medium">
        {(Object.entries(STAT_NAMES) as [StatKey, string][]).map(
          ([statKey, statName]) => {
            const proficient = !!character.proficiencies.savingThrows[statKey];
            return (
              <ProficiencyDisplay
                key={statKey}
                field={FIELD.proficiencies}
                subField={`savingThrows.${statKey}`}
                id={`${statKey}_save_proficiency`}
                proficient={proficient}
                expert={false}
                jack={false}
                transform={(proficient) =>
                  modifier(character.stats[statKey]) + (proficient ? pb : 0)
                }
                text={statName}
                updateProficiency={createProficiencyUpdater(
                  FIELD.proficiencies,
                  `savingThrows.${statKey}`
                )}
              />
            );
          }
        )}
        <b>Saving Throws</b>
      </div>

      <div className="column rounded-border-box margin-medium">
        {(Object.entries(SKILL_SOURCE_STATS) as [SkillName, StatKey][]).map(
          ([skillName, statKey]) => {
            const proficient = !!character.proficiencies.skills[skillName];
            const expert = !!character.proficiencies.expertise[skillName];
            const jack =
              (character.class.find((klass) => klass.name === "Bard")?.level ||
                0) > 1 || character.proficiencies.isJackOfAllTradesOverride;
            return (
              <ProficiencyDisplay
                key={skillName}
                field={FIELD.proficiencies}
                subField={`skills.${skillName}`}
                id={`${skillName}_proficiency`}
                proficient={proficient}
                expert={expert}
                jack={jack}
                transform={(proficient) =>
                  modifier(character.stats[statKey]) +
                  (expert
                    ? 2 * pb
                    : proficient
                    ? pb
                    : jack
                    ? Math.floor(pb / 2)
                    : 0)
                }
                text={skillName}
                subtext={`(${statKey})`}
                updateProficiency={createProficiencyUpdater(
                  FIELD.proficiencies,
                  `skills.${skillName}`
                )}
              />
            );
          }
        )}
        <b>Skills</b>
      </div>
    </div>
  );
}

function StatsAndSkills({ pb }: { pb: number }) {
  const { character } = useCharacter();
  if (!character) return <></>;
  return (
    <div className="row">
      <div className="column stat-display-container">
        {(Object.entries(character.stats) as Array<[StatKey, number]>).map(
          ([statKey, statVal]) => {
            const statName = STAT_NAMES[statKey];
            return (
              <StatDisplay
                field={FIELD.stats}
                subField={statKey}
                name={statName}
                value={statVal}
                key={statKey}
                statKey={statKey}
                editable
              />
            );
          }
        )}
      </div>
      <SkillsColumn pb={pb} />
    </div>
  );
}

export default function StatAndSkillPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
  const pb = getPB(character);
  const calculatePassivePerception = (wis: number) =>
    10 + modifier(wis) + (character.proficiencies.skills.Perception ? pb : 0);
  return (
    <div className="stat-and-skill-panel">
      <StatsAndSkills pb={pb} />
      <SingleValueDisplay
        name="Passive Wisdom (Perception)"
        field={FIELD.stats}
        subField="wis"
        transform={(wis) => calculatePassivePerception(wis)}
      />
      <MultiLineTextDisplay
        title="Other Proficiencies & Languages"
        field={FIELD.otherProficiencies}
      />
    </div>
  );
}
