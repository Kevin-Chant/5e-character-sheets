import {
  CLOUD_DEFAULT_HOST,
  Theme,
  useSettings,
} from "src/lib/hooks/use-settings";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import InputField from "../input-field";
import IdentityFields from "../identity-fields";
import AutosaveSettings from "./autosave-settings";
import SettingsSection from "./settings-section";

export default function GeneralSettings() {
  const { settings, updateSetting, resetSettings } = useSettings();
  const { resetDefaultIdentity } = useSharingSessions();
  return (
    <div className="settings-sections">
      <SettingsSection
        title="Appearance"
        description="Choose how the app looks. System follows your device setting."
      >
        <select
          value={settings.theme}
          onChange={(e) => updateSetting("theme", e.target.value as Theme)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </SettingsSection>

      <SettingsSection
        title="Default mode"
        description="Whether sheets open ready to edit or locked for play. You can always switch a sheet with the lock button in the header."
      >
        <select
          value={settings.openInEditMode ? "edit" : "play"}
          onChange={(e) =>
            updateSetting("openInEditMode", e.target.value === "edit")
          }
        >
          <option value="edit">Edit mode</option>
          <option value="play">Play mode</option>
        </select>
      </SettingsSection>

      <AutosaveSettings />

      <SettingsSection
        title="Automatic live sessions"
        description="When you open a Google Drive character you've shared (or that was shared with you), start or join a live co-editing session automatically, so edits sync instead of overwriting each other. Turn off to share manually with the toggle in each sheet."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.autoLiveSession}
            onChange={(e) => updateSetting("autoLiveSession", e.target.checked)}
          />
          Auto-connect shared Drive characters
        </label>
      </SettingsSection>

      <SettingsSection
        title="Ammunition tracking"
        description="Track ammunition (arrows, bolts, …) as counted pools in Equipment, with a remaining count shown next to each ranged weapon. Turn off if your table doesn't bother counting ammo."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.trackAmmunition}
            onChange={(e) => updateSetting("trackAmmunition", e.target.checked)}
          />
          Track ammunition
        </label>
      </SettingsSection>

      <SettingsSection
        title="Criticals on all rolls"
        description="Show a natural 1 or 20 as “Critical Fail”/“Critical Success” on every d20 check, not just attack rolls. Attack to-hit rolls always show criticals (as “Critical Fail”/“Critical Hit”) regardless of this setting."
      >
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.criticalsOnAllRolls}
            onChange={(e) =>
              updateSetting("criticalsOnAllRolls", e.target.checked)
            }
          />
          Show criticals on all d20 checks
        </label>
      </SettingsSection>

      <SettingsSection
        title="Sharing host"
        description={
          <>
            To open a live sharing session, you must connect to a WAMP server
            which handles syncing your changes with other users. A free one
            should be available for use at {CLOUD_DEFAULT_HOST}, but if
            you&apos;re interested you can host one yourself using the{" "}
            <a href="https://github.com/Kevin-Chant/5e-character-sheets">
              GitHub repository
            </a>
            .
          </>
        }
      >
        <InputField
          type="string"
          value={settings.liveEditHost}
          setValue={(value) => updateSetting("liveEditHost", value)}
        />
      </SettingsSection>

      <SettingsSection
        title="Live sharing identity"
        description="Your default name and highlight color in live sessions. You can override these for an individual session when you host or join one."
      >
        <IdentityFields />
      </SettingsSection>

      <SettingsSection
        title="Reset"
        description="Restore every setting on this page to its default. Your characters aren't affected."
      >
        <button
          className="btn-secondary"
          onClick={() => {
            if (window.confirm("Reset all settings to their defaults?")) {
              resetSettings();
              resetDefaultIdentity();
            }
          }}
        >
          Reset to defaults
        </button>
      </SettingsSection>
    </div>
  );
}
