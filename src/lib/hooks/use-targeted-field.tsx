import React, { useContext, useState } from "react";
import { FIELD } from "../data/data-definitions";
import { TRACKER_FIELDS, useEditMode } from "./use-edit-mode";
import { missingProvider } from "src/lib/missing-provider";
import { Cursor } from "src/lib/cursor";

type FieldStack = Array<[FIELD, string | undefined]>;
interface TargetedFieldContextData {
  targetedFieldStack: FieldStack;
  setTargetedFieldStack: (stack: FieldStack) => void;
}

export const TargetedFieldContext =
  React.createContext<TargetedFieldContextData>({
    targetedFieldStack: [],
    setTargetedFieldStack: missingProvider("setTargetedFieldStack"),
  });

export function TargetedFieldContextProvider(props: React.PropsWithChildren) {
  // Targeted field is a .-delimited string of nested properties on the character object
  const [targetedFieldStack, setTargetedFieldStack] = useState<FieldStack>([]);

  return (
    <TargetedFieldContext.Provider
      value={{
        targetedFieldStack,
        setTargetedFieldStack,
      }}
    >
      {props.children}
    </TargetedFieldContext.Provider>
  );
}

interface UseTargetedField {
  targetedField: FIELD | undefined;
  subField: string | undefined;
  pushTargetedField: (value: FIELD, subField?: string) => void;
  replaceTargetedField: (value: FIELD, subField?: string) => void;
  // Cursor-typed convenience over push/replace: the cursor serializes to the
  // same `[FIELD, subField]` stack entry, so routing is unaffected.
  pushCursor: (cursor: Cursor<unknown>) => void;
  replaceCursor: (cursor: Cursor<unknown>) => void;
  popTargetedField: () => void;
  clearTargetedField: () => void;
  targetedFieldStackLength: number;
}

export function useTargetedField(): UseTargetedField {
  const { targetedFieldStack, setTargetedFieldStack } =
    useContext(TargetedFieldContext);
  const { editMode } = useEditMode();
  const pushTargetedField = (field: FIELD, subField?: string) => {
    if (!editMode && !TRACKER_FIELDS.has(field)) return;
    setTargetedFieldStack(targetedFieldStack.concat([[field, subField]]));
  };
  const replaceTargetedField = (field: FIELD, subField?: string) => {
    if (!editMode && !TRACKER_FIELDS.has(field)) return;
    setTargetedFieldStack(
      targetedFieldStack.slice(0, -1).concat([[field, subField]]),
    );
  };
  const popTargetedField = () => {
    setTargetedFieldStack(targetedFieldStack.slice(0, -1));
  };
  return {
    targetedField: targetedFieldStack[targetedFieldStack.length - 1]?.[0],
    subField: targetedFieldStack[targetedFieldStack.length - 1]?.[1],
    pushTargetedField,
    replaceTargetedField,
    pushCursor: (cursor: Cursor<unknown>) =>
      pushTargetedField(cursor.root(), cursor.subpath()),
    replaceCursor: (cursor: Cursor<unknown>) =>
      replaceTargetedField(cursor.root(), cursor.subpath()),
    popTargetedField,
    clearTargetedField: () => setTargetedFieldStack([]),
    targetedFieldStackLength: targetedFieldStack.length,
  };
}
