import RemoteDatastore from "src/datastores/remote-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import Switch from "react-switch";
import ReactSwitch from "react-switch";
import { FaCopy } from "react-icons/fa6";

export default function SharingToggle() {
  const { datastore } = useDatastoreSelector();
  const {
    character,
    sharingSessionOpen,
    openSharingSession,
    closeSharingSession,
  } = useCharacter();

  if (!character || !datastore || datastore === RemoteDatastore) return <></>;

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
        character.uuid
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
