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

  // The account is shared app-wide (the switch notice has to outlive this
  // panel); the counts are only wanted here, so they're fetched here. Both
  // wait for a live token — `hasStoredGrant()` says a grant exists, not that
  // gapi is holding a token.
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

  // Switching accounts changes what every Drive-backed surface is looking at,
  // so the open sheet (which belongs to the account we just left) is cleared
  // and the list re-fetched. The datastore object is identical either side of
  // the switch, so nothing would refresh on its own.
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
    // Drop the cached account so signing back in re-reads it, but keep the
    // remembered email: noticing that you came back as someone else is the
    // whole point, and that comparison has to survive the sign-out.
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
    // No grant left to come back to, so there's nothing for a remembered
    // account to contradict — unlike sign-out, forgetting it is right here.
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
        {/* Which account is signed in is the thing you check when sheets are
            "missing" — they're usually in the other Google account. So the
            unresolved states say so rather than rendering nothing. */}
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
        {/* A full Drive is the one failure a save can't retry its way out of,
            and it surfaces as a generic "couldn't save" — so the number that
            explains it belongs where you'd go looking. */}
        {account?.usage !== undefined && account.limit !== undefined && (
          <p className="settings-value text-muted">
            Drive storage: {formatBytes(account.usage)} of{" "}
            {formatBytes(account.limit)} used.
          </p>
        )}
        {/* Signing out and back in lands on the *same* account — the sign-in
            path is silent by design — so without this there is no route from
            one Google account to the other, and no way to act on the notice
            that says you're in the wrong one. */}
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
