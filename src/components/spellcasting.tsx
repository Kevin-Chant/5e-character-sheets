import { useEffect, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import SingleValueDisplay from "./display/single-value-display";
import SlotPips from "./display/slot-pips";
import {
  FIELD,
  OfficialClass,
  SpellLevel,
} from "src/lib/data/data-definitions";
import { upperFirst } from "lodash";
import { calculateCustomFormula } from "src/lib/formula";
import {
  getDefaultSpellSlots,
  getNumericSpellSlotLevel,
  getPactSlotInfo,
  isSpellcastingClass,
} from "src/lib/rules";
import { Character, Spell, SpellCastingClass } from "src/lib/types";
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

function SpellsTable({ character }: SpellsTableProps) {
  const { dispatch } = useCharacter();
  const { editMode } = useEditMode();
  // Levels the user has manually revealed (e.g. to record a spell granted by a
  // feat or background at a level they have no slots for). Session-only — once a
  // spell is added the level stays visible on its own via `hasSpells`.
  const [revealedLevels, setRevealedLevels] = useState<Set<SpellLevel>>(
    new Set(),
  );

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.class,
  );
  // Default the spellcasting class for newly-added spells; fall back to the
  // character's first class (or Wizard) when no spellcasting class exists yet.
  const defaultSpellClass =
    spellcastingClasses[0] ?? character.class[0]?.name ?? OfficialClass.Wizard;
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

  const standardSlots = (level: SpellLevel) =>
    character.spellSlots[level]?.totalOverride ??
    getDefaultSpellSlots(character, level);

  // A level card is shown when it has standard slots, holds spells, is covered
  // by pact magic, or was manually revealed.
  const allLevels = Object.values(SpellLevel) as SpellLevel[];
  const visibleLevels = allLevels.filter((level) => {
    const hasSpells = (character.spells[level]?.length ?? 0) > 0;
    return (
      standardSlots(level) > 0 ||
      hasSpells ||
      getNumericSpellSlotLevel(level) <= pactLevel ||
      revealedLevels.has(level)
    );
  });
  const hiddenLevels = allLevels.filter((l) => !visibleLevels.includes(l));

  const newSpellDefault = (label: string): Spell => ({
    spellcastingClass: defaultSpellClass,
    info: { title: label, titleFormulas: [] },
  });

  return (
    <div className="spell-area">
      <PactSlots character={character} />
      <div className="spell-levels">
        <div className="spell-level-card">
          <div className="spell-level-header">
            <p className="title">Cantrips</p>
          </div>
          <SpellList
            bucket={charPath(FIELD.spells).k("cantrips")}
            preparable={false}
            showClassBadge={showClassBadge}
            defaultValue={newSpellDefault("New cantrip")}
          />
        </div>
        {visibleLevels.map((level) => {
          const total = standardSlots(level);
          const expended = character.spellSlots[level]?.expended ?? 0;
          return (
            <div key={level} className="spell-level-card">
              <div className="spell-level-header">
                <span className="spell-level-number">
                  Level {getNumericSpellSlotLevel(level)}
                </span>
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
                defaultValue={newSpellDefault("New spell")}
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
              const level = e.target.value as SpellLevel;
              if (level) setRevealedLevels((prev) => new Set(prev).add(level));
            }}
          >
            <option value="">Select…</option>
            {hiddenLevels.map((level) => (
              <option value={level} key={level}>
                Level {getNumericSpellSlotLevel(level)}
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
  const existingClasses = new Set(
    character?.spellcastingClasses.map((s) => s.class),
  );
  const missingClasses = [
    ...new Set(
      (character?.class ?? [])
        .filter(isSpellcastingClass)
        .map((klass) => klass.name),
    ),
  ].filter((name) => !existingClasses.has(name));

  useEffect(() => {
    if (character && missingClasses.length > 0) {
      dispatch(
        updateAt(charPath(FIELD.spellcastingClasses), [
          ...character.spellcastingClasses,
          ...missingClasses.map((name) => ({ class: name })),
        ]),
      );
    }
  }, [missingClasses.join("|")]);

  if (!character) return <></>;

  const addSpellcastingClass = () => {
    const newSpellcastingClass: SpellCastingClass = {
      class: OfficialClass.Wizard,
    };
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
              cursor={charPath(FIELD.spellcastingClasses).at(index).k("class")}
              name={"Spellcasting Class"}
              vertical
              editable
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
