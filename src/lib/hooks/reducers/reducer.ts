import { Character } from "src/lib/types";
import { setFieldValue, traverse } from "src/lib/utils";
import { Action } from "./actions";

export default function reducer(state: Character, action: Action) {
  // TODO: remove debug statement or turn into dev-only
  console.log("Dispatched action", action);
  if (action.type === "load_character") {
    return { ...action.payload };
  }
  if (action.type === "reset_character") {
    return undefined;
  }
  // deep copy state
  const newState = JSON.parse(JSON.stringify(state));
  let field = action.type.replace("update_", "");
  if (action.subField) {
    field += `.${action.subField}`;
  }
  setFieldValue(field, newState, action.payload.value);
  return newState;
}
