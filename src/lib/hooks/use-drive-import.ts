import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

// Opens the Google Picker so the user can pull in a character document someone
// shared with them, then loads it and navigates to the sheet. Shared by the
// nav overflow menu and any standalone import button. `supported` reflects
// whether the active datastore can import (currently only Google Drive).
export function useDriveImport() {
  const { datastore } = useDatastoreSelector();
  const { importCharacter } = useDatastore();
  const { dispatch } = useCharacter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const supported = !!datastore?.importSharedCharacter;

  const handleImport = async () => {
    setBusy(true);
    try {
      const character = await importCharacter();
      if (character) {
        dispatch(loadFullCharacter(character));
        navigate("/sheet");
      }
    } catch (err) {
      console.error("Failed to import shared character", err);
    } finally {
      setBusy(false);
    }
  };

  return { supported, busy, handleImport };
}
