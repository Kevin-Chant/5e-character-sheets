import { FIELD } from "src/lib/data/data-definitions";
import { Character } from "src/lib/types";
import { getFieldValue } from "src/lib/fields";

export type ACTION = "load_character" | "reset_character" | `update_${FIELD}`;

export type Action = {
  type: ACTION;
  payload: any;
  subField?: string;
};

// The dot-path an `update_*` action targets, e.g. "attacks.0.name".
export function actionFieldPath(action: Action): string {
  let field = action.type.replace("update_", "");
  if (action.subField) field += `.${action.subField}`;
  return field;
}

// The action that reverses `action`: same target, carrying the value that
// currently lives there. Relies on `update_*` actions fully specifying a
// field's value, so applying the inverse restores the prior state.
export function invertAction(character: Character, action: Action): Action {
  return {
    type: action.type,
    payload: { value: getFieldValue(actionFieldPath(action), character) },
    subField: action.subField,
  };
}

export function loadPersistedCharacter(character: Character): Action {
  return {
    type: "load_character",
    payload: character,
  };
}

export function resetCharacter(): Action {
  return {
    type: "reset_character",
    payload: undefined,
  };
}

export function updateData(
  targetedField: FIELD,
  data: any,
  subField?: string,
): Action {
  return {
    type: `update_${targetedField}`,
    payload: data,
    subField: subField,
  };
}
