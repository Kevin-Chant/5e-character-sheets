import { without } from "lodash";
import React, { useEffect, useState } from "react";
import {
  FIELD,
  OfficialClass,
  OfficialSubclasses,
  StandardDie,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { HitDice } from "src/lib/types";
import { getFieldValue, getHitDice } from "src/lib/utils";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";

export default function EditHitDice() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character) return <></>;

  let totalHitDice = getFieldValue(FIELD.totalHitDice, character);
  if (!totalHitDice) {
    totalHitDice = getHitDice(character);
    dispatch(updateData(FIELD.totalHitDice, { value: totalHitDice }));
  }

  const updateHitDice = (
    e: React.ChangeEvent<HTMLInputElement>,
    die: StandardDie
  ) => {
    dispatch(
      updateData(
        FIELD.totalHitDice,
        {
          value: parseInt(e.target.value),
        },
        die
      )
    );
  };

  const clearOverride = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData(e, updateData(FIELD.totalHitDice, { value: undefined }));
  };

  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Override Hit Dice</b>
        </div>
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
