import React, { useContext, useEffect, useMemo, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "../local-storage";
import { missingProvider } from "../missing-provider";
import { CritMode } from "../roll";
import { RestVariant } from "../rest";

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
  // Whether opening a shared Google Drive character automatically starts/joins a
  // live co-editing session (owner hosts, recipient joins). Off falls back to the
  // manual share toggle.
  autoLiveSession: boolean;
  // Whether to track ammunition. Off hides the Ammunition section and the
  // per-weapon remaining-ammo count — many tables don't bother with it.
  trackAmmunition: boolean;
  // Whether to track encumbrance. Off hides the per-item weight column and the
  // carrying-capacity readout — many tables ignore encumbrance entirely.
  trackEncumbrance: boolean;
  // Display unit for weights. Values are always STORED in pounds (5e carrying
  // capacity is defined in lb); "kg" only converts at render time.
  weightUnit: "lb" | "kg";
  // Whether a natural 1/20 shows as "Critical Fail"/"Critical Success" on *every*
  // d20 check. Off (default), the crit callout only appears on attack to-hit
  // rolls (as "Critical Fail"/"Critical Hit").
  criticalsOnAllRolls: boolean;
  // How a critical hit inflates damage — RAW (double the dice) plus the two
  // most common house rules. See `CritMode` in `src/lib/roll.ts`.
  criticalDamageMode: CritMode;
  // Exploding crits: after a critical hit, reroll the d20 and stack another set
  // of critical dice for each repeat crit. Compounds with `criticalDamageMode`.
  explodingCriticals: boolean;
  // --- Rests (see `src/lib/rest.ts`; the four `longRest*` keys and the
  // variant together are the `RestRules` the planner reads) ---
  // Rest lengths: the DMG's Epic Heroism / Gritty Realism pacing variants. This
  // only changes the durations the rest UI announces — the mechanical effects of
  // a rest are identical.
  restVariant: RestVariant;
  // How many spent hit dice a long rest gives back: RAW is half your total
  // (minimum one), and "all" is the near-universal house rule.
  longRestHitDiceRecovery: "half" | "all" | "none";
  // Whether a long rest restores all HP (RAW) or none — the DMG's Slow Natural
  // Healing variant, where you spend hit dice at the end of a long rest instead.
  longRestHpRecovery: "full" | "none";
  // How much exhaustion a long rest sheds: one level (RAW), all of it, or none.
  longRestExhaustionRecovery: "one" | "all" | "none";
  // Whether temporary HP expire at the end of a long rest (RAW).
  longRestClearsTempHp: boolean;
  // Whether a long rest prompts prepared casters to re-pick their prepared
  // spells. Off skips straight to the summary.
  promptSpellPreparation: boolean;
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
  autoLiveSession: true,
  trackAmmunition: true,
  trackEncumbrance: true,
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
