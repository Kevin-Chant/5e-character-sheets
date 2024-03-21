import { Character } from "src/lib/types";
import { setFieldValue } from "src/lib/utils";
import { Action } from "./actions";

export default function reducer(state: Character, action: Action) {
  // TODO: remove debug statement or turn into dev-only
  console.log("Dispatched action", action);
  if (action.type === "load_character") {
    return { ...action.payload };
  }
  // deep copy state
  const newState = JSON.parse(JSON.stringify(state));
  setFieldValue(
    action.type.replace("update_", ""),
    newState,
    action.payload.value
  );
  return newState;
}
