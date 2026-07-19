import { FIELD } from "src/lib/data/data-definitions";
import { Character } from "src/lib/types";
import { getFieldValue } from "src/lib/fields";

export type ACTION = "load_character" | "reset_character" | `update_${FIELD}`;

// `load_character` carries a bare Character (the reducer spreads it); `update_*`
// carries a `{ value }` wrapper plus a dot-path `subField`; `reset_character`
// carries nothing. Discriminating on `type` lets the reducer and the path
// helpers narrow to the update variant instead of trusting `any`.
export type UpdateAction = {
  type: `update_${FIELD}`;
  payload: { value: unknown };
  subField?: string;
};

export type Action =
  | { type: "load_character"; payload: Character }
  | { type: "reset_character"; payload?: undefined }
  | UpdateAction;

export function isUpdateAction(action: Action): action is UpdateAction {
  return action.type !== "load_character" && action.type !== "reset_character";
}

// The dot-path an `update_*` action targets, e.g. "attacks.0.name".
export function actionFieldPath(action: UpdateAction): string {
  let field: string = action.type.replace("update_", "");
  if (action.subField) field += `.${action.subField}`;
  return field;
}

// The action that reverses `action`: same target, carrying the value that
// currently lives there. Relies on `update_*` actions fully specifying a
// field's value, so applying the inverse restores the prior state.
export function invertAction(
  character: Character,
  action: UpdateAction,
): UpdateAction {
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
  data: { value: unknown },
  subField?: string,
): UpdateAction {
  return {
    type: `update_${targetedField}`,
    payload: data,
    subField: subField,
  };
}
