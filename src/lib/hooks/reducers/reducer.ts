import { Character } from "src/lib/types";
import { setFieldValue } from "src/lib/fields";
import { Action, actionFieldPath } from "./actions";

export default function reducer(
  state: Character | undefined,
  action: Action,
): Character | undefined {
  if (action.type === "load_character" || action.type === "replace_character") {
    return { ...action.payload };
  }
  if (action.type === "reset_character") {
    return undefined;
  }
  const newState = structuredClone(state);
  setFieldValue(actionFieldPath(action), newState, action.payload.value);
  return newState;
}
