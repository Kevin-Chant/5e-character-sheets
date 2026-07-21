import ProficiencyDisplay from "src/components/display/proficiency-display";
import SingleValueDisplay from "src/components/display/single-value-display";
import StatDisplay from "src/components/display/stat-display";
import { FIELD, SkillName, StatKey } from "src/lib/data/data-definitions";
import { charPath, updateAt } from "src/lib/cursor";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { calculateCustomFormula } from "src/lib/formula";
import {
  SKILL_SOURCE_STATS,
  STAT_NAMES,
  getPB,
  hasJackOfAllTrades,
  modifier,
} from "src/lib/rules";
import OtherProficienciesDisplay from "./display/other-proficiencies-display";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FaPencil } from "react-icons/fa6";

// The proficiency contribution to a d20 modifier: double PB for expertise, PB
// for proficiency, half PB (rounded down) for Jack of All Trades, else nothing.
function proficiencyBonus(
  pb: number,
  proficient: boolean,
  expert: boolean,
  jack: boolean,
): number {
  if (expert) return 2 * pb;
  if (proficient) return pb;
  if (jack) return Math.floor(pb / 2);
  return 0;
}

function SkillsColumn({ pb, jack }: { pb: number; jack: boolean }) {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  return (
    <div className="column">
      <SingleValueDisplay
        name="Inspiration"
        cursor={charPath(FIELD.inspiration)}
        editable
      />
      <SingleValueDisplay
        name="Proficiency Bonus"
        cursor={charPath(FIELD.pbOverride)}
        transform={calculateCustomFormula}
        editable
      />
      <div className="column rounded-border-box margin-medium">
        {(Object.entries(STAT_NAMES) as [StatKey, string][]).map(
          ([statKey, statName]) => {
            const proficient = !!character.proficiencies.savingThrows[statKey];
            const cursor = charPath(FIELD.proficiencies)
              .k("savingThrows")
              .k(statKey);
            return (
              <ProficiencyDisplay
                key={statKey}
                cursor={cursor}
                id={`${statKey}_save_proficiency`}
                proficient={proficient}
                expert={false}
                jack={false}
                transform={(proficient) =>
                  modifier(character.stats[statKey]) + (proficient ? pb : 0)
                }
                text={statName}
                rollLabel={`${statName} Save`}
                onToggle={() => dispatch(updateAt(cursor, !proficient))}
              />
            );
          },
        )}
        <b className="section-heading">Saving Throws</b>
      </div>

      <div className="column rounded-border-box margin-medium">
        {(Object.entries(SKILL_SOURCE_STATS) as [SkillName, StatKey][]).map(
          ([skillName, statKey]) => {
            const proficient = !!character.proficiencies.skills[skillName];
            const expert = !!character.proficiencies.expertise[skillName];
            const skillsCursor = charPath(FIELD.proficiencies)
              .k("skills")
              .k(skillName);
            const expertiseCursor = charPath(FIELD.proficiencies)
              .k("expertise")
              .k(skillName);
            const bonusFormula =
              character.proficiencies.skillBonuses[skillName];
            const bonus = bonusFormula
              ? calculateCustomFormula(bonusFormula, character)
              : 0;
            // Cycle none → proficient → expert → none, keeping expertise ⊆
            // proficiency so an invalid combo can't be reached from the UI.
            const cycle = () => {
              if (expert) {
                dispatch(updateAt(skillsCursor, false));
                dispatch(updateAt(expertiseCursor, false));
              } else if (proficient) {
                dispatch(updateAt(expertiseCursor, true));
              } else {
                dispatch(updateAt(skillsCursor, true));
              }
            };
            return (
              <ProficiencyDisplay
                key={skillName}
                cursor={skillsCursor}
                id={`${skillName}_proficiency`}
                proficient={proficient}
                expert={expert}
                jack={jack}
                transform={() =>
                  modifier(character.stats[statKey]) +
                  proficiencyBonus(pb, proficient, expert, jack) +
                  bonus
                }
                text={skillName}
                subtext={`(${statKey})`}
                rollLabel={skillName}
                onToggle={cycle}
              />
            );
          },
        )}
        {editMode ? (
          <button
            type="button"
            className="section-heading section-heading-edit"
            aria-label="Edit skills"
            onClick={() =>
              pushCursor(charPath(FIELD.proficiencies).k("skills"))
            }
          >
            Skills <FaPencil />
          </button>
        ) : (
          <b className="section-heading">Skills</b>
        )}
      </div>
    </div>
  );
}

function StatsAndSkills({ pb, jack }: { pb: number; jack: boolean }) {
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
                cursor={charPath(FIELD.stats).k(statKey)}
                name={statName}
                value={statVal}
                key={statKey}
                statKey={statKey}
                editable
              />
            );
          },
        )}
      </div>
      <SkillsColumn pb={pb} jack={jack} />
    </div>
  );
}

export default function StatAndSkillPanel() {
  const { character } = useCharacter();
  if (!character) return <></>;
  const pb = getPB(character);
  const jack = hasJackOfAllTrades(character);
  return (
    <div className="stat-and-skill-panel">
      <StatsAndSkills pb={pb} jack={jack} />
      {/* Optional override formula; when unset, the SingleValueDisplay falls back
          to the computed default (getPassivePerceptionFormula). Editable so a
          player can set a passive-only adjustment (e.g. Observant's +5). */}
      <SingleValueDisplay
        name="Passive Wisdom (Perception)"
        cursor={charPath(FIELD.passivePerception)}
        transform={calculateCustomFormula}
        editable
      />
      <OtherProficienciesDisplay />
    </div>
  );
}
