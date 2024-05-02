import React, {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import {
  Action,
  loadFullCharacter,
  updateData,
} from "src/lib/hooks/reducers/actions";
import reducer from "src/lib/hooks/reducers/reducer";
import {
  CharacterContext,
  CharacterContextProvider,
  useCharacter,
} from "src/lib/hooks/use-character";
import { useTargetedField } from "src/lib/hooks/use-targeted-field";
import { getFieldValue } from "src/lib/utils";

interface ModalProps {
  back: (() => void) | undefined;
  close: () => void;
}

const SaveContext = React.createContext({
  saveData: (e?: React.MouseEvent<HTMLButtonElement>, a?: Action) => {},
});
export function useSave() {
  return useContext(SaveContext);
}

export default function ModalContainer({
  back,
  close,
  children,
}: ModalProps & React.PropsWithChildren) {
  const keypressListener = useCallback(
    (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        close();
      }
    },
    [close]
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
        })
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
    sharingSessionOpen: false,
  };
  return (
    <SaveContext.Provider value={{ saveData }}>
      <CharacterContext.Provider value={providerData}>
        <div className="modal-container">
          <div className="modal-background" onClick={close} />
          <div className="modal-content">
            <div className="row space-between flex-direction-row-reverse">
              <div className="close">
                <button onClick={close}>x</button>
              </div>
              {back && (
                <div className="back">
                  <button onClick={back}>{"<"}</button>
                </div>
              )}
            </div>
            {children}
          </div>
        </div>
      </CharacterContext.Provider>
    </SaveContext.Provider>
  );
}
