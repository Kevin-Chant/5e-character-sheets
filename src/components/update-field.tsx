import React, { useEffect, useState } from "react";
import {
  Alignment,
  EDITABLE_FIELD_OPTIONAL_DATA,
  FIELD,
  OfficialClass,
  StatKey,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import {
  DEFAULT_BACKGROUNDS,
  DEFAULT_LANGUAGES,
  DEFAULT_WEAPONS,
  getOptionalInitializer,
} from "src/lib/rules";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { OptionsList } from "src/lib/types";

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

// "expendedHitDice" -> "Expended Hit Dice"; used as a fallback label when a
// field has no entry in EDITABLE_FIELD_OPTIONAL_DATA.
const humanize = (field: string) =>
  field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

export default function UpdateField({
  allowUndefined,
  modalType,
}: UpdateFieldProps) {
  const { targetedField, subField } = useTargetedField();
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  // Resolve the value currently persisted for this (field, subField), falling
  // back to the optional-field initializer when nothing is stored yet.
  let currentValue =
    targetedField && character ? getFieldValue(targetedField, character) : "";
  if (subField) currentValue = traverse(subField, currentValue);
  // Only genuinely-absent values fall back to the initializer — a stored 0,
  // "", or false is a real value the user set, not a gap to fill.
  if (currentValue == null && character) {
    currentValue = getOptionalInitializer(targetedField, subField, character);
  }

  // Local state so the input can be freely edited (including cleared to empty)
  // even when `setValue` declines to persist an empty/invalid required value.
  const [localValue, setLocalValue] = useState<string>(
    String(currentValue ?? ""),
  );
  useEffect(() => {
    setLocalValue(String(currentValue ?? ""));
  }, [currentValue]);

  if (!character || !targetedField) return <></>;

  const setValue = (value: string) => {
    if (!value && !allowUndefined) return;
    // Coerce/validate the raw input to the type this field expects before it
    // enters the character model; reject values that don't fit rather than
    // storing a mistyped (or out-of-enum) value.
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
    } else if (modalType === "boolean") {
      sanitizedValue = value === "true";
    } else if (modalType === Alignment) {
      if (!(value in Alignment)) return;
      sanitizedValue = value;
    } else if (modalType === StatKey) {
      if (!(value in StatKey)) return;
      sanitizedValue = value;
    } else {
      // "string" / "singleClass" / "spellcastingClass" — free-text values.
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
  // Drop a trailing array index (e.g. "languages.3" -> "languages") from the
  // title; the specific entry being edited isn't meaningful to the user.
  const labelSubField = subField?.replace(/\.\d+$/, "");
  const heading =
    optionalData?.title ??
    humanize(targetedField) + (labelSubField ? ` (${labelSubField})` : "");
  const numberInvalid =
    modalType === "number" &&
    !allowUndefined &&
    (localValue.trim() === "" || isNaN(parseInt(localValue, 10)));

  // Suggestions offered as a typeahead for free-text (string) fields; arbitrary
  // custom input is still accepted.
  let knownOptions: OptionsList | undefined;
  if (targetedField === FIELD.otherProficiencies) {
    const section = subField?.split(".")[0];
    if (section === "weapons") knownOptions = DEFAULT_WEAPONS;
    else if (section === "languages") knownOptions = DEFAULT_LANGUAGES;
  } else if (targetedField === FIELD.background) {
    knownOptions = DEFAULT_BACKGROUNDS;
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="column">
        <p className="font-large bold">{heading}</p>
        {optionalData?.hint && <i>{optionalData.hint}</i>}
        {modalType === "string" && knownOptions ? (
          <OptionOrCustomValue
            value={currentValue}
            setValue={setValue}
            options={knownOptions}
            customDefaultValue=""
            customInputType="text"
            customValueHelpText="Type to filter or enter a custom value"
            autoFocus
          />
        ) : (
          (modalType === "string" ||
            modalType === "number" ||
            modalType === "boolean") && (
            <input
              type={modalType}
              onChange={onChangeInput}
              value={localValue}
              autoFocus={true}
              onFocus={(e) => e.target.select()}
            ></input>
          )
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
        <button
          className="margin-small"
          onClick={saveData}
          disabled={numberInvalid}
          title={numberInvalid ? "Enter a valid number to save" : undefined}
        >
          Save
        </button>
      </div>
    </form>
  );
}
