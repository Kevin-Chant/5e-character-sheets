import { Character } from "src/lib/types";
import { setFieldValue } from "src/lib/fields";
import { Action, actionFieldPath } from "./actions";

export default function reducer(
  state: Character | undefined,
  action: Action,
): Character | undefined {
  if (action.type === "load_character" || action.type === "replace_character") {
    // A deep copy, not a spread: the payload is often an entry in a datastore
    // cache (the reactive character list, Drive's read-through cache), and a
    // shallow copy would leave every nested object shared with it — one
    // in-place mutation away from silently corrupting the cached copy.
    return structuredClone(action.payload);
  }
  if (action.type === "reset_character") {
    return undefined;
  }
  const newState = structuredClone(state);
  setFieldValue(actionFieldPath(action), newState, action.payload.value);
  return newState;
}
