import React from "react";

import { useLoadedCharacter } from "src/lib/hooks/use-character";
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
  // Optional sub-section heading; omit when the modal already shows a title.
  title?: string;
  // Replaces the whole Name field for callers with their own name input (e.g.
  // the equipment editor's catalog type-ahead). Details field unaffected.
  titleSlot?: React.ReactNode;
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
  titleSlot,
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
        {title && <b className="title edit-group-title">{title}</b>}
        <div className="column edit-text-line-fields">
          {titleSlot ?? (
            <div className="field">
              <span className="field-label">Name</span>
              <EditTextWithFormulas
                text={textComponent.title}
                formulas={textComponent.titleFormulas}
                character={character}
                onChange={updateTitle}
                onEditFormula={editTitleFormula}
                placeholder="Name (insert values for stats)"
              />
            </div>
          )}
          {isTextComponentWithDetail(textComponent) ? (
            <div className="field">
              <div className="row space-between field-label-row">
                <span className="field-label">Details</span>
                <button
                  className="btn-text"
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
              className="btn-text add-detail-btn"
              onClick={(e) => {
                e.preventDefault();
                addDetail();
              }}
            >
              + Add details
            </button>
          )}
        </div>
        {saveData && (
          <button className="btn-primary edit-save" onClick={saveData}>
            Save
          </button>
        )}
      </div>
    </form>
  );
}

export default function EditTextLine() {
  const { character, dispatch } = useLoadedCharacter();
  const { targetedField, subField, pushCursor } = useTargetedField();
  const { saveData } = useSave();

  if (!targetedField || !subField) return <></>;

  const existing = traverse(subField, getFieldValue(targetedField, character));

  // A not-yet-created entry edits a blank draft, persisted only on save.
  const textComponent: TextComponent = isTextComponent(existing)
    ? existing
    : { title: "", titleFormulas: [] };

  const tc = fromStack<TextComponent>(targetedField, subField);
  // `detailFormulas` only exists on the with-details variant of the union;
  // this narrower cursor unlocks it for the branch where details already exist.
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
