import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SessionLobby, {
  LobbySelection,
} from "src/components/sessions/session-lobby";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
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
    sessionCode,
    sessionStatus,
    sessionError,
    hostSession,
    joinSession,
    bringCharacters,
  } = useEncounter();

  // Set once we've asked for a connection; the effect below waits for it rather
  // than dropping onto /play with a bar that says "connecting".
  const [pending, setPending] = useState<Character[] | undefined>();
  // What the lobby learned that the connection itself can't see: which seat
  // this is, and which sheets were brought. Written to memory only once the
  // connection succeeds, so a failed attempt doesn't teach the front door a
  // shortcut that doesn't work.
  const memoryPatch = useRef<Partial<SessionMemory>>({});

  useEffect(() => {
    if (!pending) return;
    if (sessionStatus === "connected") {
      if (pending.length > 0) bringCharacters(pending);
      if (sessionCode) {
        rememberSessionLocally({
          ...memoryPatch.current,
          code: sessionCode,
          lastJoined: Date.now(),
        });
      }
      setPending(undefined);
      navigate("/play");
    } else if (sessionStatus === "error" || sessionStatus === "offline") {
      setPending(undefined);
    }
  }, [pending, sessionStatus, sessionCode]);

  const confirm = async (selection: LobbySelection) => {
    // A DM's own sheets go in as brought characters, not as "the character I'm
    // playing" — running the table is the job. That's true whether they're
    // opening the realm tonight or rejoining the one they opened last week.
    memoryPatch.current = selection.runningTable
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

    if (mode === "host") {
      setPending(selection.bring);
      // With a code, this is reopening a table that went quiet rather than
      // starting a new one — the group's existing invite link keeps working.
      await hostSession(code);
      return;
    }
    if (!code) return;
    // Joining "as" a character is opening it: the participant effect keeps
    // whatever sheet is open in step with the order.
    if (selection.playAs) {
      dispatch(loadPersistedCharacter(selection.playAs));
    } else if (!selection.runningTable) {
      // A DM rejoining keeps whatever sheet they happen to have open; only a
      // player who chose "no sheet" is asking for the sheet to be cleared.
      reset();
    }
    // Nothing is brought when joining: the room already holds whatever this
    // browser put there, and re-adding would re-snapshot vitals from full-health
    // sheets onto monsters the party has spent three rounds wearing down.
    setPending([]);
    await joinSession(code, selection.displayName);
  };

  return (
    <SessionLobby
      mode={mode}
      code={code}
      busy={!!pending || sessionStatus === "connecting"}
      error={sessionError}
      onCancel={() => {
        setPending(undefined);
        navigate("/");
      }}
      onConfirm={confirm}
    />
  );
}
