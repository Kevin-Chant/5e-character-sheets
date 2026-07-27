import { useState } from "react";
import classNames from "classnames";
import Modal from "src/components/modal";
import GameSettings from "src/components/settings/game-settings";
import GeneralSettings from "src/components/settings/general-settings";
import GoogleDriveSettings from "src/components/settings/google-drive-settings";
import LocalStorageSettings from "src/components/settings/local-storage-settings";

// Settings, as an overlay rather than a page.
//
// It was the one interruption in the app that was a route, which is why it was
// the one with no way out: level-up, rest, the builder, sharing and every field
// editor are overlays you dismiss and land back in what you were doing. The
// route earned little — the nav gear was its only entry point, and the tab is
// local state, so `/settings` was never addressable past the first tab anyway.
//
// What it cost was your place. Flipping "what players see" mid-fight meant
// leaving `/play` and remounting the board on the way back, which is precisely
// the moment you least want to lose where you were.

type Tab = "general" | "game" | "gdrive" | "local";

const TABS: { id: Tab; label: string; component: JSX.Element }[] = [
  { id: "general", label: "General", component: <GeneralSettings /> },
  { id: "game", label: "Game", component: <GameSettings /> },
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
