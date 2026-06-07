import {
  CLOUD_DEFAULT_HOST,
  Theme,
  useSettings,
} from "src/lib/hooks/use-settings";
import InputField from "../InputField";

export default function GeneralSettings() {
  const { settings, updateSetting } = useSettings();
  return (
    <div className="column align-flex-start">
      <div className="row">
        <div className="column align-flex-start margin-large">
          <h3>Appearance</h3>
          <p>Choose how the app looks. System follows your device setting.</p>
          <select
            value={settings.theme}
            onChange={(e) => updateSetting("theme", e.target.value as Theme)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div className="column align-flex-start margin-large">
          <h3>Sharing Host</h3>
          <p>
            To open a live sharing session, you must connect to a WAMP server
            which handles syncing your changes with other users. A free one
            should be available for use at {CLOUD_DEFAULT_HOST}, but if
            you&apos;re interested you can run host it yourself using the{" "}
            <a href="https://github.com/Kevin-Chant/5e-character-sheets">
              GitHub repository
            </a>
            .
          </p>
          <InputField
            type="string"
            value={settings.liveEditHost}
            setValue={(value) => updateSetting("liveEditHost", value)}
          />
        </div>
      </div>
    </div>
  );
}
