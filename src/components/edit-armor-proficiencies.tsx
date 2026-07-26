import { ArmorType, FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt } from "src/lib/cursor";
import { useSave } from "./modals/modal-container";

export default function EditArmorProficiencies() {
  const { character, dispatch } = useLoadedCharacter();
  const { saveData } = useSave();

  const armorCursor = charPath(FIELD.otherProficiencies).k("armor");
  const armor = character.otherProficiencies.armor;

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="column">
        {Object.values(ArmorType).map((type) => (
          <label key={type} className="row space-between margin-small">
            <span>{type}</span>
            <input
              type="checkbox"
              checked={!!armor[type]}
              onChange={() =>
                dispatch(updateAt(armorCursor.k(type), !armor[type]))
              }
            />
          </label>
        ))}
        <button className="btn-primary edit-save" onClick={saveData}>
          Save
        </button>
      </div>
    </form>
  );
}
