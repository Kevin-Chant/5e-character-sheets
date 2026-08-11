import { FaCloudArrowDown } from "react-icons/fa6";
import { useDriveImport } from "src/lib/hooks/use-drive-import";

// Imports a character shared via Google Drive; logic lives in `useDriveImport`.
// Renders nothing when the active datastore doesn't support importing.
export default function DriveImportButton() {
  const { supported, busy, handleImport } = useDriveImport();

  if (!supported) return <></>;

  return (
    <button
      className="margin-medium"
      onClick={() => handleImport()}
      disabled={busy}
      title="Import a character shared with you"
    >
      <FaCloudArrowDown />
    </button>
  );
}
