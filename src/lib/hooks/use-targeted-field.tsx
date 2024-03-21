import React, { useContext, useState } from "react";
import { FIELD } from "./reducers/actions";

interface TargetedFieldContextData {
  targetedFieldStack: FIELD[];
  setTargetedFieldStack: (stack: FIELD[]) => void;
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
  const [targetedFieldStack, setTargetedFieldStack] = useState<FIELD[]>([]);

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
  pushTargetedField: (value: FIELD) => void;
  popTargetedField: () => void;
  clearTargetedField: () => void;
  targetedFieldStackLength: number;
}

export function useTargetedField(): UseTargetedField {
  const { targetedFieldStack, setTargetedFieldStack } =
    useContext(TargetedFieldContext);
  const pushTargetedField = (field: FIELD) => {
    setTargetedFieldStack(targetedFieldStack.concat([field]));
  };
  const popTargetedField = () => {
    setTargetedFieldStack(targetedFieldStack.slice(0, -1));
  };
  return {
    targetedField: targetedFieldStack[targetedFieldStack.length - 1],
    pushTargetedField,
    popTargetedField,
    clearTargetedField: () => setTargetedFieldStack([]),
    targetedFieldStackLength: targetedFieldStack.length,
  };
}
