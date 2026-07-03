import { useEffect, useState } from "react";
import classNames from "classnames";
import { useSettings } from "src/lib/hooks/use-settings";
import SettingsSection from "./settings-section";

// Preset stops the slider snaps between. The number input below stays available
// for any value the presets don't cover.
const DELAY_OPTIONS_S = [0.25, 0.5, 1, 2, 5, 10, 30];

const formatSeconds = (s: number) => (s < 1 ? `${s * 1000}ms` : `${s}s`);

// Slider is discrete, so snap its thumb to whichever preset is closest to the
// current (possibly custom) delay.
const nearestIndex = (seconds: number) => {
  let best = 0;
  for (let i = 1; i < DELAY_OPTIONS_S.length; i++) {
    if (
      Math.abs(DELAY_OPTIONS_S[i] - seconds) <
      Math.abs(DELAY_OPTIONS_S[best] - seconds)
    ) {
      best = i;
    }
  }
  return best;
};

export default function AutosaveSettings() {
  const { settings, updateSetting } = useSettings();
  const seconds = settings.autosaveDelay / 1000;
  // Local draft so partial input (e.g. "1.") doesn't fight the parsed value.
  const [draft, setDraft] = useState(String(seconds));
  useEffect(() => {
    setDraft(String(settings.autosaveDelay / 1000));
  }, [settings.autosaveDelay]);

  const commitDraft = (value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      setDraft(String(settings.autosaveDelay / 1000));
      return;
    }
    updateSetting("autosaveDelay", Math.round(parsed * 1000));
  };

  return (
    <SettingsSection title="Autosave">
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={settings.autosave}
          onChange={(e) => updateSetting("autosave", e.target.checked)}
        />
        Automatically save changes as you edit
      </label>
      {settings.autosave && (
        <>
          <p className="settings-description">
            How long to wait after your last change before saving.
          </p>
          <div className="autosave-control">
            <div className="autosave-slider">
              <input
                type="range"
                min={0}
                max={DELAY_OPTIONS_S.length - 1}
                step={1}
                value={nearestIndex(seconds)}
                onChange={(e) =>
                  updateSetting(
                    "autosaveDelay",
                    Math.round(DELAY_OPTIONS_S[Number(e.target.value)] * 1000),
                  )
                }
                aria-label="Autosave delay"
              />
              <div className="autosave-ticks">
                {DELAY_OPTIONS_S.map((option, i) => (
                  <span
                    key={option}
                    className={classNames("autosave-tick", {
                      active: option === seconds,
                    })}
                    style={{
                      left: `${(i / (DELAY_OPTIONS_S.length - 1)) * 100}%`,
                    }}
                  >
                    {formatSeconds(option)}
                  </span>
                ))}
              </div>
            </div>
            <label className="settings-checkbox">
              <input
                className="settings-delay-input"
                type="number"
                min={0}
                step={0.1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={(e) => commitDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              seconds
            </label>
          </div>
        </>
      )}
    </SettingsSection>
  );
}
