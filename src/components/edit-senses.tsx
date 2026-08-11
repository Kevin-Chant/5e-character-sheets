import { useState } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { Senses } from "src/lib/types";
import { useSave } from "./modals/modal-container";
import Select from "src/components/select";

// Each sense with its label and a default range (feet) used when first added.
const SENSES: Array<[keyof Senses, string, number]> = [
  ["darkvision", "Darkvision", 60],
  ["blindsight", "Blindsight", 10],
  ["tremorsense", "Tremorsense", 30],
  ["truesight", "Truesight", 30],
];
const labelOf = (key: keyof Senses) =>
  SENSES.find(([k]) => k === key)?.[1] ?? key;
const defaultOf = (key: keyof Senses) =>
  SENSES.find(([k]) => k === key)?.[2] ?? 30;

// Opened with subField "new" (pick an unused sense + range) or a sense key
// (edit its range). Committed as one action on save.
export default function EditSenses() {
  const { character } = useLoadedCharacter();
  const { subField } = useTargetedField();
  const { saveData } = useSave();

  const senses: Senses = character?.senses ?? {};
  const isNew = subField === "new" || subField === undefined;
  const unused = SENSES.filter(([k]) => senses[k] === undefined);
  const initialKey = isNew
    ? (unused[0]?.[0] ?? "darkvision")
    : (subField as keyof Senses);

  const [senseKey, setSenseKey] = useState<keyof Senses>(initialKey);
  const [range, setRange] = useState<number>(
    isNew
      ? defaultOf(initialKey)
      : (senses[initialKey] ?? defaultOf(initialKey)),
  );

  const save = () =>
    saveData(undefined, updateAt(charPath(FIELD.senses).k(senseKey), range));

  return (
    <form className="edit-senses column" onSubmit={(e) => e.preventDefault()}>
      <label className="column">
        Sense
        {isNew ? (
          <Select
            label="Sense"
            value={senseKey}
            options={unused.map(([key, label]) => ({ value: key, label }))}
            onChange={(value) => {
              const key = value as keyof Senses;
              setSenseKey(key);
              setRange(defaultOf(key));
            }}
          />
        ) : (
          <input type="text" value={labelOf(senseKey)} disabled />
        )}
      </label>
      <label className="column">
        Range (ft)
        <input
          type="number"
          value={range}
          autoFocus
          onChange={(e) => setRange(Number(e.target.value))}
        />
      </label>
      <button
        className="btn-primary edit-save"
        onClick={(e) => {
          e.preventDefault();
          save();
        }}
      >
        Save
      </button>
    </form>
  );
}
