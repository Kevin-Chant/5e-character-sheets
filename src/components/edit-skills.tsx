import classNames from "classnames";
import { FaPencil } from "react-icons/fa6";
import { FIELD, SkillName, StatKey } from "src/lib/data/data-definitions";
import { charPath, clearAt, updateAt } from "src/lib/cursor";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { calculateCustomFormula, formatCustomFormula } from "src/lib/formula";
import {
  SKILL_SOURCE_STATS,
  getPB,
  hasJackOfAllTrades,
  modifier,
} from "src/lib/rules";

// The full modifier a skill contributes to a d20 roll — mirrors the sheet's
// per-row math so the modal shows the same number the player will roll.
function skillModifier(
  statMod: number,
  pb: number,
  proficient: boolean,
  expert: boolean,
  jack: boolean,
  bonus: number,
): number {
  const profBonus = expert
    ? 2 * pb
    : proficient
      ? pb
      : jack
        ? Math.floor(pb / 2)
        : 0;
  return statMod + profBonus + bonus;
}

type ProfState = "none" | "proficient" | "expert";

// One place to manage every skill: pick a proficiency state and edit an optional
// bonus formula. Replaces the per-row pencils that cluttered the Skills list on
// the sheet. Opened from the "Skills" heading (targeted field: proficiencies →
// "skills"); the bonus editor stacks the formula builder on top of this modal.
export default function EditSkills() {
  const { character, dispatch } = useCharacter();
  const { pushCursor } = useTargetedField();
  if (!character) return <></>;

  const pb = getPB(character);
  const jack = hasJackOfAllTrades(character);
  const profs = character.proficiencies;

  const setState = (skill: SkillName, state: ProfState) => {
    const skillCursor = charPath(FIELD.proficiencies).k("skills").k(skill);
    const expertiseCursor = charPath(FIELD.proficiencies)
      .k("expertise")
      .k(skill);
    dispatch(updateAt(skillCursor, state !== "none"));
    dispatch(updateAt(expertiseCursor, state === "expert"));
  };

  return (
    <div className="edit-skills">
      <p className="modal-hint">
        Set each skill&apos;s proficiency and, if you need it, a custom bonus
        (for feats, items, or situational modifiers).
      </p>
      <ul className="skill-edit-list">
        {(Object.entries(SKILL_SOURCE_STATS) as [SkillName, StatKey][]).map(
          ([skill, stat]) => {
            const proficient = !!profs.skills[skill];
            const expert = !!profs.expertise[skill];
            const state: ProfState = expert
              ? "expert"
              : proficient
                ? "proficient"
                : "none";
            const bonusFormula = profs.skillBonuses[skill];
            const bonus = bonusFormula
              ? calculateCustomFormula(bonusFormula, character)
              : 0;
            const total = skillModifier(
              modifier(character.stats[stat]),
              pb,
              proficient,
              expert,
              jack,
              bonus,
            );
            const bonusCursor = charPath(FIELD.proficiencies)
              .k("skillBonuses")
              .k(skill);
            return (
              <li key={skill} className="skill-edit-row">
                <div className="skill-edit-head">
                  <span className="skill-edit-name">{skill}</span>
                  <span className="skill-edit-meta">
                    {stat} · {total >= 0 ? `+${total}` : total}
                  </span>
                </div>
                <div className="skill-edit-controls">
                  <div
                    className="skill-prof-group"
                    role="group"
                    aria-label={`${skill} proficiency`}
                  >
                    {(
                      [
                        ["none", "None"],
                        ["proficient", "Proficient"],
                        ["expert", "Expertise"],
                      ] as [ProfState, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={classNames("skill-prof-btn", {
                          selected: state === value,
                        })}
                        aria-pressed={state === value}
                        onClick={() => setState(skill, value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="skill-bonus-cell">
                    <button
                      type="button"
                      className="formula-edit-button"
                      aria-label={`Edit ${skill} bonus`}
                      onClick={(e) => {
                        e.preventDefault();
                        pushCursor(bonusCursor);
                      }}
                    >
                      <span className="formula-preview">
                        {bonusFormula
                          ? formatCustomFormula(bonusFormula, character, false)
                          : "No bonus"}
                      </span>
                      <FaPencil />
                    </button>
                    {bonusFormula && (
                      <button
                        type="button"
                        className="btn-danger skill-bonus-clear"
                        aria-label={`Remove ${skill} bonus`}
                        onClick={(e) => {
                          e.preventDefault();
                          dispatch(clearAt(bonusCursor));
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          },
        )}
      </ul>
    </div>
  );
}
