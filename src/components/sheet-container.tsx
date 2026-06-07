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

  // A remote joiner has no datastore but does have a character pushed into
  // context, so only bounce home when there's genuinely nothing to show.
  useEffect(() => {
    if (!datastore && !character) navigate("/");
  }, []);

  const loadDefaultCharacter = useCallback(() => {
    dispatch(loadFullCharacter(defaultCharacter), false);
  }, [dispatch]);

  if (!datastore && !character) {
    return <></>;
  }
  return (
    <>
      {!character && datastore && (
        <div className="button-stack">
          {...datastore.listEntriesInDatastore().map((char) => (
            <button
              className="btn-secondary"
              key={char.uuid}
              id={char.uuid}
              onClick={() => dispatch(loadFullCharacter(char))}
            >
              {char.name}
            </button>
          ))}
          <button className="btn-primary" onClick={loadDefaultCharacter}>
            Create new character
          </button>
        </div>
      )}
      {character && <CharSheet />}
    </>
  );
}
