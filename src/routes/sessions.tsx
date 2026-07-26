import { ReactNode, useEffect, useState } from "react";
import {
  FaDiceD20,
  FaFileLines,
  FaTowerBroadcast,
  FaUsers,
} from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";
import SessionLobby, {
  LobbySelection,
} from "src/components/sessions/session-lobby";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { detectSessionKind } from "src/lib/play/probe-realm";
import { isValidSessionCode, normalizeSessionCode } from "src/lib/play/session";
import { Character } from "src/lib/types";

// Sessions: the four ways two browsers end up looking at the same thing.
//
// The four paths are a 2x2 of {editing, gameplay} x {start, join}, and the axis
// that leads is **which kind of session** — an editing session is one sheet with
// two editors, a gameplay session is one table with many sheets and no shared
// sheet at all. Those are different objects with different privacy stories.
// Start-versus-join is secondary and usually already decided by who you are.
//
// Storage sits *before* this surface, not beside it. Three of the four paths
// need somewhere to keep characters, so the storage question is answered on the
// home page and re-offered in the lobby for the one case that arrives without
// it. What this route never does is make you choose a backend to answer a
// question about who you're playing with.

type Stage =
  | { step: "menu" }
  | { step: "code" }
  | { step: "lobby"; mode: "host" }
  | { step: "lobby"; mode: "join"; code: string };

interface SessionCardProps {
  icon: ReactNode;
  heading: string;
  description: string;
  onClick: () => void;
}

function SessionCard({
  icon,
  heading,
  description,
  onClick,
}: SessionCardProps) {
  return (
    <button type="button" className="session-card" onClick={onClick}>
      <span className="session-card-icon">{icon}</span>
      <span className="session-card-heading">{heading}</span>
      <span className="session-card-description text-muted">{description}</span>
    </button>
  );
}

export default function Sessions() {
  const navigate = useNavigate();
  const location = useLocation();
  const { dispatch, reset } = useCharacter();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const {
    sessionStatus,
    sessionError,
    hostSession,
    joinSession,
    bringCharacters,
    lastSession,
  } = useEncounter();

  // Arriving from home's "join a game" shortcut skips straight to the box.
  const wantsJoin = (location.state as { join?: boolean } | null)?.join;
  const [stage, setStage] = useState<Stage>(
    wantsJoin ? { step: "code" } : { step: "menu" },
  );
  const [code, setCode] = useState("");
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Set once we've asked for a connection; the effect below waits for it rather
  // than dropping onto /play with a bar that says "connecting".
  const [pending, setPending] = useState<Character[] | undefined>();

  useEffect(() => {
    if (!pending) return;
    if (sessionStatus === "connected") {
      if (pending.length > 0) bringCharacters(pending);
      setPending(undefined);
      navigate("/play");
    } else if (sessionStatus === "error" || sessionStatus === "offline") {
      setPending(undefined);
    }
  }, [pending, sessionStatus]);

  // One box for both kinds of code. Which realm exists is what tells them apart
  // — see `session-codes.ts` for why shape can't.
  const submitCode = async () => {
    const normalized = normalizeSessionCode(code);
    if (!isValidSessionCode(normalized)) {
      setError("That doesn't look like a session code. Codes are uuids.");
      return;
    }
    setError(undefined);
    setProbing(true);
    const kind = await detectSessionKind(liveEditHost, normalized);
    setProbing(false);
    if (!kind) {
      setError(
        "No session with that code is open. Check the code, or ask whoever started it to keep their tab open.",
      );
      return;
    }
    if (kind === "editing") {
      // Sharing a character is its own flow with its own joiner, and it hands
      // back a sheet rather than a seat at a table.
      navigate("/join", { state: { code: normalized } });
      return;
    }
    setStage({ step: "lobby", mode: "join", code: normalized });
  };

  const confirmLobby = async (selection: LobbySelection) => {
    setError(undefined);
    if (stage.step !== "lobby") return;
    if (stage.mode === "host") {
      // A DM's own sheets go in as brought characters, not as "the character
      // I'm playing" — running the table is the job.
      setPending(selection.bring);
      await hostSession();
    } else {
      // Joining "as" a character is opening it: the participant effect keeps
      // whatever sheet is open in step with the order.
      if (selection.playAs) {
        dispatch(loadPersistedCharacter(selection.playAs));
      } else {
        reset();
      }
      setPending([]);
      await joinSession(stage.code);
    }
  };

  if (stage.step === "lobby") {
    return (
      <SessionLobby
        mode={stage.mode}
        code={stage.mode === "join" ? stage.code : undefined}
        busy={!!pending || sessionStatus === "connecting"}
        error={error ?? sessionError}
        onCancel={() => {
          setPending(undefined);
          setStage({ step: "menu" });
        }}
        onConfirm={confirmLobby}
      />
    );
  }

  if (stage.step === "code") {
    return (
      <div className="sessions">
        <h2>Join a session</h2>
        <p className="text-muted">
          Paste the code you were sent. It works for both a game and a shared
          character — we&apos;ll work out which.
        </p>
        <form
          className="session-join"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
        >
          <input
            type="text"
            className="session-code-input"
            aria-label="Session code"
            placeholder="Paste the session code"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={probing}>
            {probing ? "Looking…" : "Continue"}
          </button>
          <button type="button" onClick={() => setStage({ step: "menu" })}>
            Back
          </button>
        </form>
        {error && <p className="session-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="sessions">
      <h2>Sessions</h2>
      {/* The way back in after a reload or a dropped connection. It has to be
          *here*: the bar with the rejoin button lives on /play, and a DM with
          no character open and no session gets bounced off /play — so without
          this, refreshing mid-game stranded them with a seat waiting and no
          door to it. Leaving on purpose clears `lastSession`, so this only
          shows when there's genuinely something to go back to. */}
      {lastSession && sessionStatus !== "connected" && (
        <div className="sessions-rejoin">
          <span>You were in a game.</span>
          <button
            type="button"
            className="btn-primary"
            disabled={!!pending || sessionStatus === "connecting"}
            onClick={async () => {
              setPending([]);
              await joinSession(lastSession);
            }}
          >
            {sessionStatus === "connecting"
              ? "Rejoining…"
              : "Rejoin your session"}
          </button>
          {sessionError && <p className="session-error">{sessionError}</p>}
        </div>
      )}
      <section className="sessions-group">
        <h3>
          <FaDiceD20 /> Play a game
        </h3>
        <p className="text-muted">
          A whole table shares one encounter — initiative, HP, conditions.
          Nobody shares a sheet.
        </p>
        <div className="session-cards">
          <SessionCard
            icon={<FaUsers />}
            heading="Start a game"
            description="Run the table. Bring party sheets, companions and stat blocks into the order."
            onClick={() => setStage({ step: "lobby", mode: "host" })}
          />
          <SessionCard
            icon={<FaTowerBroadcast />}
            heading="Join a game"
            description="Come in with one of your characters, or without one and wait to be handed a sheet."
            onClick={() => setStage({ step: "code" })}
          />
        </div>
      </section>
      <section className="sessions-group">
        <h3>
          <FaFileLines /> Edit a sheet together
        </h3>
        <p className="text-muted">
          Two people on one character sheet, editing live. This is the one that
          shares a whole sheet, so it&apos;s always something you offer.
        </p>
        <div className="session-cards">
          <SessionCard
            icon={<FaTowerBroadcast />}
            heading="Share a character"
            description="Open a sheet for someone else to edit alongside you."
            onClick={() => navigate("/sheet", { state: { share: true } })}
          />
          <SessionCard
            icon={<FaFileLines />}
            heading="Join a shared sheet"
            description="Edit a character someone else has open. Nothing is saved on your side."
            onClick={() => setStage({ step: "code" })}
          />
        </div>
      </section>
    </div>
  );
}
