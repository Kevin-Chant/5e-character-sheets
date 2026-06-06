import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CharSheet from "src/components/charsheet";
import { defaultCharacter } from "src/lib/data/default-data";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

export default function SheetContainer() {
  const { character, dispatch } = useCharacter();
  const { datastore } = useDatastoreSelector();
  const navigate = useNavigate();

  useEffect(() => {
    if (!datastore) navigate("/");
  }, []);

  const loadDefaultCharacter = useCallback(() => {
    dispatch(loadFullCharacter(defaultCharacter), false);
  }, [dispatch]);

  if (!datastore) {
    return <></>;
  }
  return (
    <>
      {!character && (
        <div className="column">
          {...datastore.listEntriesInDatastore().map((char) => (
            <button
              key={char.uuid}
              id={char.uuid}
              onClick={() => dispatch(loadFullCharacter(char))}
            >
              {char.name}
            </button>
          ))}
          <button onClick={loadDefaultCharacter}>Create new character</button>
        </div>
      )}
      {character && <CharSheet />}
    </>
  );
}
