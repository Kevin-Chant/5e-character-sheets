import { useEffect, useState } from "react";
import { FaCircleExclamation } from "react-icons/fa6";
import { Link, useNavigate, useParams } from "react-router-dom";
import SessionEntry from "src/components/sessions/session-entry";
import Spinner from "src/components/spinner";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { detectSessionKind } from "src/lib/play/probe-realm";
import { isValidSessionCode, normalizeSessionCode } from "src/lib/play/session";
import { sessionMemoryFor } from "src/lib/play/session-memory";

// `/join/<code>` — the invite link, and the one destination for a pasted code.
//
// A DM pastes this URL into the group chat and is done: the player who has
// never opened the app clicks it and lands on the lobby for the right table,
// having answered nothing. That's the whole point of the route existing, and
// it's why it takes *both* kinds of code. Which realm answers is what tells a
// game from a shared sheet apart (shape can't — both are uuids), so the probe
// runs here and the two flows diverge after it, invisibly.
//
// Hosting side note: this is a client-side path over a static bucket, so it
// only resolves because the CloudFront distribution rewrites 403/404 to
// `/index.html`. That was already true for the app's other routes.

type Resolution =
  | { state: "checking" }
  | { state: "game"; code: string }
  | { state: "invalid" }
  | { state: "missing"; code: string }
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

  // Clicking the same link twice mid-game shouldn't take a seat away from
  // whoever is already sitting in it — we're already there.
  const code = raw ? normalizeSessionCode(raw) : undefined;
  const alreadyHere = sessionStatus === "connected" && sessionCode === code;
  useEffect(() => {
    if (alreadyHere) navigate("/play", { replace: true });
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
        // A shared *sheet* is a different object with a different joiner, and
        // it hands back a whole character rather than a seat at a table.
        navigate("/join", { replace: true, state: { code } });
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

  // A code whose realm has closed. For the DM who ran that table this isn't an
  // error at all — it's next Thursday. Reopening the same code is what keeps
  // the link they handed out a year ago working, so the offer is made to the
  // one browser that can prove it ran the table: the one that remembers doing
  // so. For everyone else it stays what it is, a table nobody has opened yet.
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
