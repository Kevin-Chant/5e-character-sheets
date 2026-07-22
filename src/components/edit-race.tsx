import { FIELD, Size } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt, clearAt, Cursor } from "src/lib/cursor";
import { DEFAULT_RACES } from "src/lib/rules";
import { useSave } from "./modals/modal-container";
import OptionOrCustomValue from "./display/option-or-custom-value";

// Editor for the `race` identity object (name / subrace / size). The mechanical
// grants a race confers live in their own homes and are edited there — languages
// in Other Proficiencies, traits in Features, speeds in the Speed editor,
// darkvision in the Senses editor — not on the race.
export default function EditRace() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();
  if (!character) return <></>;

  const race = character.race;
  const racePath = charPath(FIELD.race);
  const set = <T,>(cursor: Cursor<T>, value: T) =>
    dispatch(updateAt(cursor, value));

  return (
    <form className="edit-race column" onSubmit={(e) => e.preventDefault()}>
      <label className="column">
        Race
        <OptionOrCustomValue
          value={race.name}
          setValue={(v: string) => set(racePath.k("name"), v)}
          options={DEFAULT_RACES}
          customDefaultValue=""
          customInputType="text"
          customValueHelpText="Type to filter or enter a custom race"
          autoFocus
        />
      </label>
      <label className="column">
        Subrace
        <input
          type="text"
          value={race.subrace ?? ""}
          onChange={(e) =>
            e.target.value
              ? set(racePath.k("subrace"), e.target.value)
              : dispatch(clearAt(racePath.k("subrace")))
          }
        />
      </label>
      <label className="column">
        Size
        <select
          value={race.size}
          onChange={(e) => set(racePath.k("size"), e.target.value as Size)}
        >
          {Object.values(Size).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button className="margin-small" onClick={() => saveData()}>
        Save
      </button>
    </form>
  );
}
