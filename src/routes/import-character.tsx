import { useEffect, useRef, useState } from "react";
import { FaCircleExclamation } from "react-icons/fa6";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import Spinner from "src/components/spinner";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useDriveImport } from "src/lib/hooks/use-drive-import";

// `/import/<fileId>?name=<file name>` — where the Drive share email lands.
// Sibling of `/join/<code>`. Cannot import unattended (see
// `src/lib/drive-import-link.ts` — the Picker click is the grant), so this
// route removes every step around that click: sign in if needed, wait for
// Drive's listing, then open the Picker already narrowed to one file. A
// second visit skips the Picker since we already have the file.
export default function ImportCharacter() {
  const { fileId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { datastore } = useDatastoreSelector();
  const { characterLoading } = useDatastore();
  const { handleImport, busy } = useDriveImport();
  // Without this, the Picker would reopen on every re-render during init.
  const started = useRef(false);
  const [cancelled, setCancelled] = useState(false);

  const name = searchParams.get("name") ?? undefined;
  const onDrive = datastore === GoogleDriveDatastore;
  const ready = onDrive && !characterLoading;

  useEffect(() => {
    if (!fileId || !ready || started.current) return;
    started.current = true;
    handleImport({ fileId, name }).then((imported) => {
      if (!imported) setCancelled(true);
    });
  }, [fileId, ready]);

  const retry = () => {
    setCancelled(false);
    handleImport({ fileId, name }).then((imported) => {
      if (!imported) setCancelled(true);
    });
  };

  if (!fileId) {
    return (
      <div className="session-resolving">
        <p className="row session-error" role="alert">
          <FaCircleExclamation />
          <span>That link doesn&apos;t point at a character sheet.</span>
        </p>
        <Link to="/">Back to the start</Link>
      </div>
    );
  }

  if (!onDrive) {
    return (
      <div className="session-resolving">
        <h2>
          {name
            ? `Add ${name.replace(/\.5echar$/, "")}`
            : "Add a shared character"}
        </h2>
        <p className="text-muted">
          This sheet lives in the owner&apos;s Google Drive. Sign in with the
          Google account it was shared with to add it to your characters.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            navigate("/auth", {
              state: {
                returnTo: `${location.pathname}${location.search}`,
              },
            })
          }
        >
          Continue with Google Drive
        </button>
        <Link to="/">Back to the start</Link>
      </div>
    );
  }

  if (cancelled && !busy) {
    return (
      <div className="session-resolving">
        <p className="row session-error" role="alert">
          <FaCircleExclamation />
          <span>
            Nothing was added. Choose the shared file to add it to your
            characters — if you can&apos;t see it, make sure you&apos;re signed
            in with the account the sheet was shared with.
          </span>
        </p>
        <button type="button" className="btn-primary" onClick={retry}>
          Choose the file
        </button>
        <Link to="/">Back to the start</Link>
      </div>
    );
  }

  return (
    <div className="session-resolving">
      <p>
        <Spinner />{" "}
        {characterLoading
          ? "Checking your Google Drive…"
          : "Opening the shared character…"}
      </p>
    </div>
  );
}
