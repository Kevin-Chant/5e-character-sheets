import React, { useMemo, useState } from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { fromStack, updateAt } from "src/lib/cursor";
import { getFieldValue } from "src/lib/fields";
import { classNameForId, officialSpellcastingClasses } from "src/lib/rules";
import { randomUUID } from "src/lib/browser";
import { Spell } from "src/lib/types";
import { buildSpellFromSrd } from "src/lib/spells/srd-spell-adapter";
import { searchSrdSpells, SrdSpell } from "src/lib/spells/srd-spells";

// The `subField` targeting this picker is `<level>.new`, e.g. "0.new" (cantrips)
// or "3.new" — the numeric-level list the chosen spell should land in.
const numericLevelFor = (levelKey: string): number => Number(levelKey);

// SRD analog of AddAttack: browse the bundled catalog, filtered to the spell
// level of the list you opened it from (and, when multiclassing, filterable by
// class). Picking one appends a pre-populated—but fully editable—Spell and swaps
// straight into its editor, so backing out without saving discards it.
export default function AddSpellFromSrd() {
  const { character, dispatch } = useCharacter();
  const { subField, replaceCursor } = useTargetedField();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const levelKey = (subField ?? "").replace(/\.new$/, "");
  const level = numericLevelFor(levelKey);

  // The character's spellcasting classes as {id, name} pairs: the *name* drives
  // the SRD class filter (SRD spells list classes by name); the *id* is what a
  // newly-added spell is tagged with.
  const scPairs = character
    ? character.spellcastingClasses.map((sc) => ({
        id: sc.classId,
        name: classNameForId(character, sc.classId) ?? "",
      }))
    : [];
  // Tag the new spell to the filtered class if one is chosen, else the first
  // spellcasting class (falling back to the first class / a fresh id).
  const tagClassId =
    scPairs.find((p) => p.name === classFilter)?.id ??
    scPairs[0]?.id ??
    character?.class[0]?.id ??
    randomUUID();

  // Restrict to spells one of the character's official spellcasting classes can
  // cast (a pure Sorcerer shouldn't see Cure Wounds). Empty — e.g. only custom
  // classes — means don't restrict, since we can't know their lists.
  const castableClasses = character
    ? officialSpellcastingClasses(character)
    : [];

  const matches = useMemo(
    () =>
      searchSrdSpells(query, classFilter || undefined).filter(
        (s) =>
          s.level === level &&
          (classFilter ||
            castableClasses.length === 0 ||
            s.classes.some((c) => (castableClasses as string[]).includes(c))),
      ),
    [query, classFilter, level, castableClasses],
  );

  if (!character) return <></>;

  const add = (srd: SrdSpell) => {
    // `levelKey` is a runtime string (the bucket the picker was opened from), so
    // re-enter the typed world with the documented downcast.
    const bucket = fromStack<Spell[]>(FIELD.spells, levelKey);
    const list: Spell[] = getFieldValue(bucket.toString(), character) ?? [];
    const newList = list.concat(buildSpellFromSrd(srd, tagClassId));
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
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">All classes</option>
          {scPairs.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <div className="column spell-search-results">
        {matches.length === 0 && (
          <p className="muted">No matching SRD spells.</p>
        )}
        {matches.map((srd) => (
          <button
            key={srd.index}
            className="row space-between"
            onClick={(e) => {
              e.preventDefault();
              add(srd);
            }}
          >
            <span>{srd.name}</span>
            <span className="spell-badge">
              {srd.school}
              {srd.damageType ? ` · ${srd.damageType}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
