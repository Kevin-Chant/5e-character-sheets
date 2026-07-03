import React, { useContext, useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";

export const CLOUD_DEFAULT_HOST = "https://live.dndcharactersheets.net";
export const DEFAULT_LIVE_EDIT_HOST =
  import.meta.env.VITE_LIVE_EDIT_HOST ?? CLOUD_DEFAULT_HOST;

export type Theme = "system" | "light" | "dark";

interface Settings {
  liveEditHost: string;
  theme: Theme;
  // Whether edits persist automatically, and how long (ms) to wait after the
  // last edit before doing so. Manual save (⌘S / the save button) works either
  // way.
  autosave: boolean;
  autosaveDelay: number;
  // Whether sheets open ready to edit (vs. locked for play).
  openInEditMode: boolean;
}

function sanitizeSettingValue<K extends keyof Settings>(
  settingsValue: Settings[K],
  settingsKey: K,
): Settings[K] {
  switch (settingsKey) {
    case "liveEditHost": {
      const host = settingsValue as string;
      return (
        host.includes("http://") || host.includes("https://")
          ? host
          : `http://${host}`
      ) as Settings[K];
    }
    case "autosaveDelay":
      return Math.max(0, settingsValue as number) as Settings[K];
    default:
      return settingsValue;
  }
}

interface SettingsContextData {
  settings: Settings;
  updateSetting: (k: keyof Settings, val: Settings[typeof k]) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  liveEditHost: DEFAULT_LIVE_EDIT_HOST,
  theme: "system",
  autosave: true,
  autosaveDelay: 1000,
  openInEditMode: true,
};

export const SettingsContext = React.createContext<SettingsContextData>({
  settings: DEFAULT_SETTINGS,
  updateSetting: (_k, _v) => console.log("Calling default updateSetting"),
  resetSettings: () => console.log("Calling default resetSettings"),
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
      resetSettings: () => setSettings(DEFAULT_SETTINGS),
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
