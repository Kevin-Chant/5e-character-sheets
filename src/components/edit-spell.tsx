import React from "react";
import { FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { isTextComponent } from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/utils";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import { ControlledEditTextLine } from "./edit-text-line";

export default function EditSpell() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { saveData } = useSave();

  if (!character || targetedField !== FIELD.spells || !subField) return <></>;

  const spell = traverse(subField, getFieldValue(targetedField, character));
  if (!spell) return <></>;

  const textComponent = spell.info;
  if (!isTextComponent(textComponent)) return <></>;

  const updateCastingClass = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(
      updateData(
        targetedField,
        { value: e.target.value },
        `${subField}.spellcastingClass`,
      ),
    );
  };

  const updateTitle = (newValue: string) => {
    dispatch(
      updateData(targetedField, { value: newValue }, `${subField}.info.title`),
    );
  };

  const addTitleFormula = () => {
    dispatch(
      updateData(
        targetedField,
        { value: [...textComponent.titleFormulas, "proficiencyBonus"] },
        `${subField}.info.titleFormulas`,
      ),
    );
  };

  const editTitleFormula = (index: number) => {
    pushTargetedField(targetedField, `${subField}.info.titleFormulas.${index}`);
  };

  const addDetail = () => {
    dispatch(
      updateData(
        targetedField,
        {
          value: {
            ...textComponent,
            detail: "",
            detailFormulas: [],
          },
        },
        `${subField}.info`,
      ),
    );
  };

  const updateDetail = (newValue: string) => {
    dispatch(
      updateData(
        targetedField,
        {
          value: newValue,
        },
        `${subField}.info.detail`,
      ),
    );
  };
  const addDetailFormula = () => {
    dispatch(
      updateData(
        targetedField,
        { value: [...textComponent.titleFormulas, "proficiencyBonus"] },
        `${subField}.info.detailFormulas`,
      ),
    );
  };

  const editDetailFormula = (index: number) => {
    pushTargetedField(
      targetedField,
      `${subField}.info.detailFormulas.${index}`,
    );
  };

  const clearDetails = () => {
    dispatch(
      updateData(
        targetedField,
        {
          value: {
            ...textComponent,
            detail: undefined,
            detailFormulas: undefined,
          },
        },
        `${subField}.info`,
      ),
    );
  };

  const onSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    saveData();
  };

  const spellcastingClasses = character.spellcastingClasses.map(
    (klass) => klass.class,
  );

  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Edit Spell</b>
        </div>
        <div className="row">
          <label htmlFor="selectSpellcastingClass">Spellcasting Class:</label>
          <select
            id="selectSpellcastingClass"
            value={spell.spellcastingClass}
            onChange={updateCastingClass}
          >
            {spellcastingClasses.map((className) => (
              <option value={className} key={className}>
                {className}
              </option>
            ))}
          </select>
        </div>
        <ControlledEditTextLine
          {...{
            textComponent,
            character,
            updateTitle,
            addTitleFormula,
            editTitleFormula,
            addDetail,
            updateDetail,
            addDetailFormula,
            editDetailFormula,
            clearDetails,
          }}
        />
        <button className="margin-small" onClick={onSubmit}>
          Save
        </button>
      </div>
    </form>
  );
}
