import { useEffect, useState } from "react";
import classNames from "classnames";
import { FaCopy, FaTowerBroadcast, FaXmark } from "react-icons/fa6";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { copyToClipboard } from "src/lib/browser";

// Starting or joining a party session.
//
// The whole thing is one code read out over a call. There's no host who owns the
// fight — everyone opens their own character and joins the same code, so a
// player going to bed doesn't end anybody else's encounter.
//
// What leaves the browser is only the encounter: names, initiative, HP, AC,
// conditions, concentration. No spell list, no inventory, no backstory. The
// privacy default holds by construction rather than by a flag, which is why this
// bar can say so plainly.
export default function SessionBar() {
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

  // Close the join form once we're actually in. Without this, leaving a session
  // drops you back onto the form you used to get in — still holding the old
  // code — instead of the normal bar with its rejoin shortcuts.
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
          title="Copy the invite code — players paste it on the Sessions page"
          onClick={async () => {
            await copyToClipboard(sessionCode ?? "");
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <code>{sessionCode}</code>
          <FaCopy />
        </button>
        {copied && <span className="session-hint">Copied</span>}
        {/* The seat gates which controls render, never who may write —
            unclaimed means everyone gets them, which is what keeps the
            encounter usable with no session at all.

            There is no "take over" here any more. Starting a game claims the
            seat, and a reload or a dropped connection reclaims it automatically
            from this browser's DM token, so the two reasons to press it are
            gone. What's left — a DM whose browser is genuinely never coming
            back — is rare enough to live in Settings rather than sit on the bar
            reading like something to race for. */}
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
        <button type="button" className="session-btn" onClick={leaveSession}>
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
          {/* Offered first, because an offline bar with a remembered session is
              almost always a reload or a dropped connection rather than a
              decision to leave — leaving on purpose clears it. For a DM this is
              the only way back: the seat still knows them, but the code was
              never written to a character, because they may not have one. */}
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
            onClick={hostSession}
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
