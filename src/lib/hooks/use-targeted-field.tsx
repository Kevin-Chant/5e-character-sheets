import React, { useContext, useState } from "react";
import { FIELD } from "../data/data-definitions";

type FieldStack = Array<[FIELD, string | undefined]>;
interface TargetedFieldContextData {
  targetedFieldStack: FieldStack;
  setTargetedFieldStack: (stack: FieldStack) => void;
}

export const TargetedFieldContext =
  React.createContext<TargetedFieldContextData>({
    targetedFieldStack: [],
    setTargetedFieldStack: () => {
      console.log("Calling default setTargetedFieldStack");
    },
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
  popTargetedField: () => void;
  clearTargetedField: () => void;
  targetedFieldStackLength: number;
}

export function useTargetedField(): UseTargetedField {
  const { targetedFieldStack, setTargetedFieldStack } =
    useContext(TargetedFieldContext);
  const pushTargetedField = (field: FIELD, subField?: string) => {
    setTargetedFieldStack(targetedFieldStack.concat([[field, subField]]));
  };
  const popTargetedField = () => {
    setTargetedFieldStack(targetedFieldStack.slice(0, -1));
  };
  return {
    targetedField: targetedFieldStack[targetedFieldStack.length - 1]?.[0],
    subField: targetedFieldStack[targetedFieldStack.length - 1]?.[1],
    pushTargetedField,
    popTargetedField,
    clearTargetedField: () => setTargetedFieldStack([]),
    targetedFieldStackLength: targetedFieldStack.length,
  };
}
