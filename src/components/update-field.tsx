import React, { useEffect, useState } from "react";
import {
  Alignment,
  EDITABLE_FIELD_OPTIONAL_DATA,
  OfficialClass,
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
  let currentValue =
    targetedField && character ? getFieldValue(targetedField, character) : "";

  // Local state so the input can be freely edited (including cleared to empty)
  // even when `setValue` declines to persist an empty/invalid required value.
  const [localValue, setLocalValue] = useState<string>(currentValue ?? "");
  useEffect(() => {
    setLocalValue(currentValue ?? "");
  }, [currentValue]);

  if (!character || !targetedField) return <></>;

  if (subField) currentValue = traverse(subField, currentValue);
  if (!currentValue && OPTIONAL_FIELD_INITIALIZERS[targetedField]) {
    currentValue = OPTIONAL_FIELD_INITIALIZERS[targetedField]?.call(
      undefined,
      character,
      subField,
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
    dispatch(updateData(targetedField, { value: sanitizedValue }, subField));
  };

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
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
            value={localValue}
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
