import { useCallback, useEffect, useState } from "react";
import { FaDownload } from "react-icons/fa6";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  hasStoredGrant,
  revokeDriveAccess,
  signOutOfDrive,
  switchDriveAccount,
  useDriveAuthStatus,
} from "src/lib/google-auth";
import {
  countDriveCharacters,
  DriveCharacterCounts,
  loadAllDriveCharacters,
} from "src/datastores/google-drive-datastore";
import Spinner from "src/components/spinner";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import {
  forgetDriveAccount,
  forgetDriveAccountEntirely,
  reloadDriveAccount,
  useDriveAccount,
} from "src/lib/hooks/use-drive-account";
import { clearLastDatastore, readLastDatastore } from "src/lib/last-datastore";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";
import { downloadCharacterBundle } from "src/lib/character-bundle";
import SettingsSection from "./settings-section";

// Drive reports bytes; nobody reads bytes. Base-10 units to match what Google
// itself shows for the same quota.
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

export default function GoogleDriveSettings() {
  const authStatus = useDriveAuthStatus();
  const { setDatastore } = useDatastoreSelector();
  const { refresh: refreshCharacters } = useDatastore();
  const { reset } = useCharacter();
  const navigate = useNavigate();
  const location = useLocation();
  const { closeSettings } = useSettingsPanel();

  const connected = authStatus === "ready" || hasStoredGrant();

  // The account is shared app-wide; counts are only wanted here.
  const { account, failed: accountFailed } = useDriveAccount();
  const [counts, setCounts] = useState<DriveCharacterCounts>();
  const [countsFailed, setCountsFailed] = useState(false);
  const [busy, setBusy] = useState("");

  const loadCounts = useCallback(() => {
    let cancelled = false;
    setCounts(undefined);
    setCountsFailed(false);
    void countDriveCharacters().then(
      (next) => {
        if (!cancelled) setCounts(next);
      },
      (err) => {
        console.error("Could not count the characters in Drive", err);
        if (!cancelled) setCountsFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "ready") return;
    return loadCounts();
  }, [authStatus, loadCounts]);

  // The datastore object is identical either side of the switch, so nothing
  // refreshes on its own — clear the open sheet and re-fetch explicitly.
  const handleSwitchAccount = async () => {
    setBusy("switch");
    try {
      if (!(await switchDriveAccount())) return;
      await reloadDriveAccount();
      reset();
      refreshCharacters();
      loadCounts();
      navigate("/sheet");
    } finally {
      setBusy("");
    }
  };

  const handleExportAll = async () => {
    setBusy("export");
    try {
      const characters = await loadAllDriveCharacters();
      if (characters.length === 0) {
        window.alert("There's nothing in this Drive account to export.");
        return;
      }
      downloadCharacterBundle(characters, new Date().toISOString());
    } catch (err) {
      console.error("Could not export the Drive characters", err);
      window.alert("Couldn't read your characters out of Drive. Try again?");
    } finally {
      setBusy("");
    }
  };

  // signOutOfDrive/revokeDriveAccess already dropped the token; this clears
  // the app state built on top of it and returns to the front door.
  const disconnect = () => {
    if (readLastDatastore() === "drive") clearLastDatastore();
    setDatastore(undefined);
    reset();
    closeSettings();
    navigate("/");
  };

  const handleSignOut = () => {
    signOutOfDrive();
    // Drop the cached account so signing back in re-reads it, but keep the
    // remembered email — the account-switch comparison depends on it.
    forgetDriveAccount();
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
    forgetDriveAccountEntirely();
    disconnect();
  };

  if (!connected) {
    return (
      <div className="settings-sections">
        <SettingsSection
          title="Google Drive"
          description="You're not connected to Google Drive."
        >
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
        description={
          <>
            You&apos;re connected to Google Drive
            {account?.emailAddress && (
              <>
                {" - as "}
                <code className="settings-account-email">
                  {account.emailAddress}
                </code>
              </>
            )}
            . This app can only read and write the character sheets it creates
            in your Drive - it can&apos;t see any of your other files.
          </>
        }
      >
        {authStatus !== "ready" && !accountFailed && (
          <p className="settings-value text-muted">
            Checking your Google session <Spinner />
          </p>
        )}
        {accountFailed && (
          <p className="settings-value text-muted">
            Couldn&apos;t reach Drive to check which account this is.
          </p>
        )}
        {account?.usage !== undefined && account.limit !== undefined && (
          <p className="settings-value text-muted">
            Drive storage: {formatBytes(account.usage)} of{" "}
            {formatBytes(account.limit)} used.
          </p>
        )}
        <button
          onClick={() => void handleSwitchAccount()}
          disabled={!!busy || authStatus !== "ready"}
        >
          {busy === "switch" ? (
            <>
              Switching <Spinner />
            </>
          ) : (
            "Use a different Google account"
          )}
        </button>
      </SettingsSection>
      <SettingsSection
        title="Characters in Drive"
        description="Where your sheets live in this account. Private ones are in a hidden app folder only this app can see; shareable ones are ordinary .5echar documents in My Drive, which is what lets you send one to someone."
      >
        {counts ? (
          <ul className="settings-value settings-count-list">
            <li>
              <b>{counts.privateCount}</b> private
            </li>
            <li>
              <b>{counts.sharedCount}</b> shareable (owned by you)
            </li>
            <li>
              <b>{counts.importedCount}</b> shared with you by someone else
            </li>
          </ul>
        ) : (
          <p className="settings-value text-muted">
            {countsFailed ? (
              "Couldn't count the characters in this account."
            ) : (
              <>
                Counting <Spinner />
              </>
            )}
          </p>
        )}
      </SettingsSection>
      <SettingsSection
        title="Back up everything"
        description="Download every character in this Drive account as one file. Import it from the same menu you'd import a single sheet with - so a backup restores the way a shared character does."
      >
        <button onClick={() => void handleExportAll()} disabled={!!busy}>
          {busy === "export" ? (
            <>
              Reading your characters <Spinner />
            </>
          ) : (
            <>
              <FaDownload /> Download a backup
            </>
          )}
        </button>
      </SettingsSection>
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
