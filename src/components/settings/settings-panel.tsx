import { useState } from "react";
import classNames from "classnames";
import Modal from "src/components/modal";
import GameSettings from "src/components/settings/game-settings";
import GeneralSettings from "src/components/settings/general-settings";
import GoogleDriveSettings from "src/components/settings/google-drive-settings";
import LocalStorageSettings from "src/components/settings/local-storage-settings";
import TableSettings from "src/components/settings/table-settings";

type Tab = "general" | "game" | "table" | "gdrive" | "local";

const TABS: { id: Tab; label: string; component: JSX.Element }[] = [
  { id: "general", label: "General", component: <GeneralSettings /> },
  { id: "game", label: "Game", component: <GameSettings /> },
  { id: "table", label: "Table", component: <TableSettings /> },
  { id: "gdrive", label: "Google Drive", component: <GoogleDriveSettings /> },
  { id: "local", label: "Local storage", component: <LocalStorageSettings /> },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("general");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <Modal title="Settings" onClose={onClose} className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              className={classNames({ active: id === tab })}
              aria-current={id === tab}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <section className="settings-content">{active.component}</section>
      </div>
    </Modal>
  );
}
