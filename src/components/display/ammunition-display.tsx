import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import StepperInput from "../stepper-input";
import { FaXmark } from "react-icons/fa6";

// Ammunition sub-section: one row per pool (name + remaining count). Count is
// editable in play mode too; name and weapon links are edit-mode only.
export default function AmmunitionDisplay() {
  const { character, dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();
  const { pushCursor, pushTargetedField } = useTargetedField();

  const ammo = character.ammunition;
  const path = charPath(FIELD.ammunition);

  if (ammo.length === 0 && !editMode) return <></>;

  const setCount = (index: number, value: number) =>
    dispatch(updateAt(path.at(index).k("count"), Math.max(0, value || 0)));
  const removeAmmo = (index: number) => {
    const next = structuredClone(ammo);
    next.splice(index, 1);
    dispatch(updateAt(path, next));
  };

  return (
    <div className="column equipment-subsection ammunition-section">
      {ammo.map((entry, index) => (
        <div className="row space-between ammo-row" key={entry.id}>
          {editMode ? (
            <button
              className="ammo-name-edit"
              onClick={(e) => {
                e.preventDefault();
                pushCursor(path.at(index));
              }}
            >
              {entry.name}
            </button>
          ) : (
            <span className="ammo-name">{entry.name}</span>
          )}
          <span className="flex ammo-controls">
            <StepperInput
              value={entry.count}
              min={0}
              ariaLabel={`${entry.name} count`}
              onChange={(value) => setCount(index, value)}
            />
            {editMode && (
              <button
                className="row-remove"
                aria-label={`Remove ${entry.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  removeAmmo(index);
                }}
              >
                <FaXmark />
              </button>
            )}
          </span>
        </div>
      ))}
      <div className="row equipment-subheading">
        <span className="section-heading-with-add">
          <b className="section-heading">Ammunition</b>
          {editMode && (
            <button
              className="add-btn"
              aria-label="Add ammunition"
              onClick={(e) => {
                e.preventDefault();
                pushTargetedField(FIELD.ammunition, "new");
              }}
            >
              +
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
