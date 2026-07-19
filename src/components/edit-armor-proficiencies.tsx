import { ArmorType, FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { charPath, updateAt } from "src/lib/cursor";
import { useSave } from "./modals/modal-container";

export default function EditArmorProficiencies() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character) return <></>;
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
        <button className="margin-small" onClick={saveData}>
          Save
        </button>
      </div>
    </form>
  );
}
