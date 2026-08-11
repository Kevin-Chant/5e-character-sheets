import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt, clearAt, Cursor } from "src/lib/cursor";
import { Speeds } from "src/lib/types";
import { useSave } from "./modals/modal-container";
import { FaXmark } from "react-icons/fa6";
import Select from "src/components/select";

// The optional (non-walking) movement modes, in display order.
const EXTRA_MODES: Array<[keyof Speeds, string]> = [
  ["fly", "Fly"],
  ["swim", "Swim"],
  ["climb", "Climb"],
  ["burrow", "Burrow"],
];

// Walk is always shown; other movement modes are added on demand as
// removable rows.
export default function EditSpeeds() {
  const { character, dispatch } = useLoadedCharacter();
  const { saveData } = useSave();

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
              <FaXmark />
            </button>
          </div>
        </label>
      ))}
      {unused.length > 0 && (
        <span className="column">
          Add movement mode
          <Select
            label="Add movement mode"
            triggerLabel="Add speed…"
            value=""
            options={unused.map(([key, label]) => ({ value: key, label }))}
            onChange={(key) => {
              if (key) setMode(key as keyof Speeds, speeds.walk);
            }}
          />
        </span>
      )}
      <button className="btn-primary edit-save" onClick={() => saveData()}>
        Save
      </button>
    </form>
  );
}
