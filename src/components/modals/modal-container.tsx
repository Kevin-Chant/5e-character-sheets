import React, { useCallback, useContext, useEffect, useReducer } from "react";
import { Action, updateData } from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import { CharacterContext, useCharacter } from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue } from "src/lib/utils";

interface ModalProps {
  back: (() => void) | undefined;
  close: () => void;
  title?: string;
}

const SaveContext = React.createContext({
  saveData: (_e?: React.MouseEvent<HTMLButtonElement>, _a?: Action) => {},
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
  const keypressListener = useCallback(
    (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close();
      }
    },
    [close],
  );

  useEffect(() => {
    window.addEventListener("keydown", keypressListener);
    return () => window.removeEventListener("keydown", keypressListener);
  }, [keypressListener]);

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

  const providerData = {
    character,
    reset: () => {},
    dispatch,
    unsavedChanges: false,
    setUnsavedChanges: () => {},
    openSharingSession: () => {},
    closeSharingSession: () => {},
  };
  return (
    <SaveContext.Provider value={{ saveData }}>
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
