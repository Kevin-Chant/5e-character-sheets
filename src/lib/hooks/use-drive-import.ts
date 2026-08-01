import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { ImportHint } from "src/lib/types";

// Opens the Google Picker so the user can pull in a character document someone
// shared with them, then loads it and navigates to the sheet. Shared by the
// nav overflow menu, any standalone import button, and the `/import/<fileId>`
// link in the Drive share email — which passes a `hint` naming the file it
// meant, so the picker opens on that one character instead of on everything
// ever shared with this account. `supported` reflects whether the active
// datastore can import (currently only Google Drive).
//
// `handleImport` resolves to whether a character was actually opened, so a
// caller that has nothing else on screen (the import route) can tell a cancel
// from a success; the menu item ignores it.
export function useDriveImport() {
  const { datastore } = useDatastoreSelector();
  const { importCharacter } = useDatastore();
  const { dispatch } = useCharacter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const supported = !!datastore?.importSharedCharacter;

  const handleImport = async (hint?: ImportHint): Promise<boolean> => {
    setBusy(true);
    try {
      const character = await importCharacter(hint);
      if (character) {
        dispatch(loadPersistedCharacter(character));
        navigate("/sheet");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to import shared character", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { supported, busy, handleImport };
}
