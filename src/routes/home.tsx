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

  const chooseJoin = () => {
    // Joined characters are owned remotely, so clear any local store selection
    // to avoid persisting a divergent copy.
    setDatastore(undefined);
    reset();
  };

  return (
    <div className="home">
      <div className="home-hero">
        <h1>D&D 5e Character Sheets</h1>
        <p className="text-muted">
          Build, store, and share your characters - no account required
        </p>
      </div>

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
        <OptionCard
          to="/join"
          onClick={chooseJoin}
          icon={<FaUsers />}
          heading="Join a session"
          description="Enter a friend's code to co-edit a character live."
        />
      </div>

      <p className="text-muted home-footnote">
        No account, no cost. Your characters live in your browser, your Drive,
        or a friend&apos;s session.
      </p>
    </div>
  );
}
