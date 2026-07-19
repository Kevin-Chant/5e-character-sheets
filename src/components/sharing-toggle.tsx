import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { copyToClipboard } from "src/lib/browser";
import Switch from "react-switch";
import { FaCopy } from "react-icons/fa6";
import IdentityFields from "src/components/identity-fields";

export default function SharingToggle() {
  const { datastore } = useDatastoreSelector();
  const { getRole } = useSharingSessions();
  const { character, openSharingSession, closeSharingSession } = useCharacter();

  // Hide for sheets we don't own locally, including ones we've joined remotely
  // (a joiner can't re-host the realm they're connected to).
  if (!character || !datastore || getRole(character.uuid) === "remote")
    return <></>;

  // Reflect the actual session state for this character, so the switch stays
  // accurate across character switches and external teardown (e.g. delete).
  const sharingSessionOpen = getRole(character.uuid) === "host";

  const toggleSharing = (checked: boolean) => {
    if (checked) {
      openSharingSession();
    } else {
      closeSharingSession();
    }
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
      <div className="row space-between">
        <label htmlFor="toggleSharing">Share live session</label>
        <Switch
          id="toggleSharing"
          onChange={toggleSharing}
          checked={sharingSessionOpen}
        />
      </div>
      {sharingSessionOpen && (
        <>
          <IdentityFields uuid={character.uuid} />
          <button className="margin-small" onClick={copyCode}>
            <FaCopy /> Copy sharing code
          </button>
        </>
      )}
    </section>
  );
}
