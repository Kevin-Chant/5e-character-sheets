import React from "react";
import { FIELD, StandardDie } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { getFieldValue } from "src/lib/fields";
import { getHitDice } from "src/lib/rules";
import { useSave } from "./modals/modal-container";
import { charPath, clearAt, updateAt } from "src/lib/cursor";

export default function EditHitDice() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character) return <></>;

  const totalCursor = charPath(FIELD.totalHitDice);
  let totalHitDice = getFieldValue(FIELD.totalHitDice, character);
  if (!totalHitDice) {
    totalHitDice = getHitDice(character);
    dispatch(updateAt(totalCursor, totalHitDice));
  }

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
          <button className="margin-small" onClick={saveData}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
