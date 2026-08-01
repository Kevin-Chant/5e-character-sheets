import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  hasStoredGrant,
  revokeDriveAccess,
  signOutOfDrive,
  useDriveAuthStatus,
} from "src/lib/google-auth";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { clearLastDatastore, readLastDatastore } from "src/lib/last-datastore";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";
import SettingsSection from "./settings-section";

export default function GoogleDriveSettings() {
  const authStatus = useDriveAuthStatus();
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  const navigate = useNavigate();
  const location = useLocation();
  const { closeSettings } = useSettingsPanel();

  const connected = authStatus === "ready" || hasStoredGrant();

  // Return to a clean, disconnected state and send the user to the front door
  // so they're not left on a Drive-backed sheet with no session. Clearing the
  // remembered mode is what makes the hub ask the storage question again
  // instead of offering a door to a backend this browser just signed out of.
  // (signOutOfDrive/revokeDriveAccess already dropped the token and flipped
  // the auth status; this clears the app state built on top of it.)
  const disconnect = () => {
    if (readLastDatastore() === "drive") clearLastDatastore();
    setDatastore(undefined);
    reset();
    closeSettings();
    navigate("/");
  };

  const handleSignOut = () => {
    signOutOfDrive();
    disconnect();
  };

  const handleRevoke = async () => {
    if (
      !window.confirm(
        "Revoke this app's access to your Google Drive? You'll need to grant permission again next time you sign in.",
      )
    )
      return;
    await revokeDriveAccess();
    disconnect();
  };

  if (!connected) {
    return (
      <div className="settings-sections">
        <SettingsSection
          title="Google Drive"
          description="You're not connected to Google Drive."
        >
          {/* Connecting is a route (the OAuth popup needs one), so the panel
              steps out of the way and asks to be returned to the surface you
              opened it from — not to /sheet, which is where this used to land
              you regardless of where you started. */}
          <Link
            to="/auth"
            state={{ returnTo: location.pathname }}
            onClick={closeSettings}
          >
            <button className="btn-primary">Connect Google Drive</button>
          </Link>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="settings-sections">
      <SettingsSection
        title="Account"
        description="You're connected to Google Drive. This app can only read and write the character sheets it creates in your Drive - it can't see any of your other files."
      />
      <SettingsSection
        title="Sign out"
        description="Disconnect this browser from Google Drive. Your sheets stay in Drive and you can sign back in anytime without re-granting access."
      >
        <button onClick={handleSignOut}>Sign out</button>
      </SettingsSection>
      <SettingsSection
        title="Revoke access"
        description="Completely revoke this app's permission to your Google Drive. Your character files remain in Drive, but you'll be asked to grant access again next time you connect."
      >
        <button className="btn-danger" onClick={handleRevoke}>
          Revoke access
        </button>
      </SettingsSection>
    </div>
  );
}
