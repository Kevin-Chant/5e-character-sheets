import React, { useEffect, useState } from "react";
import {
  Alignment,
  EDITABLE_FIELD_OPTIONAL_DATA,
  FIELD,
  OfficialClass,
  StatKey,
} from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import {
  DEFAULT_BACKGROUNDS,
  DEFAULT_DAMAGE_TYPES,
  DEFAULT_LANGUAGES,
  DEFAULT_WEAPONS,
  getOptionalInitializer,
} from "src/lib/rules";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { OptionsList } from "src/lib/types";
import Select from "src/components/select";

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
  const { character, dispatch } = useLoadedCharacter();
  const { saveData } = useSave();

  let currentValue =
    targetedField && character ? getFieldValue(targetedField, character) : "";
  if (subField) currentValue = traverse(subField, currentValue);
  // 0/""/false are real values, not gaps; only null/undefined fall back.
  if (currentValue == null && character) {
    currentValue = getOptionalInitializer(targetedField, subField, character);
  }

  // Local state lets the input clear to empty even when `setValue` declines
  // to persist an invalid required value.
  const [localValue, setLocalValue] = useState<string>(
    String(currentValue ?? ""),
  );
  useEffect(() => {
    setLocalValue(String(currentValue ?? ""));
  }, [currentValue]);

  if (!targetedField) return <></>;

  const setValue = (value: string) => {
    if (!value && !allowUndefined) return;
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

  const optionalData = EDITABLE_FIELD_OPTIONAL_DATA[targetedField];
  // Drop a trailing array index (e.g. "languages.3" -> "languages") from the title.
  const labelSubField = subField?.replace(/\.\d+$/, "");
  const heading =
    optionalData?.title ??
    humanize(targetedField) + (labelSubField ? ` (${labelSubField})` : "");
  const numberInvalid =
    modalType === "number" &&
    !allowUndefined &&
    (localValue.trim() === "" || isNaN(parseInt(localValue, 10)));

  let knownOptions: OptionsList | undefined;
  if (targetedField === FIELD.otherProficiencies) {
    const section = subField?.split(".")[0];
    if (section === "weapons") knownOptions = DEFAULT_WEAPONS;
    else if (section === "languages") knownOptions = DEFAULT_LANGUAGES;
  } else if (targetedField === FIELD.background) {
    knownOptions = DEFAULT_BACKGROUNDS;
  } else if (targetedField === FIELD.damageModifiers) {
    knownOptions = DEFAULT_DAMAGE_TYPES;
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
          <Select
            className="font-large"
            label="Alignment"
            autoFocus
            value={currentValue}
            options={Object.keys(Alignment)}
            onChange={setValue}
          />
        )}
        {modalType === StatKey && (
          <Select
            className="font-large"
            label="Ability"
            autoFocus
            value={currentValue}
            options={Object.keys(StatKey)}
            onChange={setValue}
          />
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
