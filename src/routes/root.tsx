import classNames from "classnames";
import { UUID } from "crypto";
import React from "react";
import { FaTrash } from "react-icons/fa6";
import { Outlet, Link } from "react-router-dom";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  loadFullCharacter,
  resetCharacter,
} from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";

export default function Root() {
  const { datastore } = useDatastoreSelector();
  const { characters, deleteCharacter } = useDatastore();

  const { character, dispatch } = useCharacter();

  const createNewCharacter = () => {
    const newDefaultCharacter = defaultCharacter;
    newDefaultCharacter.uuid = crypto.randomUUID() as UUID;
    dispatch(loadFullCharacter(newDefaultCharacter), false);
  };

  const deleteCharacterAndRefocus = (uuid: UUID) => {
    deleteCharacter(uuid);
    dispatch(resetCharacter());
  };

  return (
    <>
      <div id="sidebar">
        <h1>Navigation</h1>
        <nav>
          <Link to="/">Home</Link>
          <hr></hr>
          {datastore && (
            <>
              <p>Saved characters:</p>
              <hr></hr>
              <ul>
                {characters.map((characterEntry) => {
                  const isSameCharacter =
                    JSON.stringify(characterEntry) ===
                    JSON.stringify(character);
                  return (
                    <li key={characterEntry.uuid} className="flex">
                      <Link
                        to={`/sheets/${characterEntry.uuid}`}
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
                        <FaTrash />
                      </button>
                    </li>
                  );
                })}
                <button onClick={createNewCharacter}>
                  Create new character
                </button>
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
