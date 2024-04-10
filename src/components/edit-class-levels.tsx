import { without } from "lodash";
import React, { useEffect, useState } from "react";
import {
  FIELD,
  OfficialClass,
  OfficialSubclasses,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { IClass, isOfficialClass } from "src/lib/types";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";

export interface EditSingleClassProps {
  klass: IClass;
  setKlass: (newVal: IClass) => void;
  options: string[];
}

function EditSingleClass({ klass, setKlass, options }: EditSingleClassProps) {
  const onChangeKlass = (newKlass: string) => {
    setKlass({ ...klass, name: newKlass, subclass: undefined });
  };

  const onChangeLevel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const level = parseInt(e.target.value);
    setKlass({ ...klass, level });
  };

  const onChangeSubclass = (newSubclass: string) => {
    setKlass({ ...klass, subclass: newSubclass });
  };

  return (
    <div className="row rounded-border-box font-large">
      <OptionOrCustomValue
        value={klass.name}
        setValue={onChangeKlass}
        options={options}
        customDefaultValue={"Homebrew Class"}
        customInputType="text"
        customValueHelpText="Custom class:"
      />
      <input type="number" value={klass.level} onChange={onChangeLevel} />
      <OptionOrCustomValue
        value={klass.subclass}
        setValue={onChangeSubclass}
        options={
          isOfficialClass(klass.name) ? OfficialSubclasses[klass.name] : []
        }
        customDefaultValue={"Homebrew Subclass"}
        customInputType="text"
        customValueHelpText="Custom subclass:"
        allowUndefined
        undefinedHelpText="Add subclass"
      />
    </div>
  );
}

export default function EditClassLevels() {
  const { character, dispatch } = useCharacter();
  const { saveData } = useSave();

  if (!character) return <></>;

  const klassArr = character.class;

  const unusedClassnames = Object.keys(OfficialClass).filter(
    (className) => !klassArr.map((klass) => klass.name).includes(className)
  );

  const addClass = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dispatch(
      updateData(FIELD.class, {
        value: klassArr.concat([
          { name: unusedClassnames[0] || "Homebrew Class", level: 1 },
        ]),
      })
    );
  };

  const removeClass = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number
  ) => {
    e.preventDefault();
    const newKlassArr = klassArr.slice();
    newKlassArr.splice(index, 1);
    dispatch(
      updateData(FIELD.class, {
        value: newKlassArr,
      })
    );
  };

  const updateKlass = (index: number, newKlass: IClass) => {
    dispatch(
      updateData(
        FIELD.class,
        {
          value: newKlass,
        },
        index.toString()
      )
    );
  };

  return (
    <form>
      <div className="column">
        <div className="column">
          <b className="title font-large">Class and Levels</b>
          <i className="">
            Make sure your starting class is the first entry for the automatic
            HP formula to work correctly
          </i>
        </div>
        <div className="column">
          {klassArr.map((klass, i) => (
            <div className="row" key={i}>
              <EditSingleClass
                klass={klass}
                setKlass={(newVal) => updateKlass(i, newVal)}
                options={Object.keys(OfficialClass).filter(
                  (className) =>
                    !without(klassArr, klass).find(
                      (klass) => klass.name === className
                    )
                )}
              />
              <button onClick={(e) => removeClass(e, i)}>Remove class</button>
            </div>
          ))}
          <button onClick={addClass}>Add multiclass</button>
        </div>
        <button className="margin-small" onClick={saveData}>
          Save
        </button>
      </div>
    </form>
  );
}
