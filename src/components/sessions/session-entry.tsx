import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SessionLobby, {
  LobbySelection,
} from "src/components/sessions/session-lobby";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { playPathFor } from "src/lib/play/rejoin";
import {
  rememberSessionLocally,
  SessionMemory,
} from "src/lib/play/session-memory";
import { Character } from "src/lib/types";

// Becoming a participant: the lobby, then the connection, then the table.
//
// Both ways in share everything except the questions the lobby asks, so they
// share this. It used to be a `stage` inside the sessions route; it's a
// component behind a URL now, which is what makes an invite link a link and
// makes the Drive round-trip a plain `returnTo` rather than router state
// ferrying a lobby's worth of choices through an OAuth popup.

interface SessionEntryProps {
  mode: "host" | "join";
  // Absent when hosting — the code doesn't exist until the realm is open.
  code?: string;
}

export default function SessionEntry({ mode, code }: SessionEntryProps) {
  const navigate = useNavigate();
  const { dispatch, reset } = useCharacter();
  const {
    sessionStatus,
    sessionError,
    hostSession,
    joinSession,
    bringCharacters,
  } = useEncounter();

  // Whether we're waiting on a connection. That used to be a copy of the sheets
  // being brought, held for an effect that watched `sessionStatus` for the
  // moment to use them — because `hostSession`/`joinSession` resolved as soon
  // as the attempt had been *started*. They resolve when the realm is joined
  // now, and say whether it was, so the whole flow is one function again.
  const [busy, setBusy] = useState(false);

  const confirm = async (selection: LobbySelection) => {
    // What the lobby learned that the connection itself can't see: which seat
    // this is, and which sheets were brought. Written to memory only once the
    // connection succeeds, so a failed attempt doesn't teach the front door a
    // shortcut that doesn't work.
    //
    // A DM's own sheets go in as brought characters, not as "the character I'm
    // playing" — running the table is the job. That's true whether they're
    // opening the realm tonight or rejoining the one they opened last week.
    const remember: Partial<SessionMemory> = selection.runningTable
      ? {
          seat: "dm",
          broughtUuids: selection.bring.map((c) => c.uuid),
          ...(selection.tableName ? { title: selection.tableName } : {}),
        }
      : {
          seat: "player",
          playAsUuid: selection.playAs?.uuid,
          playAsName: selection.playAs?.name,
          displayName: selection.displayName,
        };

    if (mode === "join" && !code) return;
    setBusy(true);
    // Nothing is brought when *joining*: the room already holds whatever this
    // browser put there, and re-adding would re-snapshot vitals from full-health
    // sheets onto monsters the party has spent three rounds wearing down.
    let bring: Character[] = [];

    if (mode === "join") {
      // Joining "as" a character is opening it: the participant effect keeps
      // whatever sheet is open in step with the order.
      if (selection.playAs) {
        dispatch(loadPersistedCharacter(selection.playAs));
      } else if (!selection.runningTable) {
        // A DM rejoining keeps whatever sheet they happen to have open; only a
        // player who chose "no sheet" is asking for the sheet to be cleared.
        reset();
      }
    } else {
      bring = selection.bring;
    }

    // With a code, hosting is reopening a table that went quiet rather than
    // starting a new one — the group's existing invite link keeps working.
    const result =
      mode === "host"
        ? await hostSession(code)
        : await joinSession(code!, selection.displayName);
    setBusy(false);
    // The lobby stays put and shows `sessionError`. Nothing has been recorded,
    // which is the point: a code that didn't work must not become a shortcut on
    // the front door.
    if (!result.ok) return;

    if (bring.length > 0) bringCharacters(bring);
    // The code comes back with the connection rather than being read off the
    // context, which is a render behind — and a host doesn't know it in advance
    // at all, since the transport mints it.
    rememberSessionLocally({
      ...remember,
      code: result.code,
      lastJoined: Date.now(),
    });
    // The table goes in the URL, not just into the session state: a phone
    // that loses this tab to a background eviction comes back to a code it
    // can reconnect from. `result.code` rather than the context's, which is a
    // render behind — and which a host doesn't have until the transport mints
    // it.
    navigate(playPathFor(result.code));
  };

  return (
    <SessionLobby
      mode={mode}
      code={code}
      busy={busy || sessionStatus === "connecting"}
      error={sessionError}
      onCancel={() => navigate("/")}
      onConfirm={confirm}
    />
  );
}
