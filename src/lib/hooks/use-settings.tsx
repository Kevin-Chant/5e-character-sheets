import React, { useContext, useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";
import { missingProvider } from "../missing-provider";
import { CritMode } from "../roll";
import { RestVariant } from "../rest";
import { DEFAULT_SHARING, SharingLevel } from "../play/encounter";

export const CLOUD_DEFAULT_HOST = "https://live.dndcharactersheets.net";
export const DEFAULT_LIVE_EDIT_HOST =
  import.meta.env.VITE_LIVE_EDIT_HOST ?? CLOUD_DEFAULT_HOST;

export type Theme = "system" | "light" | "dark";

export interface Settings {
  liveEditHost: string;
  theme: Theme;
  // Whether edits autosave, and the debounce delay (ms). Manual save works either way.
  autosave: boolean;
  autosaveDelay: number;
  // Whether sheets open ready to edit vs. locked for play.
  openInEditMode: boolean;
  // Whether opening a shared Drive character auto-starts/joins a live
  // co-editing session; off falls back to the manual share toggle.
  autoLiveSession: boolean;
  // Off hides the Ammunition section and per-weapon remaining-ammo count.
  trackAmmunition: boolean;
  // Off hides the per-item weight column and carrying-capacity readout.
  trackEncumbrance: boolean;
  // Off hides personality traits/ideals/bonds/flaws from the sheet and the
  // creation wizard; existing data is kept, just not shown.
  trackPersonality: boolean;
  // Display unit; values are always stored in pounds, "kg" only converts at render.
  weightUnit: "lb" | "kg";
  // Off (default): crit callout only on attack to-hit rolls. On: every d20 check.
  criticalsOnAllRolls: boolean;
  // RAW (double dice) plus two common house rules. See `CritMode` in `src/lib/roll.ts`.
  criticalDamageMode: CritMode;
  // Reroll the d20 after a crit and stack another set of crit dice per repeat;
  // compounds with criticalDamageMode.
  explodingCriticals: boolean;
  // Rests: see `src/lib/rest.ts`; these plus restVariant form the `RestRules` the planner reads.
  // DMG Epic Heroism/Gritty Realism pacing; only affects announced durations, not mechanics.
  restVariant: RestVariant;
  // RAW is half total hit dice (min one); "all" is a common house rule.
  longRestHitDiceRecovery: "half" | "all" | "none";
  // "none" is the DMG Slow Natural Healing variant (hit dice spent instead).
  longRestHpRecovery: "full" | "none";
  longRestExhaustionRecovery: "one" | "all" | "none";
  longRestClearsTempHp: boolean;
  // Off skips straight to the rest summary instead of prompting spell re-prep.
  promptSpellPreparation: boolean;
  // Table policy a new game starts from. Applied when a table is opened and
  // copied onto the encounter there — see `encounterForTable`. Changing one
  // never reaches a game already running.
  defaultSharing: SharingLevel;
  defaultHideDeathSaves: boolean;
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

export const DEFAULT_SETTINGS: Settings = {
  liveEditHost: DEFAULT_LIVE_EDIT_HOST,
  theme: "system",
  autosave: true,
  autosaveDelay: 1000,
  openInEditMode: true,
  autoLiveSession: true,
  trackAmmunition: true,
  trackEncumbrance: true,
  trackPersonality: true,
  weightUnit: "lb",
  criticalsOnAllRolls: false,
  criticalDamageMode: "raw",
  explodingCriticals: false,
  restVariant: "standard",
  longRestHitDiceRecovery: "half",
  longRestHpRecovery: "full",
  longRestExhaustionRecovery: "one",
  longRestClearsTempHp: true,
  promptSpellPreparation: true,
  defaultSharing: DEFAULT_SHARING,
  defaultHideDeathSaves: false,
};

export const SettingsContext = React.createContext<SettingsContextData>({
  settings: DEFAULT_SETTINGS,
  updateSetting: missingProvider("updateSetting"),
  resetSettings: missingProvider("resetSettings"),
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
