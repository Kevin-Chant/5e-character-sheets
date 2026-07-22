import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";

// The Ammunition sub-section of Equipment: one row per pool (name + remaining
// count). The count is editable at all times — you spend ammo as you shoot, so
// it matters in play mode — while the name and which weapons a pool feeds are
// edited in the modal (edit mode only). Gated by the `trackAmmunition` setting
// at the call site; `ammunition` is the single source of truth for counts.
export default function AmmunitionDisplay() {
  const { character, dispatch } = useCharacter();
  const { editMode } = useEditMode();
  const { pushCursor, pushTargetedField } = useTargetedField();
  if (!character) return <></>;

  const ammo = character.ammunition;
  const path = charPath(FIELD.ammunition);

  const setCount = (index: number, value: number) =>
    dispatch(updateAt(path.at(index).k("count"), Math.max(0, value || 0)));
  const removeAmmo = (index: number) => {
    const next = structuredClone(ammo);
    next.splice(index, 1);
    dispatch(updateAt(path, next));
  };

  return (
    <div className="column ammunition-section">
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
            <input
              type="number"
              className="ammo-count"
              value={entry.count}
              min={0}
              onChange={(e) => setCount(index, Number(e.target.value))}
            />
            {editMode && (
              <button
                aria-label={`Remove ${entry.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  removeAmmo(index);
                }}
              >
                x
              </button>
            )}
          </span>
        </div>
      ))}
      <b className="pos-relative margin-large">
        Ammunition
        {editMode && (
          <button
            className="ammo-add"
            aria-label="Add ammunition"
            style={{
              position: "absolute",
              top: "-50%",
              right: "0px",
              transform: "translate(150%, 0%)",
            }}
            onClick={(e) => {
              e.preventDefault();
              pushTargetedField(FIELD.ammunition, "new");
            }}
          >
            +
          </button>
        )}
      </b>
    </div>
  );
}
