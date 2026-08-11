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
// Both host and join share everything except the questions the lobby asks.

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

  const [busy, setBusy] = useState(false);

  const confirm = async (selection: LobbySelection) => {
    // Written to memory only once the connection succeeds, so a failed
    // attempt doesn't teach the front door a shortcut that doesn't work.
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
    // Nothing is brought when joining: the room already holds whatever this
    // browser put there.
    let bring: Character[] = [];

    if (mode === "join") {
      if (selection.playAs) {
        dispatch(loadPersistedCharacter(selection.playAs));
      } else if (!selection.runningTable) {
        // A DM rejoining keeps whatever sheet is open; only a player who
        // chose "no sheet" wants it cleared.
        reset();
      }
    } else {
      bring = selection.bring;
    }

    // With a code, hosting reopens a table that went quiet rather than
    // starting a new one — the group's existing invite link keeps working.
    const result =
      mode === "host"
        ? await hostSession(code)
        : await joinSession(code!, selection.displayName);
    setBusy(false);
    if (!result.ok) return;

    if (bring.length > 0) bringCharacters(bring);
    // `result.code`, not the context's — the context is a render behind, and
    // a host doesn't know the code until the transport mints it.
    rememberSessionLocally({
      ...remember,
      code: result.code,
      lastJoined: Date.now(),
    });
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
