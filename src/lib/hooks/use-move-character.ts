import { UUID } from "crypto";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { writeLastDatastore } from "src/lib/last-datastore";

// Moves the open character between localStorage and Google Drive: a copy into
// the target plus a delete from the source, uuid unchanged so live sessions
// and the front-door shortcut keep working. Drive → browser happens inline;
// browser → Drive needs gapi/OAuth, so it rides `/auth` with a `moveToDrive`
// router-state intent, finished by `useCompleteMoveToDrive`. Both directions
// reopen the character by uuid after the swap (which closes the sheet via
// `CharacterContext`'s defined→defined reset).
export function useMoveCharacter() {
  const { datastore, setDatastore } = useDatastoreSelector();
  const { character } = useCharacter();
  const { getRole, isBorrowed } = useSharingSessions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Only a character we own is ours to move; a shared/imported Drive document
  // stays put since other people hold links to that file.
  let target: "drive" | "local" | undefined;
  if (
    character &&
    getRole(character.uuid) !== "remote" &&
    !isBorrowed(character.uuid)
  ) {
    if (datastore === LocalDatastore) {
      target = "drive";
    } else if (
      datastore === GoogleDriveDatastore &&
      !datastore.isShared?.(character.uuid)
    ) {
      target = "local";
    }
  }

  const handleMove = async () => {
    if (!character || !target) return;

    if (target === "drive") {
      // Flush to localStorage first: the datastore swap resets the open
      // character, so the completion effect reads it back from storage.
      await LocalDatastore.saveToDatastore(character);
      navigate("/auth", {
        state: { returnTo: "/sheet", moveToDrive: character.uuid },
      });
      return;
    }

    setBusy(true);
    try {
      await LocalDatastore.saveToDatastore(character);
      // Best-effort: local copy is now canonical, so a failed delete just logs.
      Promise.resolve(
        GoogleDriveDatastore.deleteFromDatastore(character.uuid),
      ).catch((err) =>
        console.error("Failed to delete the moved character's Drive file", err),
      );
      writeLastDatastore("local");
      setDatastore(LocalDatastore);
      navigate(`/sheet/${character.uuid}`);
    } finally {
      setBusy(false);
    }
  };

  return { target, busy, handleMove };
}

// Finishes a browser → Drive move once `/auth` has landed back with the Drive
// datastore selected. Mounted by `sheet-container`. Waits until it has seen
// Drive init actually start (loading true) and finish (loading false) before
// writing — this effect runs before the datastore provider's own init effect,
// so writing too early can orphan the new file from `knownFiles`.
export function useCompleteMoveToDrive() {
  const location = useLocation();
  const navigate = useNavigate();
  const { datastore } = useDatastoreSelector();
  const { characterLoading } = useDatastore();
  const { dispatch, persistCharacter } = useCharacter();
  const sawDriveInit = useRef(false);
  const started = useRef(false);

  const uuid = (location.state as { moveToDrive?: UUID } | null)?.moveToDrive;

  useEffect(() => {
    if (characterLoading && datastore === GoogleDriveDatastore) {
      sawDriveInit.current = true;
    }
  }, [characterLoading, datastore]);

  useEffect(() => {
    if (!uuid || started.current) return;
    if (
      datastore !== GoogleDriveDatastore ||
      characterLoading ||
      !sawDriveInit.current
    )
      return;
    started.current = true;
    (async () => {
      const character = await LocalDatastore.loadFromDatastore(uuid);
      // One-shot: strip the intent so back/refresh can't re-run the move.
      navigate(location.pathname, { replace: true, state: null });
      if (!character) return;
      // Open immediately rather than waiting on the Drive round-trip;
      // persistCharacter stages the entry (marked unsynced) and writes in the background.
      dispatch(loadPersistedCharacter(character));
      const persisted = await persistCharacter(character);
      if (persisted) {
        LocalDatastore.deleteFromDatastore(uuid);
      } else {
        // Local copy stays; sheet stays open with unsaved indicator, retried on next save.
        alert(
          "Couldn't copy the character to Google Drive. It's still saved in " +
            "this browser — check your connection and save again to retry.",
        );
      }
    })().catch((err) => {
      console.error("Failed to move the character to Drive", err);
      alert(
        "Couldn't move the character to Google Drive. It's still saved in this browser.",
      );
      navigate(location.pathname, { replace: true, state: null });
    });
  }, [uuid, datastore, characterLoading]);
}
