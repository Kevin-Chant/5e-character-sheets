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

// Moves the open character between the two places it can live: this browser's
// localStorage and the user's Google Drive. A move is a copy into the target
// plus a delete from the source — the uuid doesn't change, so live sessions
// and the front door's shortcut keep working across it.
//
// The two directions are shaped very differently by auth:
//
// - Drive → browser happens inline: localStorage needs no round-trip, so the
//   character is written there, the Drive file deleted, and the datastore
//   swapped in one go.
// - Browser → Drive can't: gapi isn't even script-loaded while the app runs on
//   local storage, and Drive may need an OAuth prompt. So that direction rides
//   the existing `/auth` route with a `moveToDrive` intent in router state
//   (the same pattern as the lobby's `returnTo`), and the move itself is
//   finished by `useCompleteMoveToDrive` after the swap.
//
// Either swap runs through `CharacterContext`'s defined→defined reset, which
// closes the open sheet — deliberately, since that reset is what keeps
// autosave from writing across backends. Both directions therefore reopen the
// character by uuid on the far side rather than trying to keep it open.
export function useMoveCharacter() {
  const { datastore, setDatastore } = useDatastoreSelector();
  const { character } = useCharacter();
  const { getRole, isBorrowed } = useSharingSessions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  // Where the open character could move to; undefined when it can't. Only a
  // character we own is ours to move (same rule as sharing), and a shared or
  // imported Drive document stays put: other people hold links to that file,
  // and "move" would either break their copy or silently fork it.
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
      // Flush the latest in-memory state to localStorage first: the Drive
      // swap resets the open character, so the completion effect reads the
      // character back from local storage rather than from context.
      await LocalDatastore.saveToDatastore(character);
      navigate("/auth", {
        state: { returnTo: "/sheet", moveToDrive: character.uuid },
      });
      return;
    }

    setBusy(true);
    try {
      await LocalDatastore.saveToDatastore(character);
      // Best-effort: a leftover Drive copy is recoverable — the local one is
      // now canonical — so a failed delete just logs.
      Promise.resolve(
        GoogleDriveDatastore.deleteFromDatastore(character.uuid),
      ).catch((err) =>
        console.error("Failed to delete the moved character's Drive file", err),
      );
      writeLastDatastore("local");
      setDatastore(LocalDatastore);
      // The swap closed the sheet; the picker's openCharacter shortcut
      // reopens it once the local list is up.
      navigate("/sheet", { state: { openCharacter: character.uuid } });
    } finally {
      setBusy(false);
    }
  };

  return { target, busy, handleMove };
}

// Finishes a browser → Drive move once `/auth` has landed back on the sheet
// with the Drive datastore selected. Mounted by `sheet-container`.
//
// The gating is the subtle part: this effect runs *before* the datastore
// provider's own init effect (children's effects fire first), so on arrival
// `characterLoading` is still stale-false while Drive init — which resets the
// module-level caches — is about to start. Writing during that window can
// orphan the new file from `knownFiles` and leave a duplicate behind. So the
// move waits until it has seen the Drive init actually start (loading true)
// and finish (loading false again).
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
      // Open the sheet immediately — the character is fully in memory, so the
      // user shouldn't sit on a Drive picker that doesn't list it yet while
      // the copy round-trips. `persistCharacter` stages the entry into the
      // reactive character list right away (marked unsynced) and writes to
      // Drive in the background.
      dispatch(loadPersistedCharacter(character));
      const persisted = await persistCharacter(character);
      if (persisted) {
        // Only once Drive actually holds the character does the browser copy
        // stop being the canonical one.
        LocalDatastore.deleteFromDatastore(uuid);
      } else {
        // The local copy was not deleted, so nothing is lost — surface that.
        // The sheet stays open with the unsaved indicator up; a manual save
        // (or the next autosaved edit) retries the Drive write.
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
