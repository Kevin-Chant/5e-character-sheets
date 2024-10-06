import React, { useContext, useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";

export const DEFAULT_LIVE_EDIT_HOST = "http://35.87.176.174:9000";

interface Settings {
  liveEditHost: string;
}

function sanitizeSettingValue(
  settingsValue: Settings[typeof settingsKey],
  settingsKey: keyof Settings
) {
  switch (settingsKey) {
    case "liveEditHost":
      return settingsValue.includes("http://") ||
        settingsValue.includes("https://")
        ? settingsValue
        : `http://${settingsValue}`;
  }
}

interface SettingsContextData {
  settings: Settings;
  updateSetting: (k: keyof Settings, val: Settings[typeof k]) => void;
}

export const SettingsContext = React.createContext<SettingsContextData>({
  settings: {
    liveEditHost: DEFAULT_LIVE_EDIT_HOST,
  },
  updateSetting: (_k, _v) => console.log("Calling default updateSetting"),
});

export function SettingsContextProvider(props: React.PropsWithChildren) {
  const [initialized, setInitialized] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    liveEditHost: DEFAULT_LIVE_EDIT_HOST,
  });
  const providerData = useMemo(() => {
    return {
      settings,
      updateSetting: (
        settingsKey: keyof Settings,
        settingsValue: Settings[typeof settingsKey]
      ) => {
        setSettings((currentSettings) => ({
          ...currentSettings,
          [settingsKey]: sanitizeSettingValue(settingsValue, settingsKey),
        }));
      },
    };
  }, [settings, setSettings]);

  useEffect(() => {
    setSettings((originalSettings) => ({
      ...originalSettings,
      ...readLocalStorage("settings", {}),
    }));
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      writeLocalStorage("settings", settings);
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={providerData}>
      {props.children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
