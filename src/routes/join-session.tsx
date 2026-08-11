import { useEffect, useState } from "react";
import { FaCircleExclamation } from "react-icons/fa6";
import { Link, useNavigate, useParams } from "react-router-dom";
import SessionEntry from "src/components/sessions/session-entry";
import Spinner from "src/components/spinner";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { detectSessionKind } from "src/lib/realm/occupancy";
import { isValidSessionCode, normalizeSessionCode } from "src/lib/play/session";
import { playPathFor } from "src/lib/play/rejoin";
import { sessionMemoryFor } from "src/lib/play/session-memory";

// `/join/<code>` — the invite link, and the one destination for a pasted
// code. Takes both kinds of code (game or shared sheet); which realm
// answers is what tells them apart, so the probe runs here and the two
// flows diverge after it.
//
// Client-side path over a static bucket: resolves because CloudFront
// rewrites 403/404 to `/index.html`.

type Resolution =
  | { state: "checking" }
  | { state: "game"; code: string }
  | { state: "invalid" }
  | { state: "missing"; code: string }
  | { state: "unreachable" }
  | { state: "reopening"; code: string };

export default function JoinSession() {
  const { code: raw } = useParams();
  const navigate = useNavigate();
  const {
    settings: { liveEditHost },
  } = useSettings();
  const { sessionCode, sessionStatus } = useEncounter();
  const [resolution, setResolution] = useState<Resolution>({
    state: "checking",
  });

  const code = raw ? normalizeSessionCode(raw) : undefined;
  const alreadyHere = sessionStatus === "connected" && sessionCode === code;
  useEffect(() => {
    if (alreadyHere) navigate(playPathFor(code), { replace: true });
  }, [alreadyHere]);

  useEffect(() => {
    if (!code || alreadyHere) return;
    if (!isValidSessionCode(code)) {
      setResolution({ state: "invalid" });
      return;
    }
    let current = true;
    setResolution({ state: "checking" });
    detectSessionKind(liveEditHost, code).then((kind) => {
      if (!current) return;
      if (kind === "editing") {
        // A shared sheet hands back a whole character, not a seat at a table.
        navigate("/join", { replace: true, state: { code } });
      } else if (kind === "unreachable") {
        setResolution({ state: "unreachable" });
      } else if (kind) {
        setResolution({ state: "game", code });
      } else {
        setResolution({ state: "missing", code });
      }
    });
    return () => {
      current = false;
    };
  }, [code, liveEditHost, alreadyHere]);

  if (resolution.state === "game") {
    return <SessionEntry mode="join" code={resolution.code} />;
  }

  if (resolution.state === "reopening") {
    return <SessionEntry mode="host" code={resolution.code} />;
  }

  if (resolution.state === "checking") {
    return (
      <div className="session-resolving">
        <p>
          <Spinner /> Finding your game…
        </p>
      </div>
    );
  }

  // Offer reopening only to the browser that remembers running this table.
  const wasOurs =
    resolution.state === "missing" &&
    sessionMemoryFor(resolution.code)?.seat === "dm";

  return (
    <div className="session-resolving">
      <p className="row session-error" role="alert">
        <FaCircleExclamation />
        <span>
          {resolution.state === "invalid"
            ? "That link doesn't have a session code in it."
            : resolution.state === "unreachable"
              ? "Couldn't reach the sharing server — the session may be fine. Check your connection, or the sharing host in Settings."
              : wasOurs
                ? "This table isn't open. You ran it last time — you can open it again on the same code, so everyone's link still works."
                : "No session with that code is open. Check the link, or ask whoever started the game to keep their tab open."}
        </span>
      </p>
      {wasOurs && resolution.state === "missing" && (
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            setResolution({ state: "reopening", code: resolution.code })
          }
        >
          Open this table again
        </button>
      )}
      <Link to="/">Back to the start</Link>
    </div>
  );
}
