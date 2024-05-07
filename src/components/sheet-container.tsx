import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CharSheet from "src/components/charsheet";
import ModalContainer from "src/components/modals/modal-container";
import LocalDatastore from "src/datastores/local-datastore";
import { defaultCharacter } from "src/lib/data/default-data";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { DatastoreContextProvider } from "src/lib/hooks/use-datastore";
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
        <button onClick={loadDefaultCharacter}>Create new character</button>
      )}
      {character && <CharSheet />}
    </>
  );
}
