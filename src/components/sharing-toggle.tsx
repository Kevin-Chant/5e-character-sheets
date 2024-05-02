import RemoteDatastore from "src/datastores/remote-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import Switch from "react-switch";
import ReactSwitch from "react-switch";

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
    // TODO
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
      "Your sharing code has been copied to the clipboard.\n" + character.uuid
    );
  };

  return (
    <div>
      <label htmlFor="toggleSharing">Start sharing session</label>
      <Switch
        id="toggleSharing"
        onChange={toggleSharing}
        checked={sharingSessionOpen}
      />
      <button onClick={copyCode}>Copy sharing code</button>
    </div>
  );
}
