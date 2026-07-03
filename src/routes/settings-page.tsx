import { useState } from "react";
import classNames from "classnames";
import GeneralSettings from "src/components/settings/general-settings";
import GoogleDriveSettings from "src/components/settings/google-drive-settings";
import LocalStorageSettings from "src/components/settings/local-storage-settings";

type Tab = "general" | "gdrive" | "local";

const TABS: { id: Tab; label: string; component: JSX.Element }[] = [
  { id: "general", label: "General", component: <GeneralSettings /> },
  { id: "gdrive", label: "Google Drive", component: <GoogleDriveSettings /> },
  { id: "local", label: "Local storage", component: <LocalStorageSettings /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={classNames({ active: id === tab })}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="settings-content">{active.component}</section>
    </div>
  );
}
