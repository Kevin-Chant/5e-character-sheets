import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { ImportHint } from "src/lib/types";

// Opens the Google Picker to import a shared character, then loads it and
// navigates to the sheet. `hint` (from the `/import/<fileId>` link) pre-queries
// the picker to one file. `supported` reflects whether the active datastore
// can import (currently only Drive). `handleImport` resolves to whether a
// character was opened, so the import route can tell a cancel from a success.
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
