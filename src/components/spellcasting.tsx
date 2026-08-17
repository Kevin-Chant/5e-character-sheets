import { useEffect, useState } from "react";
import { useLoadedCharacter } from "src/lib/hooks/use-character";
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
  expendedPactSlots,
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
import Select from "src/components/select";

interface SpellsTableProps {
  character: Character;
}

function PactSlots({ character }: SpellsTableProps) {
  const { dispatch } = useLoadedCharacter();
  const pactSlotInfo = getPactSlotInfo(character);
  const total = character.pactSlots?.totalOverride ?? pactSlotInfo.total;
  const expended = expendedPactSlots(character);
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

// Prepared-spell counts, per class (a multiclass caster has separate allowances).
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
  const { dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();
  // Levels manually revealed (e.g. a spell granted at a level with no slots).
  // Session-only — once a spell is added, `hasSpells` keeps the level visible.
  const [revealedLevels, setRevealedLevels] = useState<Set<LeveledSpellLevel>>(
    new Set(),
  );

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.classId,
  );
  const showClassBadge = spellcastingClasses.length > 1;

  // Pact casters learn spells up to their pact-slot level even with no
  // standard slots, so pact level extends which spell-level cards show.
  const pactInfo = getPactSlotInfo(character);
  const pactActive = (character.pactSlots?.totalOverride ?? pactInfo.total) > 0;
  const pactLevel = pactActive
    ? (character.pactSlots?.levelOverride ?? pactInfo.level)
    : 0;

  const standardSlots = (level: LeveledSpellLevel) =>
    character.spellSlots[level]?.totalOverride ??
    getDefaultSpellSlots(character, level);

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
            <span className="spell-level-number">Cantrips</span>
          </div>
          <SpellList
            bucket={charPath(FIELD.spells).k(0)}
            preparable={false}
            showClassBadge={showClassBadge}
          />
        </div>
        {visibleLevels.map((level) => {
          const total = standardSlots(level);
          // Clamped so lowering the override can't render more spent pips than exist.
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
                      name={total === 1 ? "Slot" : "Slots"}
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
        <span className="add-spell-level">
          Add spell level:{" "}
          <Select
            label="Add spell level"
            triggerLabel="Select…"
            value=""
            options={hiddenLevels.map((level) => ({
              value: String(level),
              label: `Level ${level}`,
            }))}
            onChange={(value) => {
              const level = Number(value) as LeveledSpellLevel;
              if (level) setRevealedLevels((prev) => new Set(prev).add(level));
            }}
          />
        </span>
      )}
    </div>
  );
}

export default function Spellcasting() {
  const { character, dispatch } = useLoadedCharacter();
  const { editMode } = useEditMode();

  // Auto-populate spellcasting entries for classes that don't have one yet.
  // Removals are never undone: a dropped class keeps its entry until deleted.
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

  const addSpellcastingClass = () => {
    // Default to a class with no spellcasting entry yet, else the first class.
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

  // Present when the character has a spellcasting class or any recorded spell.
  const casts =
    character.spellcastingClasses.length > 0 ||
    Object.values(character.spells).some((list) => (list?.length ?? 0) > 0);
  if (!casts && !editMode) return <></>;

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
      {casts && <SpellsTable character={character} />}
    </div>
  );
}
