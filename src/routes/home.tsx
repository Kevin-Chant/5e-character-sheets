import React from "react";
import { Link } from "react-router-dom";
import GoogleDriveDatastore from "src/datastores/google-drive-datastore";
import LocalDatastore from "src/datastores/local-datastore";
import RemoteDatastore from "src/datastores/remote-datastore";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

export default function Home() {
  const { setDatastore } = useDatastoreSelector();
  const { reset } = useCharacter();
  return (
    <>
      <h1>Home</h1>
      <div className="column">
        <Link to="auth">
          <button>Sync character sheets to Google Drive</button>
        </Link>
        <Link
          onClick={() => {
            setDatastore(LocalDatastore);
            reset();
          }}
          to="/sheet"
        >
          <button>
            Edit characters locally & store sheets in your browser
          </button>
        </Link>

        <Link
          onClick={() => {
            setDatastore(RemoteDatastore);
            reset();
          }}
          to="/join"
        >
          <button>Join a friend's sharing session</button>
        </Link>
      </div>
    </>
  );
}
