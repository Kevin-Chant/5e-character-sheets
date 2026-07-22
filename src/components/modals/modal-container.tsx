import React, { useCallback, useContext, useEffect, useReducer } from "react";
import { Action, updateData } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { CharacterContext, useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue } from "src/lib/fields";

interface ModalProps {
  back: (() => void) | undefined;
  close: () => void;
  title?: string;
}

const SaveContext = React.createContext({
  saveData: (_e?: React.MouseEvent<HTMLButtonElement>, _a?: Action) => {},
  // Persist an action to the real character immediately, without closing the
  // modal — for save-on-change editors (e.g. the skills editor) rather than the
  // draft-then-save-button flow. See `commit` below.
  commit: (_a: Action) => {},
});
export function useSave() {
  return useContext(SaveContext);
}

export default function ModalContainer({
  back,
  close,
  title,
  children,
}: ModalProps & React.PropsWithChildren) {
  const { character: savedCharacter, dispatch: dispatchOuterCharacter } =
    useCharacter();
  const [character, dispatch] = useReducer(reducer, savedCharacter);
  const { popTargetedField, targetedField } = useTargetedField();

  const saveData = (e?: React.MouseEvent<HTMLButtonElement>, a?: Action) => {
    e?.preventDefault();
    if (!targetedField) return;
    dispatchOuterCharacter(
      a ||
        updateData(targetedField, {
          value: getFieldValue(targetedField, character),
        }),
    );
    popTargetedField();
  };

  // Save-on-change: apply an action to the real character now, and mirror it
  // into the local draft so the modal keeps reflecting the saved state. Unlike
  // saveData it does not pop, so the modal stays open for further edits.
  const commit = useCallback(
    (a: Action) => {
      dispatchOuterCharacter(a);
      dispatch(a);
    },
    [dispatchOuterCharacter],
  );

  const keypressListener = useCallback(
    (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close();
        return;
      }
      // Enter saves from simple single-line inputs. Skip rich-text editors
      // (contenteditable), textareas, selects, and buttons so Enter keeps its
      // native meaning there (newline, open dropdown, activate button).
      if (ev.key === "Enter") {
        const target = ev.target as HTMLElement;
        if (
          target.isContentEditable ||
          ["TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
        )
          return;
        ev.preventDefault();
        saveData();
      }
    },
    [close, saveData],
  );

  useEffect(() => {
    window.addEventListener("keydown", keypressListener);
    return () => window.removeEventListener("keydown", keypressListener);
  }, [keypressListener]);

  const providerData = {
    character,
    reset: () => {},
    dispatch,
    // Edits here go to a local draft; undo is the browser's native input undo.
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    unsavedChanges: false,
    setUnsavedChanges: () => {},
    saveError: false,
    saveNow: () => {},
    openSharingSession: () => {},
    closeSharingSession: () => {},
  };
  return (
    <SaveContext.Provider value={{ saveData, commit }}>
      <CharacterContext.Provider value={providerData}>
        <div className="modal-container">
          <div className="modal-background" onClick={close} />
          <div className="modal-content">
            <div className="row space-between modal-titlebar">
              <b className="title font-large">{title}</b>
              <div className="modal-titlebar-buttons">
                {back && (
                  <button className="icon-btn back" onClick={back}>
                    {"<"}
                  </button>
                )}
                <button className="icon-btn close" onClick={close}>
                  x
                </button>
              </div>
            </div>
            {children}
          </div>
        </div>
      </CharacterContext.Provider>
    </SaveContext.Provider>
  );
}
