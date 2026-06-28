import React, { useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { Operation, StatKey } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  Addition,
  Ceil,
  CustomFormula,
  Division,
  Expression,
  Floor,
  isArbitraryOperandOperation,
  isAtomicVariable,
  isDoubleOperandOperation,
  isSingleOperandOperation,
  Maximum,
  Minimum,
  Multiplication,
  Subtraction,
} from "src/lib/types";
import {
  EDITOR_SYNTAX,
  formatCustomFormula,
  formatExpression,
} from "src/lib/formula";
import { EditableCustomFormula } from "./editable-custom-formula";
import { EditableAtomicVariable } from "./editable-atomic-variable";

type ArbitraryExpr = Addition | Multiplication | Maximum | Minimum;

interface EditableExpressionProps {
  expr: Expression;
  setExpr: (newVal: CustomFormula) => void;
  edit: boolean;
}

/** A single operand normalised across the three operation shapes so the inline
 *  expression and its editor can be rendered uniformly. */
interface OperandDesc {
  key: string;
  value: CustomFormula;
  setFormula: (v: CustomFormula) => void;
  removeOperand?: () => void;
}

export function EditableExpression({
  expr,
  setExpr,
  edit,
}: EditableExpressionProps) {
  const { character } = useCharacter();
  const [openKey, setOpenKey] = useState<string | null>(null);
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
    return <div>{formatExpression(expr, character, false)}</div>;
  }

  const clone = (operands: CustomFormula[]) =>
    JSON.parse(JSON.stringify(operands)) as CustomFormula[];

  let operands: OperandDesc[] = [];
  if (isSingleOperandOperation(expr)) {
    const single = expr as Ceil | Floor;
    operands = [
      {
        key: "operand1",
        value: single.operand1,
        setFormula: (v) => setExpr({ ...single, operand1: v }),
      },
    ];
  } else if (isDoubleOperandOperation(expr)) {
    const double = expr as unknown as Subtraction | Division;
    operands = [
      {
        key: "operand1",
        value: double.operand1,
        setFormula: (v) => setExpr({ ...double, operand1: v }),
      },
      {
        key: "operand2",
        value: double.operand2,
        setFormula: (v) => setExpr({ ...double, operand2: v }),
      },
    ];
  } else if (isArbitraryOperandOperation(expr)) {
    const arbitrary = expr as ArbitraryExpr;
    operands = arbitrary.operands.map((operand, i) => ({
      key: `operands.${i}`,
      value: operand,
      setFormula: (v) => {
        const next = clone(arbitrary.operands);
        next.splice(i, 1, v);
        setExpr({ ...arbitrary, operands: next });
      },
      removeOperand: () => {
        const next = clone(arbitrary.operands);
        next.splice(i, 1);
        setExpr({ operation: arbitrary.operation, operands: next });
      },
    }));
  }

  const { startStr, connector, endStr } = EDITOR_SYNTAX[expr.operation];
  const openOperand = operands.find((o) => o.key === openKey);

  return (
    <>
      <div className="row formula-type-row">
        <p className="field-label">Formula type</p>
        <select
          value={expr.operation}
          onChange={(e) => {
            setOpenKey(null);
            setOperation(e.target.value as Expression["operation"]);
          }}
        >
          {Object.keys(Operation).map((operation) => (
            <option key={operation} value={operation}>
              {operation}
            </option>
          ))}
        </select>
      </div>
      <div className="formula-expression">
        <p className="formula-syntax">{startStr}</p>
        {operands.map((operand, i) => (
          <React.Fragment key={operand.key}>
            {i > 0 && <p className="formula-syntax nowrap">{connector}</p>}
            <EditableCustomFormula
              formula={operand.value}
              removeOperand={operand.removeOperand}
              open={openKey === operand.key}
              onToggle={() =>
                setOpenKey(openKey === operand.key ? null : operand.key)
              }
            />
          </React.Fragment>
        ))}
        {isArbitraryOperandOperation(expr) && (
          <button
            type="button"
            className="icon-btn formula-add-pip"
            title="Add operand"
            aria-label="Add operand"
            onClick={(e) => {
              e.preventDefault();
              // TODO: persist new operands immediately so they can be edited (at least if they're formulas)
              setExpr({
                operation: expr.operation,
                operands: expr.operands.concat([1]),
              });
            }}
          >
            <FaPlus />
          </button>
        )}
        <p className="formula-syntax nowrap">{endStr}</p>
      </div>
      {openOperand && (
        <div className="formula-inline-editor">
          <p className="field-label">
            Editing {formatCustomFormula(openOperand.value, character, false)}
          </p>
          {isAtomicVariable(openOperand.value) ? (
            <EditableAtomicVariable
              atomicVar={openOperand.value}
              setVar={openOperand.setFormula}
              removeVar={openOperand.removeOperand}
            />
          ) : (
            <EditableExpression
              expr={openOperand.value}
              setExpr={openOperand.setFormula}
              edit={true}
            />
          )}
        </div>
      )}
    </>
  );
}
