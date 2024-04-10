import { without } from "lodash";
import React, { useEffect, useState } from "react";
import {
  OfficialClass,
  OfficialSubclasses,
} from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import {
  Character,
  CustomFormula,
  IClass,
  TextComponent,
  isOfficialClass,
  isTextComponent,
  isTextComponentWithDetail,
} from "src/lib/types";
import OptionOrCustomValue from "./display/option-or-custom-value";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { formatCustomFormula, getFieldValue, traverse } from "src/lib/utils";
import { useSave } from "./modals/modal-container";
import { updateData } from "src/lib/hooks/reducers/actions";
import { FaPencil } from "react-icons/fa6";

interface ControlledEditTextLineProps {
  textComponent: TextComponent;
  character: Character;
  updateTitle: (newValue: string) => void;
  addTitleFormula: () => void;
  editTitleFormula: (index: number) => void;
  addDetail: () => void;
  updateDetail: (newValue: string) => void;
  addDetailFormula: () => void;
  editDetailFormula: (index: number) => void;
  clearDetails: () => void;
  saveData?: () => void;
}

export function ControlledEditTextLine({
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
  saveData,
}: ControlledEditTextLineProps) {
  return (
    <form>
      <div className="column">
        <div className="row">
          <b className="title font-large margin-medium">Update Text Section</b>
        </div>
        <div className="column">
          <div className="row">
            <span>Name/title</span>
            <input
              type="text"
              onChange={(e) => updateTitle(e.target.value)}
              value={textComponent.title}
            />
          </div>
          <div className="row">
            <span>Title formulas</span>
            {textComponent.titleFormulas.map(
              (titleFormula: CustomFormula, index: number) => (
                <div key={index}>
                  {formatCustomFormula(titleFormula, character, false)}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      editTitleFormula(index);
                    }}
                  >
                    <FaPencil />
                  </button>
                </div>
              )
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                addTitleFormula();
              }}
            >
              +
            </button>
          </div>
          {isTextComponentWithDetail(textComponent) ? (
            <>
              <div className="row">
                <span>Details</span>
                <textarea
                  onChange={(e) => updateDetail(e.target.value)}
                  value={textComponent.detail}
                />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    clearDetails();
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="row">
                <span>Detail formulas</span>
                {textComponent.detailFormulas.map(
                  (detailFormula: CustomFormula, index: number) => (
                    <div key={index}>
                      {formatCustomFormula(detailFormula, character, false)}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          editDetailFormula(index);
                        }}
                      >
                        <FaPencil />
                      </button>
                    </div>
                  )
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    addDetailFormula();
                  }}
                >
                  +
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                addDetail();
              }}
            >
              Add Details (hover to show)
            </button>
          )}
        </div>
        {saveData && (
          <button className="margin-small" onClick={saveData}>
            Save
          </button>
        )}
      </div>
    </form>
  );
}

export default function EditTextLine() {
  const { character, dispatch } = useCharacter();
  const { targetedField, subField, pushTargetedField } = useTargetedField();
  const { saveData } = useSave();

  if (!character || !targetedField || !subField) return <></>;

  const textComponent = traverse(
    subField,
    getFieldValue(targetedField, character)
  );

  if (!isTextComponent(textComponent)) return <></>;

  const updateTitle = (newValue: string) => {
    dispatch(
      updateData(targetedField, { value: newValue }, `${subField}.title`)
    );
  };

  const addTitleFormula = () => {
    dispatch(
      updateData(
        targetedField,
        { value: [...textComponent.titleFormulas, "proficiencyBonus"] },
        `${subField}.titleFormulas`
      )
    );
  };

  const editTitleFormula = (index: number) => {
    pushTargetedField(targetedField, `${subField}.titleFormulas.${index}`);
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
        subField
      )
    );
  };

  const updateDetail = (newValue: string) => {
    dispatch(
      updateData(
        targetedField,
        {
          value: newValue,
        },
        `${subField}.detail`
      )
    );
  };
  const addDetailFormula = () => {
    dispatch(
      updateData(
        targetedField,
        { value: [...textComponent.titleFormulas, "proficiencyBonus"] },
        `${subField}.detailFormulas`
      )
    );
  };

  const editDetailFormula = (index: number) => {
    pushTargetedField(targetedField, `${subField}.detailFormulas.${index}`);
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
        subField
      )
    );
  };

  return (
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
        saveData,
      }}
    />
  );
}
