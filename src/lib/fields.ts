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

export function getFieldValue(fieldName: string, character: Character) {
  return traverse(fieldName, character);
}

export function setFieldValue(
  fieldName: string,
  character: Character,
  value: any,
) {
  const partialFieldName = fieldName.split(".").slice(0, -1).join(".");
  const leafNode = traverse(partialFieldName, character);
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
