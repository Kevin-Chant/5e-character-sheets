import { without } from "lodash";
import React, { useEffect, useState } from "react";
import {
  OfficialClass,
  OfficialSubclasses,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { IClass, isOfficialClass } from "src/lib/types";
import OptionOrCustomValue from "./display/option-or-custom-value";

export interface EditSingleClassProps {
  klass: IClass;
  setKlass: (newVal: IClass) => void;
  options: string[];
}

interface EditClassLevelsProps {
  onSubmit: (value: any) => void;
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

export default function EditClassLevels(props: EditClassLevelsProps) {
  const { character } = useCharacter();
  const [klassArr, setKlassArr] = useState<IClass[]>([]);

  useEffect(() => {
    if (character) {
      setKlassArr(character.class);
    }
  }, [character]);

  if (!character) return <></>;

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    props.onSubmit({ value: klassArr });
  };

  const unusedClassnames = Object.keys(OfficialClass).filter(
    (className) => !klassArr.map((klass) => klass.name).includes(className)
  );

  const addClass = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setKlassArr(
      klassArr.concat([
        { name: unusedClassnames[0] || "Homebrew Class", level: 1 },
      ])
    );
  };

  const removeClass = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number
  ) => {
    e.preventDefault();
    const newKlassArr = klassArr.slice();
    newKlassArr.splice(index, 1);
    setKlassArr(newKlassArr);
  };

  const updateKlass = (index: number, newKlass: IClass) => {
    const newKlassArr = klassArr.slice();
    newKlassArr.splice(index, 1, newKlass);
    setKlassArr(newKlassArr);
  };

  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Class and Levels</b>
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
        <button className="margin-small" onClick={onSubmit}>
          Save
        </button>
      </div>
    </form>
  );
}
