import { Link, useNavigate } from "react-router-dom";
import {
  hasStoredGrant,
  revokeDriveAccess,
  signOutOfDrive,
} from "src/lib/google-drive";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useGoogleOauth } from "src/lib/hooks/use-google-oauth";
import { clearLastDatastore, readLastDatastore } from "src/lib/last-datastore";
import SettingsSection from "./settings-section";

export default function GoogleDriveSettings() {
  const { googleOauthReady, setGoogleOauthReady } = useGoogleOauth();
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  const navigate = useNavigate();

  const connected = googleOauthReady || hasStoredGrant();

  // Return to a clean, disconnected state and send the user to the home picker
  // so they're not left on a Drive-backed sheet with no session.
  const disconnect = () => {
    setGoogleOauthReady(false);
    if (readLastDatastore() === "drive") clearLastDatastore();
    setDatastore(undefined);
    reset();
    navigate("/", { state: { picker: true } });
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
          <Link to="/auth">
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
