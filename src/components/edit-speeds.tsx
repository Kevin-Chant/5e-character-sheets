import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt, clearAt, Cursor } from "src/lib/cursor";
import { Speeds } from "src/lib/types";
import { useSave } from "./modals/modal-container";

// The optional (non-walking) movement modes, in display order.
const EXTRA_MODES: Array<[keyof Speeds, string]> = [
  ["fly", "Fly"],
  ["swim", "Swim"],
  ["climb", "Climb"],
  ["burrow", "Burrow"],
];

// Editor for the character's movement speeds. Walk is always shown; the other
// modes are added on demand (each a removable row), so the modal stays a narrow
// single column instead of a four-wide grid.
export default function EditSpeeds() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();
  if (!character) return <></>;

  const speeds = character.speeds;
  const path = charPath(FIELD.speeds);
  const setMode = (key: keyof Speeds, value: number) =>
    dispatch(updateAt(path.k(key) as Cursor<number | undefined>, value));
  const removeMode = (key: keyof Speeds) =>
    dispatch(clearAt(path.k(key) as Cursor<number | undefined>));

  const present = EXTRA_MODES.filter(([key]) => speeds[key] !== undefined);
  const unused = EXTRA_MODES.filter(([key]) => speeds[key] === undefined);

  return (
    <form className="edit-speeds column" onSubmit={(e) => e.preventDefault()}>
      <label className="column">
        Walking speed (ft)
        <input
          type="number"
          value={speeds.walk}
          autoFocus
          onChange={(e) =>
            dispatch(updateAt(path.k("walk"), Number(e.target.value)))
          }
        />
      </label>
      {present.map(([key, label]) => (
        <label key={key} className="column">
          {label} speed (ft)
          <div className="row">
            <input
              type="number"
              value={speeds[key]}
              onChange={(e) => setMode(key, Number(e.target.value))}
            />
            <button
              type="button"
              aria-label={`Remove ${label} speed`}
              onClick={(e) => {
                e.preventDefault();
                removeMode(key);
              }}
            >
              x
            </button>
          </div>
        </label>
      ))}
      {unused.length > 0 && (
        <label className="column">
          Add movement mode
          <select
            value=""
            onChange={(e) => {
              const key = e.target.value as keyof Speeds;
              if (key) setMode(key, speeds.walk);
            }}
          >
            <option value="">Add speed…</option>
            {unused.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="margin-small" onClick={() => saveData()}>
        Save
      </button>
    </form>
  );
}
