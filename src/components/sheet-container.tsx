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

  // Cold start: no datastore selected (that's React state), so re-select the
  // remembered last-used backend instead of bouncing home. Drive resumes
  // silently via ensureDriveToken and only detours to /auth when a click is
  // needed.
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

  // The uuid in the URL names the sheet to open, resolved once the list
  // arrives. A uuid not in the list (deleted, different Drive account) clears
  // back to the plain picker.
  //
  // One effect, not two: a sheet that just closed leaves its uuid in the URL,
  // and the load arm must not reopen what the user asked to close.
  //
  // This effect runs before the datastore provider's init effect, so
  // `characterLoading` is stale-false while the list fetch is about to start;
  // "uuid isn't in the list" only means something after the list has loaded,
  // hence sawListLoad.
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

  // The other direction: keep the open sheet's uuid in the URL, unless it was
  // joined remotely or borrowed — neither is in any local list to reload from.
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
    // still open restores the uuid too.
  }, [character?.uuid, datastore, location.pathname]);

  if (!datastore && !character) {
    // Drive resume in flight (or about to redirect); avoid flashing empty page.
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
