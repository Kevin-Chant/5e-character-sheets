import React, { useEffect, useState } from "react";
import {
  Alignment,
  EDITABLE_FIELD_OPTIONAL_DATA,
  OfficialClass,
  STANDARD_EDITABLE_FIELD_TYPES,
  StatKey,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import {
  getFieldValue,
  traverse,
  OPTIONAL_FIELD_INITIALIZERS,
} from "src/lib/utils";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import OptionOrCustomValue from "./display/option-or-custom-value";

export interface UpdateFieldProps {
  allowUndefined?: boolean;
  modalType:
    | "string"
    | "number"
    | "boolean"
    | "singleClass"
    | "spellcastingClass"
    | typeof Alignment
    | typeof StatKey;
}

export default function UpdateField({
  allowUndefined,
  modalType,
}: UpdateFieldProps) {
  const { targetedField, subField } = useTargetedField();
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character || !targetedField) return <></>;

  let currentValue = getFieldValue(targetedField, character);
  if (subField) currentValue = traverse(subField, currentValue);
  if (!currentValue && OPTIONAL_FIELD_INITIALIZERS[targetedField]) {
    currentValue = OPTIONAL_FIELD_INITIALIZERS[targetedField]?.call(
      undefined,
      character,
      subField
    );
  }

  const setValue = (value: string) => {
    if (!value && !allowUndefined) return;
    // TODO: validate new data matches expected type
    let sanitizedValue: any;
    if (modalType === "number") {
      sanitizedValue = parseInt(value);
      if (isNaN(sanitizedValue)) {
        if (allowUndefined) {
          sanitizedValue = undefined;
        } else {
          return;
        }
      }
    } else {
      sanitizedValue = value;
    }
    dispatch(updateData(targetedField, { value }, subField));
  };

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const onChangeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value);
  };

  const optionalData = EDITABLE_FIELD_OPTIONAL_DATA[targetedField];
  return (
    <form>
      <div className="column">
        {optionalData && (
          <>
            <p className="font-large bold">{optionalData.title}</p>
            <i>{optionalData.hint}</i>
          </>
        )}
        {(modalType === "string" ||
          modalType === "number" ||
          modalType === "boolean") && (
          <input
            type={modalType}
            onChange={onChangeInput}
            value={currentValue}
            autoFocus={true}
            onFocus={(e) => e.target.select()}
          ></input>
        )}
        {modalType === "singleClass" && (
          <OptionOrCustomValue
            value={currentValue}
            setValue={setValue}
            options={Object.keys(OfficialClass)}
            customDefaultValue={"Homebrew Class"}
            customInputType="text"
            customValueHelpText="Custom class:"
          />
        )}
        {/* TODO: make this into general enum? */}
        {modalType === Alignment && (
          <select
            className="font-large"
            value={currentValue}
            onChange={onChangeSelect}
            autoFocus={true}
          >
            {Object.keys(Alignment).map((option) => {
              return (
                <option key={option} value={option}>
                  {option}
                </option>
              );
            })}
          </select>
        )}
        {modalType === StatKey && (
          <select
            className="font-large"
            value={currentValue}
            onChange={onChangeSelect}
            autoFocus={true}
          >
            {Object.keys(StatKey).map((option) => {
              return (
                <option key={option} value={option}>
                  {option}
                </option>
              );
            })}
          </select>
        )}
        <button className="margin-small" onClick={saveData}>
          Save
        </button>
      </div>
    </form>
  );
}
