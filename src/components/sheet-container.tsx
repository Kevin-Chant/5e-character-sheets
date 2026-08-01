import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CharacterPicker from "src/components/character-picker";
import CharSheet from "src/components/charsheet";
import ErrorBoundary from "src/components/error-boundary";
import Spinner from "src/components/spinner";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { ensureDriveToken } from "src/lib/google-auth";
import {
  loadPersistedCharacter,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useCompleteMoveToDrive } from "src/lib/hooks/use-move-character";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { readLastDatastore } from "src/lib/last-datastore";
import { Character } from "src/lib/types";

function downloadRawCharacter(character: Character) {
  const blob = new Blob([JSON.stringify(character, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.download = `${character.name || "character"}.5echarsheet`;
  a.href = window.URL.createObjectURL(blob);
  a.click();
  a.remove();
}

export default function SheetContainer() {
  const { character, dispatch } = useCharacter();
  const { datastore, setDatastore } = useDatastoreSelector();
  const { characters, characterLoading } = useDatastore();
  const { getRole, isBorrowed } = useSharingSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const { uuid: routeUuid } = useParams();

  // A browser → Drive move arrives here via /auth with its intent in router
  // state; this finishes it (copy in, delete local, reopen) once Drive is up.
  useCompleteMoveToDrive();

  // Cold start (a refresh, a bookmark, a direct link): no datastore is
  // selected, because that lives in React state — but the last-used backend is
  // remembered, so re-select it instead of bouncing home. Local is instant;
  // Drive resumes silently in the background (`ensureDriveToken`) and only
  // detours to /auth when a genuine click is needed. A remote joiner has no
  // datastore but does have a character pushed into context, so only someone
  // with genuinely nothing to show goes home.
  const driveBootStarted = useRef(false);
  useEffect(() => {
    if (datastore || character) return;
    const mode = readLastDatastore();
    if (mode === "local") {
      setDatastore(LocalDatastore);
      return;
    }
    if (mode === "drive") {
      if (driveBootStarted.current) return;
      driveBootStarted.current = true;
      ensureDriveToken().then((ok) => {
        if (ok) {
          setDatastore(GoogleDriveDatastore);
        } else {
          navigate("/auth", {
            replace: true,
            state: {
              ...((location.state as object | null) ?? {}),
              returnTo: location.pathname,
            },
          });
        }
      });
      return;
    }
    navigate("/");
  }, [datastore, character]);

  // The uuid in the URL names the sheet to open — it is read before any
  // backend has loaded, so it resolves here once the list arrives. A uuid that
  // isn't in the list (deleted, or a different Drive account) clears back to
  // the plain picker, which is the right answer to a link that has gone stale.
  //
  // One effect rather than two, because the ordering matters: a sheet that
  // just *closed* (deleted, or "back to character list") leaves its uuid in
  // the URL, and the load arm must not see that uuid and immediately reopen
  // what the user asked to close.
  //
  // Same gating subtlety as `useCompleteMoveToDrive`: this effect runs before
  // the datastore provider's own init effect (children's effects fire first),
  // so on arrival `characterLoading` is stale-false while the list fetch is
  // about to start. "The uuid isn't in the list" only means anything after
  // the list has actually loaded — hence the saw-it-load ref.
  const sawListLoad = useRef(false);
  useEffect(() => {
    if (characterLoading) sawListLoad.current = true;
  }, [characterLoading]);
  const hadCharacter = useRef(false);
  useEffect(() => {
    if (!character && hadCharacter.current) {
      hadCharacter.current = false;
      if (routeUuid) navigate("/sheet", { replace: true });
      return;
    }
    if (character) {
      hadCharacter.current = true;
      return;
    }
    if (!routeUuid || !datastore) return;
    const wanted = characters.find((entry) => entry.uuid === routeUuid);
    if (wanted) {
      dispatch(loadPersistedCharacter(wanted));
    } else if (sawListLoad.current && !characterLoading) {
      navigate("/sheet", { replace: true, state: location.state });
    }
  }, [character, routeUuid, characters, characterLoading, datastore]);

  // The other direction: whichever of our own sheets is open, its uuid belongs
  // in the URL so a refresh can find its way back. Not for a sheet joined
  // remotely or borrowed from a DM — neither is in any local list, so its URL
  // would be a promise a refresh can't keep.
  useEffect(() => {
    if (!character || !datastore) return;
    if (getRole(character.uuid) === "remote" || isBorrowed(character.uuid))
      return;
    if (location.pathname !== `/sheet/${character.uuid}`) {
      navigate(`/sheet/${character.uuid}`, {
        replace: true,
        state: location.state,
      });
    }
    // location.pathname is a dep so landing on plain /sheet with this sheet
    // still open (the drawer link, a back navigation) restores the uuid too.
  }, [character?.uuid, datastore, location.pathname]);

  if (!datastore && !character) {
    // The Drive resume is in flight (or about to redirect); say so instead of
    // flashing an empty page.
    return readLastDatastore() === "drive" ? (
      <p className="margin">
        <Spinner /> Opening your Google Drive characters...
      </p>
    ) : (
      <></>
    );
  }
  return (
    <>
      {!character && datastore && <CharacterPicker />}
      {character && (
        <ErrorBoundary
          resetKey={character.uuid}
          fallback={(error) => (
            <div className="column flex-start margin">
              <h2>This character couldn&apos;t be displayed</h2>
              <p>
                Something in this character&apos;s data caused an error while
                rendering. Your other characters are unaffected. You can
                download a backup of the raw data and then return to the
                character list.
              </p>
              <pre className="margin-small">{String(error.message)}</pre>
              <div className="row">
                <button
                  className="margin-small"
                  onClick={() => downloadRawCharacter(character)}
                >
                  Download raw JSON
                </button>
                <button
                  className="margin-small"
                  onClick={() => dispatch(resetCharacter())}
                >
                  Back to character list
                </button>
              </div>
            </div>
          )}
        >
          <CharSheet />
        </ErrorBoundary>
      )}
    </>
  );
}
