import { useSettings } from "src/lib/hooks/use-settings";
import { SharingLevel } from "src/lib/play/encounter";
import TablePolicyFields from "src/components/play/table-policy-fields";
import SettingsSection from "./settings-section";

// What a table you open starts from. Copied onto the game once, at hosting, so
// nothing here reaches a game already running — that one is changed from its
// own panel.
export default function TableSettings() {
  const { settings, updateSetting } = useSettings();
  return (
    <div className="settings-sections">
      <SettingsSection
        title="What players see"
        description="How much of the table's health your players see of each other and the monsters. Your own board always shows the numbers. A game you're already running keeps whatever it was opened with — change that one from Table settings at the table."
      >
        <TablePolicyFields
          idPrefix="defaults"
          sharing={settings.defaultSharing}
          onSharing={(level: SharingLevel) =>
            updateSetting("defaultSharing", level)
          }
          hideDeathSaves={settings.defaultHideDeathSaves}
          onHideDeathSaves={(hide) =>
            updateSetting("defaultHideDeathSaves", hide)
          }
        />
      </SettingsSection>
    </div>
  );
}
