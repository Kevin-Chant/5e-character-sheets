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
  // A character with no stored override edits the value derived from their
  // class levels, so the modal seeds it. The seed is a *dispatch*, so it has to
  // happen in an effect: doing it inline updated the character context while
  // this component was still rendering, which React warns about and which can
  // drop the write depending on when the parent re-renders.
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
