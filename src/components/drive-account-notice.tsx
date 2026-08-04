import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import {
  dismissAccountSwitchNotice,
  useDriveAccount,
} from "src/lib/hooks/use-drive-account";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";

// "Where did my characters go?"
//
// They're in the other Google account. This is the only failure in the app that
// presents as data loss while nothing is wrong, it can't be fixed by retrying,
// and every affordance the user has — reload, sign out, sign back in — silently
// returns them to the same account. So it gets an explanation rather than an
// empty list, and the explanation names both accounts, because knowing which
// one you *were* in is what makes the fix obvious.
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
