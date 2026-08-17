import { FaPencil } from "react-icons/fa6";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { FIELD } from "src/lib/data/data-definitions";
import { charPath } from "src/lib/cursor";
import {
  availableOptionGroups,
  chosenIn,
} from "src/lib/builder/chosen-options";
import ComponentWithPopover from "./component-with-popover";

// Options picked from a class's closed lists, grouped with a "picked / allowed" count.
export default function ChosenOptionsDisplay() {
  const { character } = useLoadedCharacter();
  const { pushCursor } = useTargetedField();
  const { editMode } = useEditMode();

  const groups = availableOptionGroups(character);
  if (groups.length === 0) return <></>;

  return (
    <div className="column rounded-border-box chosen-options">
      {groups.map(({ group, known, active }) => {
        const picked = chosenIn(character, group.category);
        const activeCount = picked.filter((o) => o.active).length;
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
                {active !== undefined && `, ${activeCount} / ${active} infused`}
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
                {picked.map((option, nth) => {
                  const item = option.itemId
                    ? character.equipment.find((i) => i.id === option.itemId)
                    : undefined;
                  const label = (
                    <span>
                      {option.name}
                      {item && (
                        <i className="font-small"> · {item.text.title}</i>
                      )}
                    </span>
                  );
                  // An active limit makes "known but not in force" a real
                  // state, so an inactive pick reads as dormant.
                  const cls = `rounded-border-box padding-small chosen-option${
                    active !== undefined && !option.active ? " muted" : ""
                  }`;
                  return option.detail ? (
                    <ComponentWithPopover
                      key={nth}
                      componentClass={cls}
                      componentChildren={label}
                      popoverChildren={<span>{option.detail}</span>}
                    />
                  ) : (
                    <div key={nth} className={cls}>
                      {label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <b className="section-heading margin-large">Class Options</b>
    </div>
  );
}
