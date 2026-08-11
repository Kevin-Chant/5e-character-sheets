import React, { createContext, useContext, useState } from "react";
import SettingsPanel from "src/components/settings/settings-panel";
import { missingProvider } from "src/lib/missing-provider";

// Whether the settings panel is on screen — distinct from `use-settings`,
// which holds the setting values. `settingsOpen` lets the nav gear be a real
// toggle with `aria-expanded`.

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
