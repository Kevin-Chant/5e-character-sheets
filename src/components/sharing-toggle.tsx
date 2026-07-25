import { useState } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { copyToClipboard } from "src/lib/browser";
import { FaCopy, FaCircleExclamation } from "react-icons/fa6";
import IdentityFields from "src/components/identity-fields";

// Starting a live session is a network call that can fail — a wrong host, a
// sidecar that's down — and it used to be a toggle switch, which has nowhere to
// put "connecting" or "that didn't work": the switch would flip, the session
// wouldn't open, and the only feedback was a `window.alert`. A button models
// the three real states (idle / connecting / failed) honestly.
export default function SharingToggle() {
  const { datastore } = useDatastoreSelector();
  const { getRole } = useSharingSessions();
  const { character, openSharingSession, closeSharingSession } = useCharacter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Hide for sheets we don't own locally, including ones we've joined remotely
  // (a joiner can't re-host the realm they're connected to).
  if (!character || !datastore || getRole(character.uuid) === "remote")
    return <></>;

  // Reflect the actual session state for this character, so the button stays
  // accurate across character switches and external teardown (e.g. delete).
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
    copyToClipboard(character.uuid);
    window.alert(
      "Your sharing code has been copied to the clipboard.\nShare this code with your friend:\n" +
        character.uuid,
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
        // `role="alert"` rather than `status`: this is the result of an action
        // the user explicitly took and it needs to interrupt.
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
