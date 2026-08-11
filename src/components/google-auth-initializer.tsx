import { useEffect } from "react";
import Spinner from "src/components/spinner";
import { useLocation, useNavigate } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import {
  ensureDriveToken,
  requestDriveToken,
  useDriveAuthStatus,
} from "src/lib/google-auth";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { writeLastDatastore } from "src/lib/last-datastore";

// The interactive half of Drive auth: the consent-popup click. Everything
// else (script loading, token cache, silent refresh) lives in
// `src/lib/google-auth.ts`.
export default function GoogleAuthInitializer() {
  const status = useDriveAuthStatus();
  const { setDatastore } = useDatastoreSelector();
  const navigate = useNavigate();
  const location = useLocation();

  // Carries the caller's errand back after auth, since the token client is a
  // popup and router state survives the flow.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  // Starts the silent path (cached token, then no-UI refresh); the Authorize
  // button below only renders once that's exhausted.
  useEffect(() => {
    void ensureDriveToken();
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    setDatastore(GoogleDriveDatastore);
    writeLastDatastore("drive");
    if (returnTo) {
      navigate(returnTo, { state: location.state, replace: true });
    } else {
      navigate("/sheet");
    }
  }, [status]);

  if (status === "uninitialized" || status === "initializing")
    return (
      <p>
        <Spinner /> Connecting to the Google Drive API...
      </p>
    );
  if (status === "restoring" || status === "ready")
    return (
      <p>
        <Spinner /> Resuming your Google session...
      </p>
    );
  return (
    <button id="authorize_button" onClick={() => void requestDriveToken()}>
      Authorize
    </button>
  );
}
