import { useState } from "react";
import { readLocalStorage, removeLocalStorage } from "src/lib/local-storage";
import SettingsSection from "./settings-section";

export default function LocalStorageSettings() {
  const [characters, setCharacters] = useState<Record<string, unknown>>(() =>
    readLocalStorage("characters", {}),
  );
  const count = Object.keys(characters).length;
  const kb = new Blob([JSON.stringify(characters)]).size / 1024;

  const clearAll = () => {
    if (
      !window.confirm(
        `Delete all ${count} character${count === 1 ? "" : "s"} stored in this browser? This can't be undone.`,
      )
    )
      return;
    removeLocalStorage("characters");
    setCharacters({});
  };

  return (
    <div className="settings-sections">
      <SettingsSection
        title="Browser storage"
        description="Characters you edit locally are saved in this browser only - they never leave your device and aren't synced anywhere. Clearing your browser data (or using a different browser or device) means you won't see them."
      >
        <p className="settings-value">
          {count} character{count === 1 ? "" : "s"} stored ({kb.toFixed(1)} KB).
        </p>
      </SettingsSection>
      <SettingsSection
        title="Danger zone"
        description="Permanently delete every character saved in this browser. Sheets saved to Google Drive or downloaded to a file are not affected."
      >
        <button
          className="btn-danger"
          onClick={clearAll}
          disabled={count === 0}
        >
          Delete all local characters
        </button>
      </SettingsSection>
    </div>
  );
}
