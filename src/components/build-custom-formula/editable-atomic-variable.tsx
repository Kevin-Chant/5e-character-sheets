import { isNumber, isString } from "lodash";
import { useState } from "react";
import {
  DieOperation,
  OfficialClass,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  AtomicVariable,
  CustomFormula,
  isDieExpression,
  isNonStandardDie,
  isOfficialClass,
  isPb,
  isStandardDie,
  isStatKey,
} from "src/lib/types";
import { getPB } from "src/lib/utils";
import OptionOrCustomValue from "../display/option-or-custom-value";

interface EditableAtomicVariableProps {
  atomicVar: AtomicVariable;
  setVar: (newVal: CustomFormula) => void;
  removeVar?: () => void;
}

export function EditableAtomicVariable({
  atomicVar,
  setVar,
  removeVar,
}: EditableAtomicVariableProps) {
  const { character } = useCharacter();

  const [emptyState, setEmptyState] = useState(false);
  const chooseValue = (
    e: React.MouseEvent<HTMLButtonElement>,
    value: CustomFormula
  ) => {
    e.preventDefault();
    setVar(value);
    setEmptyState(false);
  };

  if (!character) return <></>;

  if (emptyState)
    return (
      <div>
        <p>Choose a type of variable</p>
        <div className="flex-grid">
          <button
            onClick={(e) => {
              chooseValue(e, 1);
            }}
          >
            Number
          </button>
          <button
            onClick={(e) => {
              chooseValue(e, StatKey.dex);
            }}
          >
            Stat Modifier
          </button>
          <button
            onClick={(e) => {
              chooseValue(e, [1, StandardDie.d8, DieOperation.roll]);
            }}
          >
            Dice
          </button>
          <button
            onClick={(e) => {
              chooseValue(e, OfficialClass.Fighter);
            }}
          >
            Level in a Class
          </button>
          <button
            onClick={(e) => {
              chooseValue(e, PB);
            }}
          >
            Proficiency Bonus
          </button>
          <button
            onClick={(e) => {
              chooseValue(e, {
                operation: Operation.addition,
                operands: [StatKey.dex, 2],
              });
            }}
          >
            Result of a Calculation
          </button>
        </div>
      </div>
    );

  let inputElement = <></>;
  if (isNumber(atomicVar)) {
    inputElement = (
      <input
        type="number"
        value={atomicVar}
        onChange={(e) => setVar(parseInt(e.target.value))}
      ></input>
    );
  } else if (isStatKey(atomicVar)) {
    inputElement = (
      <select
        className="font-large"
        value={atomicVar}
        onChange={(e) => setVar(e.target.value)}
      >
        {Object.keys(StatKey).map((statKey) => (
          <option key={statKey} value={statKey}>
            {statKey}
          </option>
        ))}
      </select>
    );
  } else if (isDieExpression(atomicVar)) {
    inputElement = (
      <>
        <input
          type="number"
          value={atomicVar[0]}
          onChange={(e) =>
            setVar([parseInt(e.target.value), atomicVar[1], atomicVar[2]])
          }
        ></input>
        <OptionOrCustomValue
          value={
            isNonStandardDie(atomicVar[1])
              ? atomicVar[1].numFaces
              : atomicVar[1]
          }
          setValue={(newValue: StandardDie | number) => {
            const dieName = `d${newValue}`;
            const die = isStandardDie(newValue)
              ? newValue
              : isStandardDie(dieName)
              ? dieName
              : { numFaces: newValue || 0 };
            setVar([atomicVar[0], die, atomicVar[2]]);
          }}
          options={Object.keys(StandardDie)}
          customDefaultValue={3}
          customValueHelpText="Number of faces:"
          customInputType="number"
        />
        <select
          className="font-large"
          value={atomicVar[2]}
          onChange={(e) =>
            setVar([atomicVar[0], atomicVar[1], e.target.value as DieOperation])
          }
        >
          {Object.keys(DieOperation).map((dieOperation) => (
            <option key={dieOperation} value={dieOperation}>
              {dieOperation}
            </option>
          ))}
        </select>
      </>
    );
  } else if (isPb(atomicVar)) {
    inputElement = <p>Proficiency Bonus ({getPB(character)})</p>;
  } else if (isString(atomicVar) || isOfficialClass(atomicVar)) {
    inputElement = (
      <OptionOrCustomValue
        value={atomicVar}
        setValue={(newValue: string) => {
          setVar(newValue);
        }}
        options={Object.keys(OfficialClass)}
        customDefaultValue="My homebrew class"
        customValueHelpText="Class name:"
        customInputType="text"
      />
    );
  }

  return (
    <div className="column">
      <div className="row">
        <button
          onClick={(e) => {
            e.preventDefault();
            setEmptyState(true);
          }}
        >
          {"Change Variable Type"}
        </button>
        {removeVar && <button onClick={removeVar}>x</button>}
      </div>
      {inputElement}
    </div>
  );
}
