import { isNumber } from "lodash";
import { useState } from "react";
import {
  DieOperation,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { randomUUID } from "src/lib/browser";
import { UUID } from "crypto";
import {
  AtomicVariable,
  CustomFormula,
  isClassLevel,
  isDieExpression,
  isEquippedArmor,
  isNonStandardDie,
  isPb,
  isStandardDie,
  isStatKey,
} from "src/lib/types";
import { equippedArmorAC, getPB } from "src/lib/rules";
import { FaRightLeft, FaTrash } from "react-icons/fa6";
import OptionOrCustomValue from "../display/option-or-custom-value";
import Select from "src/components/select";

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
  const { character } = useLoadedCharacter();

  const [emptyState, setEmptyState] = useState(false);
  const chooseValue = (
    e: React.MouseEvent<HTMLButtonElement>,
    value: CustomFormula,
  ) => {
    e.preventDefault();
    setVar(value);
    setEmptyState(false);
  };

  if (emptyState)
    return (
      <div className="atomic-editor">
        <p className="field-label">Choose a type of variable</p>
        <div className="atomic-type-grid">
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
              chooseValue(e, {
                classLevel: character.class[0]?.id ?? randomUUID(),
              });
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
              chooseValue(e, { equippedArmor: true });
            }}
          >
            Equipped Armor AC
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
      <Select
        label="Ability"
        value={atomicVar}
        options={Object.keys(StatKey).map((statKey) => ({
          value: statKey,
          label: statKey,
        }))}
        onChange={(value) => setVar(value as StatKey)}
      />
    );
  } else if (isDieExpression(atomicVar)) {
    inputElement = (
      <div className="atomic-dice-fields">
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
        <Select
          label="What to do with the dice"
          value={atomicVar[2]}
          options={Object.keys(DieOperation).map((dieOperation) => ({
            value: dieOperation,
            label: dieOperation,
          }))}
          onChange={(value) =>
            setVar([atomicVar[0], atomicVar[1], value as DieOperation])
          }
        />
      </div>
    );
  } else if (isPb(atomicVar)) {
    inputElement = <p>Proficiency Bonus ({getPB(character)})</p>;
  } else if (isEquippedArmor(atomicVar)) {
    inputElement = (
      <p>
        Equipped Armor AC ({equippedArmorAC(character)}) — from equipped gear
      </p>
    );
  } else if (isClassLevel(atomicVar)) {
    inputElement = (
      <Select
        label="Which class's level"
        value={atomicVar.classLevel}
        options={character.class.map((klass) => ({
          value: klass.id,
          label: klass.name,
        }))}
        onChange={(value) => setVar({ classLevel: value as UUID })}
      />
    );
  }

  return (
    <div className="atomic-editor">
      <div className="atomic-editor-header">
        <button
          type="button"
          className="btn-secondary atomic-change-type"
          onClick={(e) => {
            e.preventDefault();
            setEmptyState(true);
          }}
        >
          <FaRightLeft /> Change type
        </button>
        {removeVar && (
          <button
            type="button"
            className="icon-btn btn-danger"
            title="Remove"
            aria-label="Remove operand"
            onClick={removeVar}
          >
            <FaTrash />
          </button>
        )}
      </div>
      {inputElement}
    </div>
  );
}
