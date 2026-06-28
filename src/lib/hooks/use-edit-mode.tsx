import React, { useContext, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";
import { FIELD } from "../data/data-definitions";
import { useCharacter } from "./use-character";

type Mode = "edit" | "play";

// Value fields that change during normal play and so stay editable in play
// mode, even though they open the same editor modal as structural fields.
export const TRACKER_FIELDS = new Set<FIELD>([
  FIELD.currHp,
  FIELD.tempHp,
  FIELD.expendedHitDice,
  FIELD.deathSaves,
  FIELD.exhaustion,
  FIELD.inspiration,
]);

interface EditModeContextData {
  editMode: boolean;
  setEditMode: (edit: boolean) => void;
  toggleMode: () => void;
}

export const EditModeContext = React.createContext<EditModeContextData>({
  editMode: true,
  setEditMode: () => {},
  toggleMode: () => {},
});

export function EditModeContextProvider(props: React.PropsWithChildren) {
  const { character } = useCharacter();
  const uuid = character?.uuid;
  const [modes, setModes] = useState<Record<string, Mode>>(() =>
    readLocalStorage("characterModes", {}),
  );

  const editMode = !uuid || (modes[uuid] ?? "edit") === "edit";

  const setEditMode = (edit: boolean) => {
    if (!uuid) return;
    setModes((current) => {
      const next = { ...current, [uuid]: edit ? "edit" : ("play" as Mode) };
      writeLocalStorage("characterModes", next);
      return next;
    });
  };

  const providerData = useMemo(
    () => ({ editMode, setEditMode, toggleMode: () => setEditMode(!editMode) }),
    [editMode, uuid],
  );

  return (
    <EditModeContext.Provider value={providerData}>
      {props.children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
