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
//
// This is the sibling of `/join/<code>`: a link someone was sent, which asks
// them nothing they can't answer and ends with the thing they were sent. The
// import it drives already existed, buried in the nav overflow menu behind a
// picker listing everything ever shared with the account; what was missing was
// a way to arrive at it already pointed at the right file.
//
// It cannot import unattended, and that's a scope decision rather than an
// oversight — see `src/lib/drive-import-link.ts`. The user's click in the
// Picker *is* the grant. So the route's job is to remove every step around
// that click: sign in if needed, wait for Drive to finish listing, then open
// the Picker already narrowed to one file. A second visit to the same link
// skips the Picker entirely, because by then we have the file.
export default function ImportCharacter() {
  const { fileId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { datastore } = useDatastoreSelector();
  const { characterLoading } = useDatastore();
  const { handleImport, busy } = useDriveImport();
  // The Picker is a one-shot errand, not a render-driven one: without this it
  // would reopen on every re-render the datastore causes while initializing.
  const started = useRef(false);
  const [cancelled, setCancelled] = useState(false);

  const name = searchParams.get("name") ?? undefined;
  const onDrive = datastore === GoogleDriveDatastore;
  const ready = onDrive && !characterLoading;

  useEffect(() => {
    if (!fileId || !ready || started.current) return;
    started.current = true;
    handleImport({ fileId, name }).then((imported) => {
      // `handleImport` navigates to the sheet on success; the only thing left
      // to say is what happened when it didn't.
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

  // Drive is where the file is, so there's no backend choice to offer here —
  // unlike the front door, this link already knows where it's going. Sending
  // the current path as `returnTo` is what makes the OAuth round-trip land
  // back on the import rather than dumping the user on their sheet list.
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
