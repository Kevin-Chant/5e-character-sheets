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

// The interactive half of Drive auth. All the machinery (script loading,
// token cache, silent refresh) lives in `src/lib/google-auth.ts` and can run
// from anywhere; this route exists for the one step that needs a click — the
// consent popup — and for flows that want a page to send someone to before
// Drive is connected at all.
export default function GoogleAuthInitializer() {
  const status = useDriveAuthStatus();
  const { setDatastore } = useDatastoreSelector();
  const navigate = useNavigate();
  const location = useLocation();

  // Whoever sent us here may have been mid-errand — a joiner picking Drive
  // from the session lobby was about to enter a game, and landing them on
  // sheet management instead threw the code away. The token client is a
  // popup, not a page redirect, so router state survives the whole flow and
  // can carry the errand back.
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  // Landing here starts the silent path (cached token, then no-UI refresh);
  // the Authorize button below only renders once that has been exhausted.
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
