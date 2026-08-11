import React, { useEffect } from "react";
import { FIELD, StandardDie } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { getFieldValue } from "src/lib/fields";
import { getHitDice } from "src/lib/rules";
import { useSave } from "./modals/modal-container";
import { charPath, clearAt, updateAt } from "src/lib/cursor";

export default function EditHitDice() {
  const { character, dispatch } = useLoadedCharacter();
  const { saveData } = useSave();

  const totalCursor = charPath(FIELD.totalHitDice);
  const stored = getFieldValue(FIELD.totalHitDice, character);
  // Seed the override from computed hit dice via an effect — dispatching
  // during render triggers a React warning and can drop the write.
  const totalHitDice = stored ?? getHitDice(character);
  useEffect(() => {
    if (!stored) dispatch(updateAt(totalCursor, totalHitDice));
  }, [!stored]);

  const updateHitDice = (
    e: React.ChangeEvent<HTMLInputElement>,
    die: StandardDie,
  ) => {
    dispatch(updateAt(totalCursor.k(die), parseInt(e.target.value)));
  };

  const clearOverride = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData(e, clearAt(totalCursor));
  };

  return (
    <form>
      <div className="column">
        <table>
          <thead>
            <tr>
              <th>Die</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(StandardDie) as StandardDie[]).map((die) => {
              return (
                <tr key={die}>
                  <td>{die}</td>
                  <td>
                    <input
                      type="number"
                      value={totalHitDice[die] || 0}
                      onChange={(e) => {
                        updateHitDice(e, die);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row">
          <button className="margin-small" onClick={clearOverride}>
            Clear Override
          </button>
          <button className="btn-primary edit-save" onClick={saveData}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
