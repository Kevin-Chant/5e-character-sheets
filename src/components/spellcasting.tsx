import { useEffect, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import SingleValueDisplay from "./display/single-value-display";
import SlotPips from "./display/slot-pips";
import {
  FIELD,
  LeveledSpellLevel,
  LEVELED_SPELL_LEVELS,
} from "src/lib/data/data-definitions";
import { upperFirst } from "lodash";
import { calculateCustomFormula } from "src/lib/formula";
import {
  classById,
  classNameForId,
  expendedSpellSlots,
  getDefaultSpellSlots,
  getPactSlotInfo,
  isSpellcastingClass,
  preparedSpellCount,
  preparedSpellsFor,
} from "src/lib/rules";
import classNames from "classnames";
import { Character, SpellCastingClass } from "src/lib/types";
import { charPath, updateAt } from "src/lib/cursor";
import SpellList from "./display/spell-list";
import { FaTrash } from "react-icons/fa6";

interface SpellsTableProps {
  character: Character;
}

function PactSlots({ character }: SpellsTableProps) {
  const { dispatch } = useCharacter();
  const pactSlotInfo = getPactSlotInfo(character);
  const total = character.pactSlots?.totalOverride ?? pactSlotInfo.total;
  const expended = character.pactSlots?.expended ?? 0;
  if (total <= 0) return <></>;

  return (
    <div className="spell-banner rounded-border-box">
      <p className="title">Pact Slots</p>
      <div className="spell-slot-tracker">
        <SingleValueDisplay
          cursor={charPath(FIELD.pactSlots).k("levelOverride")}
          name={"Slot level"}
          vertical
          editable
          removeBorder
          removeMargin
        />
        <SingleValueDisplay
          cursor={charPath(FIELD.pactSlots).k("totalOverride")}
          name={"Slots total"}
          vertical
          editable
          removeBorder
          removeMargin
        />
        <SlotPips
          total={total}
          expended={expended}
          onChange={(newExpended) =>
            dispatch(
              updateAt(charPath(FIELD.pactSlots).k("expended"), newExpended),
            )
          }
        />
      </div>
    </div>
  );
}

// "How many spells can I have prepared?" — the number a cleric, druid, wizard,
// paladin or artificer needs at every long rest, and the one part of their
// spellcasting the sheet never showed. Rendered per class, since a
// cleric/wizard multiclass prepares from two separate allowances.
function PreparedCounts({ character }: SpellsTableProps) {
  const rows = character.spellcastingClasses
    .map((entry) => {
      const klass = classById(character, entry.classId);
      const allowance = klass ? preparedSpellCount(character, klass) : null;
      if (!klass || allowance === null) return undefined;
      return {
        id: klass.id,
        name: klass.name,
        allowance,
        prepared: preparedSpellsFor(character, klass.id),
      };
    })
    .filter((r) => r !== undefined);
  if (rows.length === 0) return <></>;

  return (
    <div className="spell-banner rounded-border-box">
      <p className="title">Prepared</p>
      <div className="prepared-counts">
        {rows.map((row) => (
          <span
            key={row.id}
            className={classNames("prepared-count", {
              // Over the limit is the actionable state — you have to put one
              // back. Under is normal: you can prepare fewer than your maximum.
              over: row.prepared > row.allowance,
            })}
            title={`${row.name}: ${row.prepared} of ${row.allowance} prepared`}
          >
            {rows.length > 1 && <b>{row.name} </b>}
            {row.prepared} / {row.allowance}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpellsTable({ character }: SpellsTableProps) {
  const { dispatch } = useCharacter();
  const { editMode } = useEditMode();
  // Levels the user has manually revealed (e.g. to record a spell granted by a
  // feat or background at a level they have no slots for). Session-only — once a
  // spell is added the level stays visible on its own via `hasSpells`.
  const [revealedLevels, setRevealedLevels] = useState<Set<LeveledSpellLevel>>(
    new Set(),
  );

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.classId,
  );
  // Show each spell's class only when multiclassing, where it's ambiguous.
  const showClassBadge = spellcastingClasses.length > 1;

  // Warlocks (and other pact casters) learn spells up to their pact-slot level
  // even though they have no standard slots, so the pact level extends which
  // spell-level cards are shown.
  const pactInfo = getPactSlotInfo(character);
  const pactActive = (character.pactSlots?.totalOverride ?? pactInfo.total) > 0;
  const pactLevel = pactActive
    ? (character.pactSlots?.levelOverride ?? pactInfo.level)
    : 0;

  const standardSlots = (level: LeveledSpellLevel) =>
    character.spellSlots[level]?.totalOverride ??
    getDefaultSpellSlots(character, level);

  // A level card is shown when it has standard slots, holds spells, is covered
  // by pact magic, or was manually revealed.
  const visibleLevels = LEVELED_SPELL_LEVELS.filter((level) => {
    const hasSpells = (character.spells[level]?.length ?? 0) > 0;
    return (
      standardSlots(level) > 0 ||
      hasSpells ||
      level <= pactLevel ||
      revealedLevels.has(level)
    );
  });
  const hiddenLevels = LEVELED_SPELL_LEVELS.filter(
    (l) => !visibleLevels.includes(l),
  );

  return (
    <div className="spell-area">
      <PactSlots character={character} />
      <PreparedCounts character={character} />
      <div className="spell-levels">
        <div className="spell-level-card">
          <div className="spell-level-header">
            <p className="title">Cantrips</p>
          </div>
          <SpellList
            bucket={charPath(FIELD.spells).k(0)}
            preparable={false}
            showClassBadge={showClassBadge}
          />
        </div>
        {visibleLevels.map((level) => {
          const total = standardSlots(level);
          // Clamped, so lowering the override (or losing the level that granted
          // the slots) can't render more spent pips than exist.
          const expended = expendedSpellSlots(character, level);
          return (
            <div key={level} className="spell-level-card">
              <div className="spell-level-header">
                <span className="spell-level-number">Level {level}</span>
                {total > 0 && (
                  <div className="spell-slot-tracker">
                    <SingleValueDisplay
                      cursor={charPath(FIELD.spellSlots)
                        .k(level)
                        .k("totalOverride")}
                      name={"Slots"}
                      editable
                      removeBorder
                      removeMargin
                    />
                    <SlotPips
                      total={total}
                      expended={expended}
                      onChange={(newExpended) =>
                        dispatch(
                          updateAt(
                            charPath(FIELD.spellSlots).k(level).k("expended"),
                            newExpended,
                          ),
                        )
                      }
                    />
                  </div>
                )}
              </div>
              <SpellList
                bucket={charPath(FIELD.spells).k(level)}
                preparable
                showClassBadge={showClassBadge}
              />
            </div>
          );
        })}
      </div>
      {editMode && hiddenLevels.length > 0 && (
        <label className="add-spell-level">
          Add spell level:{" "}
          <select
            value=""
            onChange={(e) => {
              const level = Number(e.target.value) as LeveledSpellLevel;
              if (level) setRevealedLevels((prev) => new Set(prev).add(level));
            }}
          >
            <option value="">Select…</option>
            {hiddenLevels.map((level) => (
              <option value={level} key={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default function Spellcasting() {
  const { character, dispatch } = useCharacter();
  const { editMode } = useEditMode();

  // Auto-populate the spellcasting class list from the character's classes:
  // add an entry for each spellcasting class that isn't already listed. Manual
  // entries and overrides are preserved, and removals are never undone — a
  // class dropped from the class list keeps its spellcasting entry until the
  // user deletes it.
  const existingClassIds = new Set(
    character?.spellcastingClasses.map((s) => s.classId),
  );
  // Character classes that cast but have no spellcasting entry yet, by id.
  const missingClassIds = (character?.class ?? [])
    .filter(isSpellcastingClass)
    .map((klass) => klass.id)
    .filter((id) => !existingClassIds.has(id));

  useEffect(() => {
    if (character && missingClassIds.length > 0) {
      dispatch(
        updateAt(charPath(FIELD.spellcastingClasses), [
          ...character.spellcastingClasses,
          ...missingClassIds.map((classId) => ({ classId })),
        ]),
      );
    }
  }, [missingClassIds.join("|")]);

  if (!character) return <></>;

  const addSpellcastingClass = () => {
    // Default to a character class that has no spellcasting entry yet, else the
    // first class. (A classless sheet can't form a valid reference, so bail.)
    const target =
      character.class.find(
        (k) => !character.spellcastingClasses.some((s) => s.classId === k.id),
      ) ?? character.class[0];
    if (!target) return;
    const newSpellcastingClass: SpellCastingClass = { classId: target.id };
    dispatch(
      updateAt(charPath(FIELD.spellcastingClasses), [
        ...character.spellcastingClasses,
        newSpellcastingClass,
      ]),
    );
  };

  const removeSpellcastingClass = (index: number) => {
    const newValue = [...character.spellcastingClasses];
    newValue.splice(index, 1);
    dispatch(updateAt(charPath(FIELD.spellcastingClasses), newValue));
  };

  return (
    <div className="spellcasting">
      <div className="spellcasting-classes">
        {character.spellcastingClasses.map((spellcastingClass, index) => (
          <div
            className="spellcasting-class-row rounded-border-box"
            key={index}
          >
            <SingleValueDisplay
              cursor={charPath(FIELD.spellcastingClasses)
                .at(index)
                .k("classId")}
              transform={(id) => classNameForId(character, id) ?? "Unknown"}
              name={"Spellcasting Class"}
              vertical
              removeBorder
            />
            <SingleValueDisplay
              cursor={charPath(FIELD.spellcastingClasses)
                .at(index)
                .k("abilityOverride")}
              name={"Spellcasting ability"}
              transform={upperFirst}
              vertical
              editable
              removeBorder
            />
            <SingleValueDisplay
              cursor={charPath(FIELD.spellcastingClasses)
                .at(index)
                .k("saveDcOverride")}
              name={"Spell Save DC"}
              transform={calculateCustomFormula}
              vertical
              editable
              removeBorder
            />
            <SingleValueDisplay
              cursor={charPath(FIELD.spellcastingClasses)
                .at(index)
                .k("attackBonusOverride")}
              name={"Spell Attack Bonus"}
              transform={calculateCustomFormula}
              vertical
              editable
              removeBorder
            />
            {editMode && (
              <button
                type="button"
                className="icon-button"
                aria-label="Remove spellcasting class"
                onClick={(e) => {
                  e.preventDefault();
                  removeSpellcastingClass(index);
                }}
              >
                <FaTrash />
              </button>
            )}
          </div>
        ))}
        {editMode && (
          <button onClick={addSpellcastingClass}>Add spellcasting class</button>
        )}
      </div>
      <SpellsTable character={character} />
    </div>
  );
}
