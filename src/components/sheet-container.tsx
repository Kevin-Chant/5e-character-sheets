import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CharacterPicker from "src/components/character-picker";
import CharSheet from "src/components/charsheet";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

export default function SheetContainer() {
  const { character } = useCharacter();
  const { datastore } = useDatastoreSelector();
  const navigate = useNavigate();

  // A remote joiner has no datastore but does have a character pushed into
  // context, so only bounce home when there's genuinely nothing to show.
  useEffect(() => {
    if (!datastore && !character) navigate("/");
  }, []);

  if (!datastore && !character) {
    return <></>;
  }
  return (
    <>
      {!character && datastore && <CharacterPicker />}
      {character && <CharSheet />}
    </>
  );
}
