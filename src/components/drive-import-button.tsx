import { FaCloudArrowDown } from "react-icons/fa6";
import { useDriveImport } from "src/lib/hooks/use-drive-import";

// Standalone icon button that imports a character shared with the user via
// Google Drive. The underlying logic lives in `useDriveImport` so it can be
// reused (e.g. as a nav overflow-menu item). Only renders when the active
// datastore supports importing.
export default function DriveImportButton() {
  const { supported, busy, handleImport } = useDriveImport();

  if (!supported) return <></>;

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
