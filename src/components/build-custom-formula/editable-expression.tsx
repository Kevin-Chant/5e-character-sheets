import React from "react";
import { Operation, StatKey } from "src/lib/data/data-definitions";
import { FIELD } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  CustomFormula,
  Expression,
  isArbitraryOperandOperation,
  isDoubleOperandOperation,
  isSingleOperandOperation,
} from "src/lib/types";
import { OPERATORS, formatExpression } from "src/lib/utils";
import { EditableCustomFormula } from "./editable-custom-formula";

interface EditableExpressionProps {
  expr: Expression;
  setExpr: (newVal: CustomFormula) => void;
  edit: boolean;
  setEdit: (newVal: boolean) => void;
  fieldPath: FIELD;
}

export function EditableExpression({
  expr,
  setExpr,
  edit,
  setEdit,
  fieldPath,
}: EditableExpressionProps) {
  const { character } = useCharacter();
  if (!character) return <></>;

  const setOperation = (operation: Expression["operation"]) => {
    switch (operation) {
      case "ceil":
      case "floor":
        setExpr({
          operation: operation,
          operand1: {
            operation: "division",
            operand1: "Fighter",
            operand2: 2,
          },
        });
        return;
      case "subtraction":
        setExpr({ operation: operation, operand1: "Fighter", operand2: 1 });
        return;
      case "division":
        setExpr({
          operation: operation,
          operand1: "Fighter",
          operand2: 2,
        });
        return;
      case "addition":
      case "multiplication":
      case "maximum":
      case "minimum":
        setExpr({
          operation: operation,
          operands: [StatKey.dex, 2],
        });
        return;
    }
  };

  if (!edit) {
    return (
      <div className="column">
        <button onClick={() => setEdit(true)}>Edit</button>
        <div>{formatExpression(expr, character, false)}</div>
      </div>
    );
  }
  return (
    <>
      <button onClick={() => setEdit(false)}>Done</button>
      <div className="row">
        <p className="font-medium">Formula type</p>
        <select
          className="font-large"
          value={expr.operation}
          onChange={(e) =>
            setOperation(e.target.value as Expression["operation"])
          }
        >
          {Object.keys(Operation).map((operation) => (
            <option key={operation} value={operation}>
              {operation}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <p className="font-large margin-large">
          {OPERATORS[expr.operation].startStr}
        </p>
        {isSingleOperandOperation(expr) && (
          <EditableCustomFormula
            formula={expr.operand1}
            setFormula={(newValue) => {
              setExpr({ ...expr, operand1: newValue });
            }}
            fieldPath={fieldPath}
          />
        )}
        {isDoubleOperandOperation(expr) && (
          <>
            <EditableCustomFormula
              formula={expr.operand1}
              setFormula={(newValue) => {
                setExpr({ ...expr, operand1: newValue });
              }}
              fieldPath={fieldPath}
            />
            <p className="font-large margin-large nowrap">
              {OPERATORS[expr.operation].connector}
            </p>
            <EditableCustomFormula
              formula={expr.operand2}
              setFormula={(newValue) => {
                setExpr({ ...expr, operand2: newValue });
              }}
              fieldPath={fieldPath}
            />
          </>
        )}
        {isArbitraryOperandOperation(expr) && (
          <>
            {expr.operands.map((operand, i, arr) => (
              <React.Fragment key={i}>
                <EditableCustomFormula
                  formula={operand}
                  setFormula={(newValue) => {
                    const newOperands = JSON.parse(
                      JSON.stringify(expr.operands)
                    );
                    newOperands.splice(i, 1, newValue);
                    setExpr({ ...expr, operands: newOperands });
                  }}
                  removeOperand={() => {
                    const newOperands = JSON.parse(
                      JSON.stringify(expr.operands)
                    );
                    newOperands.splice(i);
                    setExpr({
                      operation: expr.operation,
                      operands: newOperands,
                    });
                  }}
                  fieldPath={fieldPath}
                />
                {i < arr.length - 1 && (
                  <p className="font-large margin-large nowrap">
                    {OPERATORS[expr.operation].connector}
                  </p>
                )}
              </React.Fragment>
            ))}
            <button
              onClick={(e) => {
                e.preventDefault();
                setExpr({
                  operation: expr.operation,
                  operands: expr.operands.concat([1]),
                });
              }}
            >
              +
            </button>
          </>
        )}
        <p className="font-large margin-large nowrap">
          {OPERATORS[expr.operation].endStr}
        </p>
      </div>
    </>
  );
}
