import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import Switch from "react-switch";
import { FaCopy } from "react-icons/fa6";

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
    navigator.clipboard.writeText(character.uuid);
    alert(
      "Your sharing code has been copied to the clipboard.\nShare this code with your friend:\n" +
        character.uuid,
    );
  };

  return (
    <>
      <div className="sharing-toggle margin-medium">
        <label htmlFor="toggleSharing">Share</label>
        <Switch
          id="toggleSharing"
          onChange={toggleSharing}
          checked={sharingSessionOpen}
        />
      </div>
      <button onClick={copyCode}>
        <FaCopy />
      </button>
    </>
  );
}
