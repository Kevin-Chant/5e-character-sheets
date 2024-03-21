import ProficiencyDisplay from "src/components/display/proficiency-display";
import SingleValueDisplay from "src/components/display/single-value-display";
import StatDisplay from "src/components/display/stat-display";
import { SkillName, StatKey } from "src/lib/data/data-definitions";
import { FIELD, updateData } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { SKILL_SOURCE_STATS, STAT_NAMES, getPB, modifier } from "src/lib/utils";
import MultiLineTextDisplay from "./display/multi-line-text-display";

function SkillsColumn({ pb }: { pb: number }) {
  const { character, dispatch } = useCharacter();
  if (!character) return <></>;

  const createProficiencyUpdater = (field: FIELD) => {
    return (value: boolean) => {
      dispatch(updateData(field, { value: value }));
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
        transform={(pbOverride) => pbOverride || getPB(character)}
        editable
      />
      <div className="column rounded-border-box margin-medium">
        {(Object.entries(STAT_NAMES) as [StatKey, string][]).map(
          ([statKey, statName]) => {
            const proficient = !!character.proficiencies.savingThrows[statKey];
            return (
              <ProficiencyDisplay
                key={statKey}
                field={`proficiencies.savingThrows.${statKey}`}
                id={`${statKey}_save_proficiency`}
                proficient={proficient}
                transform={(proficient) =>
                  modifier(character.stats[statKey]) + (proficient ? pb : 0)
                }
                text={statName}
                updateProficiency={createProficiencyUpdater(
                  FIELD[`proficiencies.savingThrows.${statKey}`]
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
            // TODO: handle expertise and jack of all trades
            const proficient = !!character.proficiencies.skills[skillName];
            return (
              <ProficiencyDisplay
                key={skillName}
                field={`proficiencies.skills.${skillName}`}
                id={`${skillName}_proficiency`}
                proficient={proficient}
                transform={(proficient) =>
                  modifier(character.stats[statKey]) + (proficient ? pb : 0)
                }
                text={skillName}
                subtext={`(${statKey})`}
                updateProficiency={createProficiencyUpdater(
                  FIELD[`proficiencies.skills.${skillName}`]
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
                field={FIELD[`stats.${statKey}`]}
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
        field={FIELD["stats.wis"]}
        transform={(wis) => calculatePassivePerception(wis)}
      />
      <MultiLineTextDisplay
        title="Other Proficiencies & Languages"
        field={FIELD.otherProficiencies}
      />
    </div>
  );
}
