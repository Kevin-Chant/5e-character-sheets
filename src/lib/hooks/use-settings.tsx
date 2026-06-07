import React, { useContext, useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";

export const CLOUD_DEFAULT_HOST = "http://35.87.176.174:9000";
export const DEFAULT_LIVE_EDIT_HOST =
  import.meta.env.VITE_LIVE_EDIT_HOST ?? CLOUD_DEFAULT_HOST;

export type Theme = "system" | "light" | "dark";

interface Settings {
  liveEditHost: string;
  theme: Theme;
}

function sanitizeSettingValue<K extends keyof Settings>(
  settingsValue: Settings[K],
  settingsKey: K,
): Settings[K] {
  switch (settingsKey) {
    case "liveEditHost":
      return (
        settingsValue.includes("http://") || settingsValue.includes("https://")
          ? settingsValue
          : `http://${settingsValue}`
      ) as Settings[K];
    default:
      return settingsValue;
  }
}

interface SettingsContextData {
  settings: Settings;
  updateSetting: (k: keyof Settings, val: Settings[typeof k]) => void;
}

const DEFAULT_SETTINGS: Settings = {
  liveEditHost: DEFAULT_LIVE_EDIT_HOST,
  theme: "system",
};

export const SettingsContext = React.createContext<SettingsContextData>({
  settings: DEFAULT_SETTINGS,
  updateSetting: (_k, _v) => console.log("Calling default updateSetting"),
});

export function SettingsContextProvider(props: React.PropsWithChildren) {
  const [initialized, setInitialized] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const providerData = useMemo(() => {
    return {
      settings,
      updateSetting: (
        settingsKey: keyof Settings,
        settingsValue: Settings[typeof settingsKey],
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

  // Reflect the chosen theme onto <html>. "system" removes the attribute so the
  // prefers-color-scheme media query in index.css takes over.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", settings.theme);
    }
  }, [settings.theme]);

  return (
    <SettingsContext.Provider value={providerData}>
      {props.children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
