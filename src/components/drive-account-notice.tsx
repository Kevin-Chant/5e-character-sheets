import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import {
  dismissAccountSwitchNotice,
  useDriveAccount,
} from "src/lib/hooks/use-drive-account";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";

// Shown when the signed-in Drive account changed: characters didn't
// disappear, they're under the other account. Names both accounts.
export default function DriveAccountNotice() {
  const { account, switchedFrom } = useDriveAccount();
  const { openSettings } = useSettingsPanel();

  if (!switchedFrom) return <></>;

  return (
    <div className="drive-account-notice">
      <FaTriangleExclamation className="drive-account-notice-icon" />
      <div>
        <p>
          You&apos;re signed in to Google Drive as{" "}
          <b>{account?.emailAddress ?? "a different account"}</b>. Characters
          you saved as <b>{switchedFrom}</b> are in that account, not this one —
          nothing has been lost.
        </p>
        <button className="link-button" onClick={openSettings}>
          Switch accounts in Settings
        </button>
      </div>
      <button
        className="icon-btn"
        onClick={dismissAccountSwitchNotice}
        title="Dismiss"
        aria-label="Dismiss"
      >
        <FaXmark />
      </button>
    </div>
  );
}
