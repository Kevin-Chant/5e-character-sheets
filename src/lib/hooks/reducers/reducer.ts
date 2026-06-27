import { Character } from "src/lib/types";
import { setFieldValue } from "src/lib/utils";
import { Action, actionFieldPath } from "./actions";

export default function reducer(state: Character, action: Action) {
  if (action.type === "load_character") {
    return { ...action.payload };
  }
  if (action.type === "reset_character") {
    return undefined;
  }
  // deep copy state
  const newState = JSON.parse(JSON.stringify(state));
  setFieldValue(actionFieldPath(action), newState, action.payload.value);
  return newState;
}
