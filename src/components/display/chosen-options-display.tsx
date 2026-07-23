import { FaPencil } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath } from "src/lib/cursor";
import {
  availableOptionGroups,
  chosenIn,
} from "src/lib/builder/chosen-options";
import ComponentWithPopover from "./component-with-popover";

// The options a character has picked from their class's closed lists, grouped
// by category with a "picked / allowed" count. Renders nothing at all until a
// class actually offers such a choice, so most sheets never see this section.
export default function ChosenOptionsDisplay() {
  const { character } = useCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const groups = availableOptionGroups(character);
  if (groups.length === 0) return <></>;

  return (
    <div className="column rounded-border-box chosen-options">
      {groups.map(({ group, known }) => {
        const picked = chosenIn(character, group.category);
        return (
          <div key={group.category} className="column chosen-option-group">
            <div className="row chosen-option-header">
              <b>{group.label}</b>
              <i
                className={`font-small nowrap ${
                  picked.length === known ? "muted" : "chosen-option-pending"
                }`}
              >
                {picked.length} / {known} known
              </i>
              {editMode && (
                <button
                  type="button"
                  aria-label={`Choose ${group.label}`}
                  title={`Choose ${group.label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    pushCursor(charPath(FIELD.chosenOptions));
                  }}
                >
                  <FaPencil />
                </button>
              )}
            </div>
            {picked.length === 0 ? (
              <i className="muted font-small">None chosen yet.</i>
            ) : (
              <div className="row chosen-option-list">
                {picked.map((option) =>
                  option.detail ? (
                    <ComponentWithPopover
                      key={option.name}
                      componentClass="rounded-border-box padding-small chosen-option"
                      componentChildren={<span>{option.name}</span>}
                      popoverChildren={<span>{option.detail}</span>}
                    />
                  ) : (
                    <div
                      key={option.name}
                      className="rounded-border-box padding-small chosen-option"
                    >
                      {option.name}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
      <b className="margin-large">Class Options</b>
    </div>
  );
}
