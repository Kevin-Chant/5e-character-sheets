import { FIELD } from "src/lib/data/data-definitions";
import { Character } from "src/lib/types";

export type ACTION = "load_character" | "reset_character" | `update_${FIELD}`;

export type Action = {
  type: ACTION;
  payload: any;
  subField?: string;
};

export function loadFullCharacter(character: Character): Action {
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
  subField?: string
): Action {
  return {
    type: `update_${targetedField}`,
    payload: data,
    subField: subField,
  };
}
