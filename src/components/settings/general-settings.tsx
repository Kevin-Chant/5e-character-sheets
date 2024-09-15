import {
  DEFAULT_LIVE_EDIT_HOST,
  useSettings,
} from "src/lib/hooks/use-settings";
import InputField from "../InputField";

export default function GeneralSettings() {
  const {
    settings: { liveEditHost },
    updateSetting,
  } = useSettings();
  return (
    <div className="column align-flex-start">
      <div className="row">
        <div className="column align-flex-start margin-large">
          <h3>Sharing Host</h3>
          <p>
            To open a live sharing session, you must connect to a WAMP server
            which handles syncing your changes with other users. A free one
            should be available for use at {DEFAULT_LIVE_EDIT_HOST}, but if
            you're interested you can run host it yourself using the{" "}
            <a href="https://github.com/Kevin-Chant/5e-character-sheets">
              GitHub repository
            </a>
            .
          </p>
          <InputField
            type="string"
            value={liveEditHost}
            setValue={(value) => updateSetting("liveEditHost", value)}
          />
        </div>
      </div>
    </div>
  );
}
