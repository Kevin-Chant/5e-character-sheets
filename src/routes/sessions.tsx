import { ReactNode, useEffect, useRef, useState } from "react";
import { FaDiceD20, FaFileLines, FaUsers } from "react-icons/fa6";
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

// Sessions: the ways two browsers end up looking at the same thing.
//
// The surface leads with the one thing every invited player arrives holding —
// a code. Both kinds of code are uuids, so one box takes either and the probe
// works out whether it opens onto a table or a shared sheet; making the guest
// choose between two "join" doors that lead to the same hallway was the first
// draft's mistake. Below the box sit the two ways to *start* something, which
// are genuinely different objects: a game shares one encounter and no sheets,
// an editing session shares exactly one whole sheet.
//
// Storage sits *before* this surface, not beside it. Starting things needs
// somewhere to keep characters, so the storage question is answered on the
// home page and re-offered in the lobby for the one case that arrives without
// it. What this route never does is make you choose a backend to answer a
// question about who you're playing with.

type Stage =
  | { step: "menu" }
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

  const [stage, setStage] = useState<Stage>({ step: "menu" });
  const [code, setCode] = useState("");
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Set once we've asked for a connection; the effect below waits for it rather
  // than dropping onto /play with a bar that says "connecting".
  const [pending, setPending] = useState<Character[] | undefined>();

  // Arriving from home's "been sent a code?" shortcut lands with the box ready
  // to paste into — same page, no separate step to back out of.
  const wantsJoin = (location.state as { join?: boolean } | null)?.join;
  const codeInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (wantsJoin) codeInputRef.current?.focus();
  }, [wantsJoin]);

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
      setError(
        "That doesn't look like a code. It should be a long dashed one, like 1f0d…-…",
      );
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
      await joinSession(stage.code, selection.displayName);
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

      <section className="sessions-join-panel">
        <h3>
          <FaUsers /> Been sent a code?
        </h3>
        <p className="text-muted">
          One box takes both kinds — a game to join, or a sheet to edit
          together.
        </p>
        <form
          className="session-join"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
        >
          <input
            ref={codeInputRef}
            type="text"
            className="session-code-input"
            aria-label="Session code"
            placeholder="Paste the code here"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={probing || !code.trim()}
          >
            {probing ? "Looking…" : "Join"}
          </button>
        </form>
        {error && <p className="session-error">{error}</p>}
      </section>

      <section className="sessions-group">
        <h3>Or start something</h3>
        <div className="session-cards">
          <SessionCard
            icon={<FaDiceD20 />}
            heading="Start a game"
            description="Run the table: one shared fight — initiative, HP, conditions — for everyone who joins. Sheets stay private."
            onClick={() => setStage({ step: "lobby", mode: "host" })}
          />
          <SessionCard
            icon={<FaFileLines />}
            heading="Share a character"
            description="Two people editing one sheet, live. The whole sheet travels, so it's always yours to offer."
            onClick={() => navigate("/sheet", { state: { share: true } })}
          />
        </div>
      </section>
    </div>
  );
}
