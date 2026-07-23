import React from "react";
import { FIELD, Operation, StatKey } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { STAT_NAMES, saveDcFormula } from "src/lib/rules";

import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  formatCustomFormula,
  formatCustomFormulaWithDamage,
} from "src/lib/formula";
import { getFieldValue } from "src/lib/fields";
import { FaPencil } from "react-icons/fa6";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import { Attack, CustomFormula, SaveEffect } from "src/lib/types";

// What switching an attack back to "to hit" seeds when it has no bonus yet —
// the same STR + proficiency a melee weapon preset builds.
const DEFAULT_TO_HIT: CustomFormula = {
  operation: Operation.addition,
  operands: [StatKey.str, "proficiencyBonus"],
};

export default function EditAttack() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (
    !character ||
    !targetedField ||
    !subField ||
    subField.split(".").length > 1
  )
    return <></>;

  // Re-enter the typed world from the string stack: the modal knows it points at
  // a single Attack (bare index subField, guarded above).
  const attackCursor = fromStack<Attack>(targetedField, subField);
  const attack = getFieldValue(FIELD.attacks, character)[subField];

  const updateName = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    dispatch(updateAt(attackCursor.k("name"), e.target.value));
  };

  const editBonus = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(attackCursor.k("bonus"));
  };

  // An attack resolves one of two ways: the character rolls to hit, or the
  // target rolls to avoid. Switching clears the other side rather than leaving
  // both set, so the sheet shows exactly one number per attack.
  const setResolution = (mode: "toHit" | "save") => {
    if (mode === "toHit") {
      dispatch(updateAt(attackCursor.k("save"), undefined));
      if (attack.bonus === undefined)
        dispatch(updateAt(attackCursor.k("bonus"), DEFAULT_TO_HIT));
    } else {
      dispatch(updateAt(attackCursor.k("bonus"), undefined));
      if (!attack.save)
        dispatch(
          updateAt(attackCursor.k("save"), {
            // Seeded like every other DC on the sheet — DEX is far and away the
            // most common save for a damaging effect.
            dc: saveDcFormula(StatKey.con),
            stat: StatKey.dex,
            onSuccess: "half",
          } satisfies SaveEffect),
        );
    }
  };

  // Whole-value updates, per the reducer's "an update carries the field's whole
  // value" rule — so undo/redo and live-sync replay keep working.
  const updateSave = (patch: Partial<SaveEffect>) => {
    if (!attack.save) return;
    dispatch(updateAt(attackCursor.k("save"), { ...attack.save, ...patch }));
  };

  const editFormula = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(attackCursor.k("formula"));
  };

  // Range is optional. Editing normal/long rebuilds the whole WeaponRange (or
  // clears it when normal is blank), keeping the "whole value per update" rule.
  const setRange = (normal: string, long: string) => {
    const normalNum = normal === "" ? undefined : Number(normal);
    const longNum = long === "" ? undefined : Number(long);
    const value =
      normalNum === undefined
        ? undefined
        : {
            normal: normalNum,
            ...(longNum === undefined ? {} : { long: longNum }),
          };
    dispatch(updateAt(attackCursor.k("range"), value));
  };

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData();
  };

  return (
    <form className="edit-attack">
      <label className="field">
        <span className="field-label">Attack name</span>
        <input
          type="text"
          value={attack.name}
          onChange={updateName}
          placeholder="e.g. Greatsword"
          // Keep password managers off this free-text "Name" field.
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
        />
      </label>
      <label className="field">
        <span className="field-label">Resolved by</span>
        <select
          value={attack.save ? "save" : "toHit"}
          onChange={(e) => setResolution(e.target.value as "toHit" | "save")}
        >
          <option value="toHit">Attack roll (you roll to hit)</option>
          <option value="save">Saving throw (the target rolls)</option>
        </select>
      </label>
      <div className="formula-field-grid">
        {attack.bonus !== undefined && (
          <div className="field">
            <span className="field-label">To-hit bonus</span>
            <button className="formula-edit-button" onClick={editBonus}>
              <span className="formula-preview">
                {formatCustomFormula(attack.bonus, character, false)}
              </span>
              <FaPencil />
            </button>
          </div>
        )}
        <div className="field">
          <span className="field-label">Damage on hit</span>
          <button className="formula-edit-button" onClick={editFormula}>
            <span className="formula-preview">
              {formatCustomFormulaWithDamage(attack.formula, character, false)}
            </span>
            <FaPencil />
          </button>
        </div>
      </div>
      {attack.save && (
        <fieldset className="attack-save">
          <legend className="field-label">Saving throw</legend>
          <div className="field">
            <span className="field-label">DC</span>
            <button
              className="formula-edit-button"
              onClick={(e) => {
                e.preventDefault();
                pushCursor(attackCursor.k("save").k("dc"));
              }}
            >
              <span className="formula-preview">
                {formatCustomFormula(attack.save.dc, character, false)}
              </span>
              <FaPencil />
            </button>
          </div>
          <label className="field">
            <span className="field-label">Target rolls</span>
            <select
              value={attack.save.stat ?? ""}
              onChange={(e) =>
                updateSave({
                  stat: (e.target.value || undefined) as StatKey | undefined,
                })
              }
            >
              <option value="">(varies)</option>
              {Object.values(StatKey).map((stat) => (
                <option key={stat} value={stat}>
                  {STAT_NAMES[stat]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">On a success</span>
            <select
              value={attack.save.onSuccess ?? ""}
              onChange={(e) =>
                updateSave({
                  onSuccess: (e.target.value || undefined) as
                    | "half"
                    | "none"
                    | undefined,
                })
              }
            >
              <option value="half">Half damage</option>
              <option value="none">No damage</option>
              <option value="">No damage effect</option>
            </select>
          </label>
          <label className="field attack-save-note">
            <span className="field-label">Note (optional)</span>
            <input
              type="text"
              value={attack.save.note ?? ""}
              placeholder="e.g. and is knocked prone"
              onChange={(e) =>
                updateSave({ note: e.target.value || undefined })
              }
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
            />
          </label>
        </fieldset>
      )}
      <fieldset className="attack-range">
        <legend className="field-label">Range (ft, optional)</legend>
        <label className="field">
          <span className="field-label">Normal</span>
          <input
            type="number"
            value={attack.range?.normal ?? ""}
            placeholder="—"
            onChange={(e) =>
              setRange(e.target.value, String(attack.range?.long ?? ""))
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Long</span>
          <input
            type="number"
            value={attack.range?.long ?? ""}
            placeholder="—"
            disabled={attack.range?.normal === undefined}
            onChange={(e) =>
              setRange(String(attack.range?.normal ?? ""), e.target.value)
            }
          />
        </label>
      </fieldset>
      <button className="btn-primary" onClick={onSubmit}>
        Save
      </button>
    </form>
  );
}
