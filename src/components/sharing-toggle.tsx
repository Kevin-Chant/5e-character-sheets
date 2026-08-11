import { useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { copyToClipboard } from "src/lib/browser";
import { inviteLink } from "src/lib/play/session";
import { FaCopy, FaCircleExclamation } from "react-icons/fa6";
import IdentityFields from "src/components/identity-fields";

// Starting a live session is a network call that can fail (wrong host, sidecar
// down); the button models idle/connecting/failed states.
export default function SharingToggle() {
  const { datastore } = useDatastoreSelector();
  const { getRole } = useSharingSessions();
  const { character, openSharingSession, closeSharingSession } = useCharacter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // A joiner can't re-host the realm they're connected to.
  if (!character || !datastore || getRole(character.uuid) === "remote")
    return <></>;

  const sharingSessionOpen = getRole(character.uuid) === "host";

  const start = async () => {
    setConnecting(true);
    setError(undefined);
    try {
      await openSharingSession();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't start the live session.",
      );
    } finally {
      setConnecting(false);
    }
  };

  const stop = () => {
    setError(undefined);
    closeSharingSession();
  };

  const copyCode = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const link = inviteLink(window.location.origin, character.uuid);
    copyToClipboard(link);
    window.alert(
      "Your sharing link has been copied to the clipboard.\nSend it to your friend:\n" +
        link,
    );
  };

  return (
    <section className="share-section">
      <h2>Live session</h2>
      <p className="text-muted">
        Edit together in real time — anyone with the code can join.
      </p>
      {sharingSessionOpen ? (
        <>
          <button className="btn-secondary" onClick={stop}>
            End live session
          </button>
          <IdentityFields uuid={character.uuid} />
          <button className="margin-small" onClick={copyCode}>
            <FaCopy /> Copy sharing code
          </button>
        </>
      ) : (
        <button onClick={start} disabled={connecting} aria-busy={connecting}>
          {connecting ? "Connecting…" : "Start live session"}
        </button>
      )}
      {error && (
        <p className="row font-small text-error" role="alert">
          <FaCircleExclamation />
          <span>
            {error} <button onClick={start}>Try again</button>
          </span>
        </p>
      )}
    </section>
  );
}
