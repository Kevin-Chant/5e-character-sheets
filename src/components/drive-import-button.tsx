import { useState } from "react";
import { FaCloudArrowDown } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

// Opens the Google Picker so the user can pull in a character document someone
// shared with them, then loads it. Only rendered when the active datastore
// supports importing (currently Google Drive).
export default function DriveImportButton() {
  const { datastore } = useDatastoreSelector();
  const { importCharacter } = useDatastore();
  const { dispatch } = useCharacter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!datastore?.importSharedCharacter) return <></>;

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

  return (
    <button
      className="margin-medium"
      onClick={handleImport}
      disabled={busy}
      title="Import a character shared with you"
    >
      <FaCloudArrowDown />
    </button>
  );
}
