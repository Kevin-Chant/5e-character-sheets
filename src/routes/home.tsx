import React from "react";
import { Link } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

export default function Home() {
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  return (
    <>
      <h1>Home</h1>
      <Link to="auth">Sync character sheets to Google Drive</Link>
      <p>-or-</p>
      <Link
        onClick={() => {
          setDatastore(LocalDatastore);
          reset();
        }}
        to="/sheets"
      >
        Edit characters locally & store sheets in your browser
      </Link>
    </>
  );
}
