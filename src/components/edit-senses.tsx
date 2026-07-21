import { useState } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { charPath, updateAt } from "src/lib/cursor";
import { Senses } from "src/lib/types";
import { useSave } from "./modals/modal-container";

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

// Add or edit a single sense. Opened with subField "new" (pick an unused sense +
// range) or a sense key (edit that sense's range). The chosen value is committed
// as one targeted action on save, so cancelling discards it and switching sense
// type in add-mode never leaves an orphan key behind.
export default function EditSenses() {
  const { character } = useCharacter();
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

  if (!character) return <></>;

  const save = () =>
    saveData(undefined, updateAt(charPath(FIELD.senses).k(senseKey), range));

  return (
    <form className="edit-senses column" onSubmit={(e) => e.preventDefault()}>
      <label className="column">
        Sense
        {isNew ? (
          <select
            value={senseKey}
            onChange={(e) => {
              const key = e.target.value as keyof Senses;
              setSenseKey(key);
              setRange(defaultOf(key));
            }}
          >
            {unused.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
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
        className="margin-small"
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
