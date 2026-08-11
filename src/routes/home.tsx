import { ReactNode, useState } from "react";
import {
  FaDiceD20,
  FaGoogleDrive,
  FaLaptop,
  FaRightToBracket,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import LocalDatastore from "src/datastores/local-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastCharacter } from "src/lib/last-character";
import { readLastDatastore, writeLastDatastore } from "src/lib/last-datastore";
import { extractSessionCode, isValidSessionCode } from "src/lib/play/session";
import {
  forgetSessionLocally,
  readSessionMemory,
  SessionMemory,
} from "src/lib/play/session-memory";

// The front door: asks what you came to do rather than where characters
// live. Storage is a consequence of that answer, not a gate in front of it.

interface OptionCardProps {
  to?: string;
  icon: ReactNode;
  heading: string;
  description: string;
  onClick?: () => void;
}

function OptionCard({
  to,
  icon,
  heading,
  description,
  onClick,
}: OptionCardProps) {
  const body = (
    <>
      <span className="option-card-icon">{icon}</span>
      <h3 className="option-card-heading">{heading}</h3>
      <p className="text-muted">{description}</p>
    </>
  );
  return to ? (
    <Link to={to} onClick={onClick} className="option-card no-underline">
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className="option-card">
      {body}
    </button>
  );
}

// One remembered table. The code is a uuid, so the useful label is what the
// browser did there — ran it, or played someone.
function ResumeGameRow({
  session,
  onForget,
}: {
  session: SessionMemory;
  onForget: () => void;
}) {
  const what =
    session.title ??
    (session.seat === "dm" ? "The game you're running" : "Your game");
  return (
    <li className="resume-row">
      <Link className="resume-main no-underline" to={`/join/${session.code}`}>
        <span className="resume-icon">
          <FaUsers />
        </span>
        <span className="resume-text">
          <span className="resume-title">
            {what}
            {session.playAsName ? ` — as ${session.playAsName}` : ""}
          </span>
          <span className="text-muted resume-detail">
            <code>{session.code.slice(0, 8)}</code>
            {" · "}
            {new Date(session.lastJoined).toLocaleDateString()}
          </span>
        </span>
        <span className="resume-action">Rejoin</span>
      </Link>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Forget the game ${session.code.slice(0, 8)}`}
        onClick={onForget}
      >
        <FaXmark />
      </button>
    </li>
  );
}

const RESUME_LIMIT = 3;

export default function Home() {
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  const navigate = useNavigate();

  // Read once per mount: localStorage reads, and this page's actions
  // navigate away from it.
  const [sessions, setSessions] = useState(() =>
    readSessionMemory().slice(0, RESUME_LIMIT),
  );
  const [lastCharacter] = useState(readLastCharacter);
  // "remote" (a joiner's borrowed sheet) reads here as "not answered yet".
  const [storageMode] = useState<"local" | "drive" | undefined>(() => {
    const mode = readLastDatastore();
    return mode === "local" || mode === "drive" ? mode : undefined;
  });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();

  const toCharacters = (
    mode: "local" | "drive",
    intent?: { openCharacter?: string; share?: boolean },
  ) => {
    const destination = intent?.openCharacter
      ? `/sheet/${intent.openCharacter}`
      : "/sheet";
    const state = intent?.share ? { share: true } : undefined;
    if (mode === "drive") {
      if (readLastDatastore() !== "drive") {
        // First time on Drive: the OAuth round-trip needs its own page.
        navigate("/auth", { state: { returnTo: destination, ...state } });
        return;
      }
      navigate(destination, { state });
      return;
    }
    setDatastore(LocalDatastore);
    reset();
    writeLastDatastore("local");
    navigate(destination, { state });
  };

  const openLastCharacter = () => {
    if (!lastCharacter) return;
    toCharacters(lastCharacter.mode, { openCharacter: lastCharacter.uuid });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = extractSessionCode(code);
    if (!isValidSessionCode(resolved)) {
      setCodeError(
        "That doesn't look like a code. Paste the whole link, or the long dashed code — like 1f0d…-…",
      );
      return;
    }
    navigate(`/join/${resolved}`);
  };

  const forget = (forgotten: string) => {
    forgetSessionLocally(forgotten);
    setSessions((current) => current.filter((s) => s.code !== forgotten));
  };

  const hasResume = sessions.length > 0 || !!lastCharacter;

  return (
    <div className="home">
      <div className="home-hero">
        <h1>D&D 5e Character Sheets</h1>
        <p className="text-muted">
          Build a character, run a table, or join tonight&apos;s game. No
          account required.
        </p>
      </div>

      {hasResume && (
        <section className="home-resume">
          <h2>Pick up where you left off</h2>
          <ul>
            {sessions.map((session) => (
              <ResumeGameRow
                key={session.code}
                session={session}
                onForget={() => forget(session.code)}
              />
            ))}
            {lastCharacter && (
              <li className="resume-row">
                <button
                  type="button"
                  className="resume-main"
                  onClick={openLastCharacter}
                >
                  <span className="resume-icon">
                    <FaRightToBracket />
                  </span>
                  <span className="resume-text">
                    <span className="resume-title">{lastCharacter.name}</span>
                    <span className="text-muted resume-detail">
                      {lastCharacter.mode === "drive"
                        ? "In your Google Drive"
                        : "Saved in this browser"}
                    </span>
                  </span>
                  <span className="resume-action">Open</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="home-join">
        <h2>Been sent a code or a link?</h2>
        <form onSubmit={submitCode}>
          <input
            type="text"
            className="session-code-input"
            aria-label="Session code or invite link"
            placeholder="Paste it here"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={!code.trim()}>
            Join
          </button>
        </form>
        {codeError && <p className="session-error">{codeError}</p>}
      </section>

      <section className="home-start">
        <h2>{hasResume ? "Or start something else" : "Or start something"}</h2>
        <div className="option-grid">
          <OptionCard
            to="/host"
            icon={<FaDiceD20 />}
            heading="Run a game"
            description="You're the DM. Start a table, send the link, and run initiative, HP and conditions for everyone. No character sheet needed."
          />
          {storageMode ? (
            <OptionCard
              onClick={() => toCharacters(storageMode)}
              icon={storageMode === "drive" ? <FaGoogleDrive /> : <FaLaptop />}
              heading="My characters"
              description={
                storageMode === "drive"
                  ? "Your sheets in Google Drive, available on any device you sign in from."
                  : "Your sheets in this browser. Nothing leaves your device."
              }
            />
          ) : (
            <>
              <OptionCard
                onClick={() => toCharacters("drive")}
                icon={<FaGoogleDrive />}
                heading="Sync to Google Drive"
                description="Build and keep your sheets in Drive, and reach them from anywhere."
              />
              <OptionCard
                onClick={() => toCharacters("local")}
                icon={<FaLaptop />}
                heading="Keep sheets in this browser"
                description="Build and keep your sheets on this device. Nothing leaves it."
              />
            </>
          )}
        </div>
        {storageMode && (
          <p className="text-muted home-switch">
            {storageMode === "drive"
              ? "Your sheets are in Google Drive."
              : "Your sheets are in this browser."}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() =>
                toCharacters(storageMode === "drive" ? "local" : "drive")
              }
            >
              {storageMode === "drive"
                ? "Use this browser instead"
                : "Use Google Drive instead"}
            </button>{" "}
            — nothing moves, and each place keeps its own sheets.
          </p>
        )}
      </section>

      {storageMode && (
        <p className="text-muted home-aside">
          Want to build a character together?{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => toCharacters(storageMode, { share: true })}
          >
            Open a sheet and share it
          </button>{" "}
          — you both edit the same one, live.
        </p>
      )}

      <p className="text-muted home-footnote">
        No account, no cost. Your characters live in your browser, your Drive,
        or a friend&apos;s session.
      </p>
    </div>
  );
}
