import React from "react";

import { useCharacter } from "src/lib/hooks/use-character";
import {
  Character,
  CustomFormula,
  TextComponent,
  TextComponentWithDetails,
  isTextComponent,
  isTextComponentWithDetail,
} from "src/lib/types";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue, traverse } from "src/lib/fields";
import { useSave } from "./modals/modal-container";
import { fromStack, updateAt } from "src/lib/cursor";
import EditTextWithFormulas from "./display/edit-text-with-formulas";

interface ControlledEditTextLineProps {
  textComponent: TextComponent;
  character: Character;
  // Optional sub-section heading. When omitted no heading is rendered (e.g. when
  // the surrounding modal already shows the title in its titlebar).
  title?: string;
  // Write the title template + its formulas together (positional {{}} mapping).
  updateTitle: (text: string, formulas: CustomFormula[]) => void;
  editTitleFormula: (index: number) => void;
  addDetail: () => void;
  updateDetail: (text: string, formulas: CustomFormula[]) => void;
  editDetailFormula: (index: number) => void;
  clearDetails: () => void;
  saveData?: () => void;
}

export function ControlledEditTextLine({
  textComponent,
  character,
  title,
  updateTitle,
  editTitleFormula,
  addDetail,
  updateDetail,
  editDetailFormula,
  clearDetails,
  saveData,
}: ControlledEditTextLineProps) {
  return (
    <form>
      <div className="column edit-text-line">
        {title && <b className="title font-large">{title}</b>}
        <div className="column edit-text-line-fields">
          <div className="column">
            <span>Name/title</span>
            <EditTextWithFormulas
              text={textComponent.title}
              formulas={textComponent.titleFormulas}
              character={character}
              onChange={updateTitle}
              onEditFormula={editTitleFormula}
              placeholder="Name (insert values for stats)"
            />
          </div>
          {isTextComponentWithDetail(textComponent) ? (
            <div className="column">
              <div className="row space-between">
                <span>Details</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    clearDetails();
                  }}
                >
                  Clear
                </button>
              </div>
              <EditTextWithFormulas
                text={textComponent.detail}
                formulas={textComponent.detailFormulas}
                character={character}
                onChange={updateDetail}
                onEditFormula={editDetailFormula}
                placeholder="Description (insert values for stats)"
                multiline
              />
            </div>
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
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (!character || !targetedField || !subField) return <></>;

  const existing = traverse(subField, getFieldValue(targetedField, character));

  // A not-yet-created entry (e.g. adding a new list item) edits a blank draft;
  // it's only persisted to the array when the user actually saves.
  const textComponent: TextComponent = isTextComponent(existing)
    ? existing
    : { title: "", titleFormulas: [] };

  const tc = fromStack<TextComponent>(targetedField, subField);
  // `detailFormulas` isn't a key of the bare TextComponent union (only the
  // with-details variant has it); this narrower cursor unlocks that slot, and is
  // only used from the branch where details already exist.
  const tcDetail = fromStack<TextComponentWithDetails>(targetedField, subField);

  const updateTitle = (text: string, formulas: CustomFormula[]) => {
    dispatch(
      updateAt(tc, { ...textComponent, title: text, titleFormulas: formulas }),
    );
  };

  const editTitleFormula = (index: number) => {
    pushCursor(tc.k("titleFormulas").at(index));
  };

  const addDetail = () => {
    dispatch(
      updateAt(tc, { ...textComponent, detail: "", detailFormulas: [] }),
    );
  };

  const updateDetail = (text: string, formulas: CustomFormula[]) => {
    dispatch(
      updateAt(tc, {
        ...textComponent,
        detail: text,
        detailFormulas: formulas,
      }),
    );
  };

  const editDetailFormula = (index: number) => {
    pushCursor(tcDetail.k("detailFormulas").at(index));
  };

  const clearDetails = () => {
    dispatch(
      updateAt(tc, {
        ...textComponent,
        detail: undefined,
        detailFormulas: undefined,
      }),
    );
  };

  return (
    <ControlledEditTextLine
      {...{
        textComponent,
        character,
        updateTitle,
        editTitleFormula,
        addDetail,
        updateDetail,
        editDetailFormula,
        clearDetails,
        saveData,
      }}
    />
  );
}
