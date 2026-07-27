import React, { createContext, useContext, useState } from "react";
import SettingsPanel from "src/components/settings/settings-panel";
import { missingProvider } from "src/lib/missing-provider";

// Mounts the settings panel once and exposes open/close, mirroring
// `RestProvider` and `LevelUpProvider`. Distinct from `use-settings`, which
// holds the settings *values* — this one is only about whether the panel is on
// screen.
//
// `settingsOpen` is exposed so the nav gear can be a real toggle (and say so
// with `aria-expanded`) rather than a link you can only escape by navigating
// somewhere else.

interface SettingsPanelContextData {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const SettingsPanelContext = createContext<SettingsPanelContextData>({
  settingsOpen: false,
  openSettings: missingProvider("openSettings"),
  closeSettings: missingProvider("closeSettings"),
});

export function SettingsPanelProvider({ children }: React.PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <SettingsPanelContext.Provider
      value={{
        settingsOpen: open,
        openSettings: () => setOpen(true),
        closeSettings: close,
      }}
    >
      {children}
      {open && <SettingsPanel onClose={close} />}
    </SettingsPanelContext.Provider>
  );
}

export const useSettingsPanel = () => useContext(SettingsPanelContext);
