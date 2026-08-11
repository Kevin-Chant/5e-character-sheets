import { useEffect, useState } from "react";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import { FaCopy, FaTowerBroadcast, FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { copyToClipboard } from "src/lib/browser";
import { inviteLink } from "src/lib/play/session";

// Starting or joining a party session by code. Only the encounter projection
// (names, initiative, HP, AC, conditions, concentration) leaves the browser —
// no spell list, inventory, or backstory.
export default function SessionBar() {
  const navigate = useNavigate();
  const {
    sessionCode,
    sessionStatus,
    sessionError,
    hostSession,
    joinSession,
    leaveSession,
    hasDm,
    isDm,
    claimDm,
    releaseDm,
    rememberedSessions,
    forgetRememberedSession,
    lastSession,
  } = useEncounter();
  const otherSessions = rememberedSessions.filter(
    (remembered) => remembered.code !== lastSession,
  );
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const connected = sessionStatus === "connected";
  useEffect(() => {
    if (!connected) return;
    setJoining(false);
    setCode("");
  }, [connected]);

  if (connected) {
    return (
      <div className="session-bar connected">
        <span className="session-live">
          <FaTowerBroadcast />
          <span>Live</span>
        </span>
        <button
          type="button"
          className="session-code"
          title="Copy the invite link — anyone who opens it lands at this table"
          onClick={async () => {
            await copyToClipboard(
              inviteLink(window.location.origin, sessionCode ?? ""),
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <code>{sessionCode}</code>
          <FaCopy />
        </button>
        {copied && <span className="session-hint">Invite link copied</span>}
        {isDm ? (
          <button type="button" className="session-btn" onClick={releaseDm}>
            Release DM seat
          </button>
        ) : hasDm ? (
          <span className="session-hint">Someone else is running combat</span>
        ) : (
          <button type="button" className="session-btn" onClick={claimDm}>
            Claim DM seat
          </button>
        )}
        {/* Also clears the URL — a /play/<code> this browser recognizes auto-rejoins. */}
        <button
          type="button"
          className="session-btn"
          onClick={() => {
            leaveSession();
            navigate("/play", { replace: true });
          }}
        >
          Leave
        </button>
      </div>
    );
  }

  return (
    <div className={classNames("session-bar", { error: !!sessionError })}>
      {joining ? (
        <form
          className="session-join"
          onSubmit={(e) => {
            e.preventDefault();
            joinSession(code);
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
          <button
            type="submit"
            className="session-btn"
            disabled={sessionStatus === "connecting"}
          >
            {sessionStatus === "connecting" ? "Joining…" : "Join"}
          </button>
          <button
            type="button"
            className="session-btn"
            onClick={() => setJoining(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          {lastSession && (
            <button
              type="button"
              className="session-btn btn-primary"
              disabled={sessionStatus === "connecting"}
              onClick={() => joinSession(lastSession)}
            >
              {sessionStatus === "connecting"
                ? "Rejoining…"
                : "Rejoin your session"}
            </button>
          )}
          <button
            type="button"
            className="session-btn"
            disabled={sessionStatus === "connecting"}
            onClick={() => hostSession()}
          >
            {sessionStatus === "connecting" ? "Starting…" : "Start a session"}
          </button>
          <button
            type="button"
            className="session-btn"
            onClick={() => setJoining(true)}
          >
            Join a session
          </button>
          <span className="session-hint">
            Shares initiative, HP and conditions with your party — never your
            sheet.
          </span>
        </>
      )}
      {/* Codes are uuids, so nobody is retyping last week's from memory. A table
          rejoins the same session every week, and this character knows which
          ones it has been in. The one this browser was just in is already the
          button above, so it isn't repeated here. */}
      {!joining && otherSessions.length > 0 && (
        <div className="session-recent">
          <span className="session-hint">Other sessions</span>
          <ul>
            {otherSessions.map((remembered) => (
              <li key={remembered.code}>
                <button
                  type="button"
                  className="session-btn"
                  title={remembered.code}
                  disabled={sessionStatus === "connecting"}
                  onClick={() => joinSession(remembered.code)}
                >
                  <code>{remembered.code.slice(0, 8)}</code>
                  <span className="session-when">
                    {new Date(remembered.lastJoined).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Forget session ${remembered.code.slice(0, 8)}`}
                  onClick={() => forgetRememberedSession(remembered.code)}
                >
                  <FaXmark />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sessionError && <p className="session-error">{sessionError}</p>}
    </div>
  );
}
