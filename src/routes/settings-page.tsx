import { useState } from "react";
import GeneralSettings from "src/components/settings/general-settings";
import GoogleDriveSettings from "src/components/settings/google-drive-settings";
import LocalStorageSettings from "src/components/settings/local-storage-settings";

export default function SettingsPage() {
  const [tab, setTab] = useState<"general" | "gdrive" | "local">("general");
  let settingsComponent = <></>;
  switch (tab) {
    case "general":
      settingsComponent = <GeneralSettings />;
      break;
    case "gdrive":
      settingsComponent = <GoogleDriveSettings />;
      break;
    case "local":
      settingsComponent = <LocalStorageSettings />;
  }
  return (
    <table className="full-width">
      <tbody>
        <tr>
          <td style={{ width: "25%" }}>
            <div className="column align-flex-start">
              <button onClick={() => setTab("general")}>
                General settings
              </button>
              <button onClick={() => setTab("gdrive")}>
                Google Drive settings
              </button>
              <button onClick={() => setTab("local")}>
                Local storage settings
              </button>
            </div>
          </td>
          <td style={{ width: "75%" }}>{settingsComponent}</td>
        </tr>
        {/* <tr>
        <td colSpan={2}>Buy me a coffee</td>
      </tr> */}
      </tbody>
    </table>
  );
}
