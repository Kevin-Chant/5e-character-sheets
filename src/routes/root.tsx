import classNames from "classnames";
import { UUID } from "crypto";
import React from "react";
import { FaTrash } from "react-icons/fa6";
import { Outlet, Link } from "react-router-dom";
import RemoteDatastore from "src/datastores/remote-datastore";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  loadFullCharacter,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { leaveSharingSession } from "src/lib/sharing";

export default function Root() {
  const { datastore } = useDatastoreSelector();
  const { characters, deleteCharacter } = useDatastore();

  const { character, dispatch } = useCharacter();

  const deleteCharacterAndRefocus = (uuid: UUID) => {
    deleteCharacter(uuid);
    // TODO: close session if hosting
    leaveSharingSession(uuid);
    dispatch(resetCharacter());
  };

  const loadNewCharacter = () => {
    if (!datastore?.createCharacter) return;
    dispatch(loadFullCharacter(datastore.createCharacter()));
  };

  const charactersNavText =
    datastore === RemoteDatastore ? "Active sharing sessions" : "Saved sheets";

  return (
    <>
      <div id="sidebar">
        <h1>Navigation</h1>
        <nav>
          <Link to="/">Home</Link>
          <hr></hr>
          {datastore && (
            <>
              <p>{charactersNavText}:</p>
              <hr></hr>
              <ul>
                {characters.map((characterEntry) => {
                  const isSameCharacter =
                    JSON.stringify(characterEntry) ===
                    JSON.stringify(character);
                  return (
                    <li key={characterEntry.uuid} className="flex">
                      <Link
                        to="/sheet"
                        onClick={() => {
                          if (!isSameCharacter) {
                            dispatch(loadFullCharacter(characterEntry));
                          }
                        }}
                      >
                        <p className={classNames({ bold: isSameCharacter })}>
                          {characterEntry.name}
                        </p>
                      </Link>
                      <button
                        onClick={() =>
                          deleteCharacterAndRefocus(characterEntry.uuid)
                        }
                      >
                        {/* TODO: switch icon if remote-only connection */}
                        <FaTrash />
                      </button>
                    </li>
                  );
                })}
                {datastore.createCharacter && (
                  <button onClick={loadNewCharacter}>
                    Create new character
                  </button>
                )}
              </ul>
            </>
          )}
        </nav>
      </div>
      <div id="detail">
        <Outlet />
      </div>
    </>
  );
}
