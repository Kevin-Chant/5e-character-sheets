import { ReactNode, useEffect } from "react";
import { FaGoogleDrive, FaLaptop, FaUsers } from "react-icons/fa6";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LocalDatastore from "src/datastores/local-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastDatastore, writeLastDatastore } from "src/lib/last-datastore";

interface OptionCardProps {
  to: string;
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
  return (
    <Link to={to} onClick={onClick} className="option-card no-underline">
      <span className="option-card-icon">{icon}</span>
      <h2 className="option-card-heading">{heading}</h2>
      <p className="text-muted">{description}</p>
    </Link>
  );
}

export default function Home() {
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  const navigate = useNavigate();
  const location = useLocation();

  // Returning visitors "jump back in" to their last storage mode unless they
  // explicitly asked for the picker (via the Home nav button, which sets this
  // state). Live (remote) sessions are ephemeral, so we route to /join rather
  // than auto-reconnecting.
  const showPicker = (location.state as { picker?: boolean } | null)?.picker;
  useEffect(() => {
    if (showPicker) return;
    const lastMode = readLastDatastore();
    if (!lastMode) return;
    if (lastMode === "local") {
      setDatastore(LocalDatastore);
      reset();
      navigate("/sheet", { replace: true });
    } else if (lastMode === "drive") {
      navigate("/auth", { replace: true });
    } else if (lastMode === "remote") {
      navigate("/join", { replace: true });
    }
  }, [showPicker]);

  const chooseLocal = () => {
    setDatastore(LocalDatastore);
    reset();
    writeLastDatastore("local");
  };

  return (
    <div className="home">
      <div className="home-hero">
        <h1>D&D 5e Character Sheets</h1>
        <p className="text-muted">
          Build, store, and share your characters - no account required
        </p>
      </div>

      {/* This row answers one question — where your characters live. Sessions
          are a separate question and live behind the nav, because three of the
          four ways into one need this answered first. */}
      <div className="option-grid">
        <OptionCard
          to="auth"
          icon={<FaGoogleDrive />}
          heading="Sync to Google Drive"
          description="Save your sheets to Drive and access them anywhere."
        />
        <OptionCard
          to="/sheet"
          onClick={chooseLocal}
          icon={<FaLaptop />}
          heading="Edit locally"
          description="Keep sheets in this browser - nothing leaves your device."
        />
      </div>

      {/* The escape hatch for the one path that genuinely needs no storage:
          someone arrived holding a code. Kept secondary rather than made a peer
          of the cards above, because "I'm just joining" isn't a place to keep
          characters — it's the absence of one. One link, one destination: the
          sessions page has the box, and it works for both kinds of code. */}
      <div className="home-arrivals">
        <p className="text-muted">Been sent a code?</p>
        <Link className="no-underline" to="/sessions" state={{ join: true }}>
          <FaUsers /> Join a game or a shared sheet
        </Link>
      </div>

      <p className="text-muted home-footnote">
        No account, no cost. Your characters live in your browser, your Drive,
        or a friend&apos;s session.
      </p>
    </div>
  );
}
