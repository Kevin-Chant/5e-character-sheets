import classNames from "classnames";
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
import { Attack, AttackTag, CustomFormula, SaveEffect } from "src/lib/types";
import Select from "src/components/select";

// Weapon properties the roll dialog reads to decide which features apply
// (see `mechanics/conditions.ts`). No tags selected means "unknown", not "none".
const TAG_LABELS: [AttackTag, string][] = [
  ["melee", "Melee"],
  ["ranged", "Ranged"],
  ["thrown", "Thrown"],
  ["finesse", "Finesse"],
  ["two-handed", "Two-handed"],
  ["versatile", "Versatile"],
  ["heavy", "Heavy"],
  ["light", "Light"],
  ["reach", "Reach"],
  ["loading", "Loading"],
  ["ammunition", "Ammunition"],
];

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

  // subField is a bare index (guarded above), so this points at a single Attack.
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

  // Switching resolution mode clears the other side, so only one is ever set.
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
            dc: saveDcFormula(StatKey.con),
            stat: StatKey.dex,
            onSuccess: "half",
          } satisfies SaveEffect),
        );
    }
  };

  // Whole-value update, per the reducer's convention.
  const updateSave = (patch: Partial<SaveEffect>) => {
    if (!attack.save) return;
    dispatch(updateAt(attackCursor.k("save"), { ...attack.save, ...patch }));
  };

  const editFormula = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    pushCursor(attackCursor.k("formula"));
  };

  // Rebuilds the whole WeaponRange; clears it when normal is blank.
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

  // Emptying the list clears the field entirely rather than storing [], so
  // "no tags" and "unknown" stay the same state.
  const toggleTag = (tag: AttackTag) => {
    const current: AttackTag[] = attack.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    dispatch(updateAt(attackCursor.k("tags"), next.length ? next : undefined));
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
      <div className="field">
        <span className="field-label">Resolved by</span>
        <Select
          label="Resolved by"
          value={attack.save ? "save" : "toHit"}
          options={[
            { value: "toHit", label: "Attack roll", hint: "You roll to hit" },
            { value: "save", label: "Saving throw", hint: "The target rolls" },
          ]}
          onChange={(value) => setResolution(value as "toHit" | "save")}
        />
      </div>
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
          <div className="field">
            <span className="field-label">Target rolls</span>
            <Select
              label="Which save the target rolls"
              placeholder="(varies)"
              clearable
              clearLabel="(varies)"
              value={attack.save.stat ?? ""}
              options={Object.values(StatKey).map((stat) => ({
                value: stat,
                label: STAT_NAMES[stat],
              }))}
              onChange={(value) =>
                updateSave({
                  stat: (value || undefined) as StatKey | undefined,
                })
              }
            />
          </div>
          <div className="field">
            <span className="field-label">On a success</span>
            <Select
              label="What a successful save does"
              value={attack.save.onSuccess ?? ""}
              options={[
                { value: "half", label: "Half damage" },
                { value: "none", label: "No damage" },
                { value: "", label: "No damage effect" },
              ]}
              onChange={(value) =>
                updateSave({
                  onSuccess: (value || undefined) as
                    | "half"
                    | "none"
                    | undefined,
                })
              }
            />
          </div>
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
      <fieldset className="attack-tags">
        <legend className="field-label">Weapon properties</legend>
        <p className="field-help">
          Used to work out which of your features apply to this attack — Archery
          on a ranged weapon, Rage on a melee Strength hit. Leave blank and
          you&apos;ll be asked each time instead.
        </p>
        <div className="builder-chips">
          {TAG_LABELS.map(([tag, label]) => (
            <button
              key={tag}
              type="button"
              className={classNames("builder-chip", {
                selected: attack.tags?.includes(tag),
              })}
              aria-pressed={!!attack.tags?.includes(tag)}
              onClick={(e) => {
                e.preventDefault();
                toggleTag(tag);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="btn-primary edit-save" onClick={onSubmit}>
        Save
      </button>
    </form>
  );
}
