import classNames from "classnames";
import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, clearAt, Cursor } from "src/lib/cursor";
import { Senses } from "src/lib/types";

const SENSES: Array<[keyof Senses, string]> = [
  ["darkvision", "Darkvision"],
  ["blindsight", "Blindsight"],
  ["tremorsense", "Tremorsense"],
  ["truesight", "Truesight"],
];

// One row per sense the character has, plus a "+" to add an unused one.
export default function SensesDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();
  const { pushCursor, pushTargetedField } = useTargetedField();

  const senses = character.senses;
  const path = charPath(FIELD.senses);
  const present = SENSES.filter(([key]) => senses[key] !== undefined);
  const anyUnused = SENSES.some(([key]) => senses[key] === undefined);

  const editSense = (key: keyof Senses) => pushCursor(path.k(key));
  const removeSense = (key: keyof Senses) =>
    dispatch(clearAt(path.k(key) as Cursor<number | undefined>));

  if (present.length === 0 && !editMode) return <></>;

  return (
    <div
      className={classNames("column rounded-border-box other-proficiencies", {
        "section-empty": present.length === 0,
      })}
    >
      {present.map(([key, label]) => (
        <div className="prof-row" key={key}>
          <div className="prof-label">{label}</div>
          <div className="prof-values">
            <span className="prof-chip">
              <button
                className="prof-chip-label"
                onClick={(e) => {
                  e.preventDefault();
                  editSense(key);
                }}
              >
                {senses[key]} ft
              </button>
              {editMode && (
                <button
                  className="prof-chip-remove"
                  aria-label={`Remove ${label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeSense(key);
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </div>
        </div>
      ))}
      <div className="prof-title senses-title">
        Senses
        {editMode && anyUnused && (
          <button
            className="prof-add senses-add"
            aria-label="Add sense"
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(FIELD.senses, "new");
            }}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
