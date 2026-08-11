import React, { useMemo, useState } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { fromStack, updateAt } from "src/lib/cursor";
import { getFieldValue } from "src/lib/fields";
import { classNameForId, officialSpellcastingClasses } from "src/lib/rules";
import { randomUUID } from "src/lib/browser";
import { Spell } from "src/lib/types";
import { buildSpellFromCatalog } from "src/lib/spells/spell-adapter";
import {
  searchCatalogSpells,
  CatalogSpell,
} from "src/lib/spells/spell-catalog";
import Select from "src/components/select";

// `subField` is `<level>.new`, e.g. "0.new" (cantrips) or "3.new".
const numericLevelFor = (levelKey: string): number => Number(levelKey);

export default function AddSpellFromCatalog() {
  const { character, dispatch } = useLoadedCharacter();
  const { subField, replaceCursor } = useTargetedField();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const levelKey = (subField ?? "").replace(/\.new$/, "");
  const level = numericLevelFor(levelKey);

  // name drives the class filter (catalog spells list classes by name); id is
  // what a newly-added spell is tagged with.
  const scPairs = character
    ? character.spellcastingClasses.map((sc) => ({
        id: sc.classId,
        name: classNameForId(character, sc.classId) ?? "",
      }))
    : [];
  const tagClassId =
    scPairs.find((p) => p.name === classFilter)?.id ??
    scPairs[0]?.id ??
    character?.class[0]?.id ??
    randomUUID();

  // Empty (e.g. only custom classes) means don't restrict.
  const castableClasses = character
    ? officialSpellcastingClasses(character)
    : [];

  const matches = useMemo(
    () =>
      searchCatalogSpells(query, classFilter || undefined).filter(
        (s) =>
          s.level === level &&
          (classFilter ||
            castableClasses.length === 0 ||
            s.classes.some((c) => (castableClasses as string[]).includes(c))),
      ),
    [query, classFilter, level, castableClasses],
  );

  const add = (entry: CatalogSpell) => {
    const bucket = fromStack<Spell[]>(FIELD.spells, levelKey);
    const list: Spell[] = getFieldValue(bucket.toString(), character) ?? [];
    const newList = list.concat(buildSpellFromCatalog(entry, tagClassId));
    dispatch(updateAt(bucket, newList));
    replaceCursor(bucket.at(newList.length - 1));
  };

  return (
    <div className="column add-spell">
      <input
        autoFocus
        type="text"
        placeholder={`Search ${level === 0 ? "cantrips" : `level ${level} spells`}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {scPairs.length > 1 && (
        <Select
          label="Filter spells by class"
          placeholder="All classes"
          clearable
          clearLabel="All classes"
          value={classFilter}
          options={scPairs.map((p) => ({ value: p.name, label: p.name }))}
          onChange={setClassFilter}
        />
      )}
      <div className="column spell-search-results">
        {matches.length === 0 && <p className="muted">No matching spells.</p>}
        {matches.map((entry) => (
          <button
            key={entry.index}
            className="row space-between"
            onClick={(e) => {
              e.preventDefault();
              add(entry);
            }}
          >
            <span>{entry.name}</span>
            <span className="spell-badge">
              {entry.school}
              {entry.damageType ? ` · ${entry.damageType}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
