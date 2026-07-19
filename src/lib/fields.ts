import Ajv from "ajv";
import { Character } from "src/lib/types";
import * as schema from "src/schema.json";

export function traverse(path: string, obj: any) {
  let result: any = obj;
  path.split(".").forEach((pathSegment) => {
    if (!pathSegment || !result) return;
    result = result[pathSegment];
  });
  return result;
}

export function getFieldValue(
  fieldName: string,
  character: Character | undefined,
) {
  return traverse(fieldName, character);
}

export function setFieldValue(
  fieldName: string,
  character: Character | undefined,
  value: unknown,
) {
  const partialFieldName = fieldName.split(".").slice(0, -1).join(".");
  const leafNode = traverse(partialFieldName, character);
  // Fail soft: a path whose parent node is missing must not throw. These
  // actions replay from undo history and arrive over WAMP from live-session
  // peers — untrusted input — so a bad/stale path should be dropped with a
  // warning, not crash the reducer.
  if (leafNode === undefined || leafNode === null) {
    console.warn(`setFieldValue: no parent node at path "${fieldName}"`);
    return;
  }
  let index: string | number = fieldName.split(".").slice(-1)[0];
  const parsed = parseInt(index);
  if (!isNaN(parsed)) index = parsed;
  leafNode[index] = value;
}

const validateSchema = new Ajv().compile(schema);

export function validateCharacterData(
  characterData: unknown,
): [boolean, typeof validateSchema.errors] {
  const valid = validateSchema(characterData);
  return [valid, validateSchema.errors];
}
