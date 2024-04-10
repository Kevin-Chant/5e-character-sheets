import { useEffect, useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import SingleValueDisplay from "./display/single-value-display";
import {
  FIELD,
  OfficialClass,
  SpellLevel,
} from "src/lib/data/data-definitions";
import { groupBy, max, orderBy, upperFirst } from "lodash";
import {
  calculateCustomFormula,
  getNumericSpellSlotLevel,
  getPactSlotInfo,
} from "src/lib/utils";
import { Character, Spell, SpellCastingClass } from "src/lib/types";
import { updateData } from "src/lib/hooks/reducers/actions";
import TextWithFormulasDisplay from "./display/text-with-formulas-display";
import MultiLineTextDisplay from "./display/multi-line-text-display";

interface SpellsTableProps {
  character: Character;
}
function SpellsTable({ character }: SpellsTableProps) {
  const spells = character.spells;
  if (Object.keys(spells).length === 0) return <></>;
  const pactSlotInfo = getPactSlotInfo(character);
  const maxSlotLevel =
    max([
      max(
        (Object.keys(character.spellSlots) as SpellLevel[]).map((spellSlot) =>
          getNumericSpellSlotLevel(spellSlot)
        )
      ) || 0,
      // TODO: allow overriding pact info
      pactSlotInfo.level,
    ]) || -1;

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.class
  );
  const pactSlots =
    pactSlotInfo.total > 0 ? (
      <div>
        <p className="title">Pact Slots</p>
        <div className="rounded-border-box row margin-small">
          <SingleValueDisplay
            field={FIELD.pactSlots}
            subField={`levelOverride`}
            name={"Slot level"}
            vertical
            editable
            removeBorder
            removeMargin
          />
          <SingleValueDisplay
            field={FIELD.pactSlots}
            subField={`totalOverride`}
            name={"Slots total"}
            vertical
            editable
            removeBorder
            removeMargin
          />
          <SingleValueDisplay
            field={FIELD.pactSlots}
            subField={"expended"}
            name={"Slots expended"}
            vertical
            editable
            removeBorder
            removeMargin
          />
        </div>
      </div>
    ) : (
      <></>
    );
  return (
    <div className="column flex-grid vh100">
      {pactSlots}
      <div>
        <p className="title">Cantrips</p>
        <MultiLineTextDisplay
          title={""}
          field={FIELD.spells}
          subField="cantrips"
          transform={(cantrip: Spell) => cantrip.info}
          defaultValue={{
            spellcastingClass: spellcastingClasses[0],
            info: {
              title: "Spell name",
              titleFormulas: [],
            },
          }}
        />
      </div>
      {Object.keys([...Array(maxSlotLevel)])
        .map((stringLevel) => parseInt(stringLevel))
        .map((spellLevel) => {
          const spellLevelName = Object.keys(SpellLevel)[spellLevel];
          return (
            <div key={spellLevel}>
              <div className="row">
                <p className="font-large margin-small">{spellLevel + 1}</p>
                <div className="rounded-border-box row margin-small">
                  <SingleValueDisplay
                    field={FIELD.spellSlots}
                    subField={`${spellLevelName}.totalOverride`}
                    name={"Slots total"}
                    vertical
                    editable
                    removeBorder
                    removeMargin
                  />
                  <SingleValueDisplay
                    field={FIELD.spellSlots}
                    subField={`${spellLevelName}.expended`}
                    name={"Slots expended"}
                    vertical
                    editable
                    removeBorder
                    removeMargin
                  />
                </div>
              </div>
              <MultiLineTextDisplay
                title={""}
                field={FIELD.spells}
                subField={spellLevelName}
                transform={(cantrip: Spell) => cantrip.info}
                defaultValue={{
                  spellcastingClass: spellcastingClasses[0],
                  info: {
                    title: "new entry",
                    titleFormulas: [],
                  },
                }}
              />
            </div>
          );
        })}
    </div>
  );
}

export default function Spellcasting() {
  const { character, dispatch } = useCharacter();
  if (!character) return <></>;

  const addSpellcastingClass = (e: React.MouseEvent<HTMLButtonElement>) => {
    const newSpellcastingClass: SpellCastingClass = {
      class: OfficialClass.Wizard,
    };
    dispatch(
      updateData(FIELD.spellcastingClasses, {
        value: [...character.spellcastingClasses, newSpellcastingClass],
      })
    );
  };

  return (
    <div>
      {character.spellcastingClasses.map((spellcastingClass, index) => (
        <div className="header" key={spellcastingClass.class}>
          <div className="row">
            <SingleValueDisplay
              field={FIELD.spellcastingClasses}
              subField={`${index}.class`}
              name={"Spellcasting Class"}
              vertical
              editable
            />
            <SingleValueDisplay
              field={FIELD.spellcastingClasses}
              subField={`${index}.abilityOverride`}
              name={"Spellcasting ability"}
              transform={upperFirst}
              vertical
              editable
            />
            <SingleValueDisplay
              field={FIELD.spellcastingClasses}
              subField={`${index}.saveDcOverride`}
              name={"Spell Save DC"}
              transform={calculateCustomFormula}
              vertical
              editable
            />
            <SingleValueDisplay
              field={FIELD.spellcastingClasses}
              subField={`${index}.attackBonusOverride`}
              name={"Spell Attack Bonus"}
              transform={calculateCustomFormula}
              vertical
              editable
            />
          </div>
        </div>
      ))}
      <button onClick={addSpellcastingClass}>Add spellcasting class</button>
      <SpellsTable character={character} />
    </div>
  );
}
