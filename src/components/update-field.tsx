import React, { useEffect, useState } from "react";
import {
  Alignment,
  STANDARD_EDITABLE_FIELD_TYPES,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/utils";

export interface UpdateFieldProps {
  onSubmit: (data: any) => void;
}

export default function UpdateField(props: UpdateFieldProps) {
  const { targetedField } = useTargetedField();
  const { character } = useCharacter();

  const [value, setValue] = useState<string>("");
  useEffect(() => {
    if (character && targetedField) {
      setValue(getFieldValue(targetedField, character));
    }
  }, [character, targetedField]);

  if (!character || !targetedField) return <></>;

  const fieldType = traverse(targetedField, STANDARD_EDITABLE_FIELD_TYPES);

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // TODO: allow optional fields to have falsy value
    if (!value) return;
    // TODO: validate new data matches expected type
    let sanitizedValue: any;
    if (fieldType === "number") {
      sanitizedValue = parseInt(value);
      if (isNaN(sanitizedValue)) {
        sanitizedValue = undefined;
      }
    } else {
      sanitizedValue = value;
    }
    props.onSubmit({ value: sanitizedValue });
  };

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const onChangeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value);
  };

  return (
    <form>
      <div className="column">
        {(fieldType === "string" ||
          fieldType === "number" ||
          fieldType === "boolean") && (
          <input
            type={fieldType}
            onChange={onChangeInput}
            value={value}
            autoFocus={true}
          ></input>
        )}
        {fieldType === Alignment && (
          <select
            className="font-large"
            value={value}
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
        <button className="margin-small" onClick={onSubmit}>
          Save
        </button>
      </div>
    </form>
  );
}
