import classNames from "classnames";
import { UUID } from "crypto";
import React, { useCallback, useState } from "react";
import {
  FaBars,
  FaCheck,
  FaFileExport,
  FaFileImport,
  FaFloppyDisk,
  FaHouse,
  FaSpinner,
  FaTrash,
  FaTriangleExclamation,
} from "react-icons/fa6";
import { Outlet, Link, useRoutes } from "react-router-dom";
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
import SharingToggle from "src/components/sharing-toggle";
import { validateCharacterData } from "src/lib/utils";

function Sidebar() {
  const { datastore } = useDatastoreSelector();
  const { characters, deleteCharacter, characterLoading, createCharacter } =
    useDatastore();
  const { character, dispatch } = useCharacter();

  const deleteCharacterAndRefocus = (uuid: UUID) => {
    deleteCharacter(uuid);
    // TODO: close session if hosting
    leaveSharingSession(uuid);
    dispatch(resetCharacter());
  };

  const loadNewCharacter = async () => {
    const newChar = await createCharacter();
    if (newChar) {
      dispatch(loadFullCharacter(newChar));
    }
  };

  const charactersNavText = !datastore
    ? "Not connected to saved characters"
    : datastore.savedSheetsCopy;

  return (
    <div id="sidebar">
      <div id="sidebar-content" className="margin-small">
        <b>{charactersNavText}</b>
        <hr></hr>
        <ul className="character-list">
          {characters.map((characterEntry) => {
            const isSameCharacter =
              JSON.stringify(characterEntry) === JSON.stringify(character);
            return (
              <li
                key={characterEntry.uuid}
                className="row space-between margin-medium"
              >
                <Link
                  className="no-underline font-black"
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
                  className="padding-small"
                  onClick={() => deleteCharacterAndRefocus(characterEntry.uuid)}
                >
                  {/* TODO: switch icon if remote-only connection */}
                  <FaTrash />
                </button>
              </li>
            );
          })}
          {datastore?.createCharacter && (
            <button onClick={loadNewCharacter}>Create new character</button>
          )}
          {characterLoading && <FaSpinner />}
        </ul>
      </div>
    </div>
  );
}

export default function Root() {
  const [showSidebar, setShowSidebar] = useState(false);
  const { datastore } = useDatastoreSelector();
  const { character, unsavedChanges, setUnsavedChanges, dispatch } =
    useCharacter();
  const { saving, save } = useDatastore();
  const [fileSelected, setFileSelected] = useState<File | undefined>();
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const saveCharacter = useCallback(() => {
    if (!character) return;
    const fileContent = JSON.stringify(character);
    const blob = new Blob([fileContent], { type: "text/plain" });
    const a = document.createElement("a");
    a.download = `${character.name}.5echarsheet`;
    a.href = window.URL.createObjectURL(blob);
    a.click();
    a.remove();
    setUnsavedChanges(false);
  }, [character, setUnsavedChanges]);

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    setFileSelected(fileList[0]);
  };

  const loadCharacterData = useCallback(() => {
    if (!fileSelected) return;
    var reader = new FileReader();
    reader.readAsText(fileSelected, "UTF-8");
    reader.onload = (readerEvent) => {
      try {
        var content = readerEvent.target?.result;
        if (typeof content === "string") {
          const characterData = JSON.parse(content);
          const [valid, errors] = validateCharacterData(characterData);
          if (!valid) {
            console.error("Failed to load character data", errors);
            return;
          }
          dispatch(loadFullCharacter(characterData), false);
          setImportErrorMessage("");
          setModalOpen(false);
        } else {
          {
            setImportErrorMessage("Failed to import, invalid file chosen");
          }
        }
      } catch (e) {
        setImportErrorMessage(
          "Failed to import, unexpected error. Check the console for more details"
        );
        console.error(e);
      }
    };
  }, [fileSelected, dispatch]);

  const saveIndicator = saving ? (
    <FaSpinner />
  ) : unsavedChanges ? (
    <FaTriangleExclamation />
  ) : (
    <FaCheck />
  );

  const pageTitle = "Home";

  return (
    <>
      <div id="nav">
        {/* TODO: mobile-friendly nav */}
        <nav id="main-nav">
          <button onClick={toggleSidebar}>
            <FaBars />
          </button>
          <Link to="/">
            <button>
              <FaHouse />
            </button>
          </Link>

          <h1 className="margin-medium">{pageTitle}</h1>
          <button
            className="margin-medium"
            disabled={!datastore}
            onClick={(e) => {
              e.preventDefault();
              setModalOpen(true);
            }}
          >
            <FaFileImport />
          </button>
          <button
            className="margin-medium"
            onClick={saveCharacter}
            disabled={!character}
          >
            <FaFileExport />
          </button>
          <SharingToggle />
        </nav>
        {character && (
          <div id="save-container">
            <p className="margin-small">{saveIndicator}</p>
            <button onClick={() => save(character)}>
              <FaFloppyDisk />
            </button>
          </div>
        )}
      </div>
      {modalOpen && (
        <div className="modal-container">
          <div
            className="modal-background"
            onClick={(e) => {
              e.preventDefault();
              setModalOpen(true);
            }}
          />
          <div className="modal-content">
            <div className="row space-between flex-direction-row-reverse">
              <div className="close">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setModalOpen(true);
                  }}
                >
                  x
                </button>
              </div>
            </div>
            <h1>Choose a file to import</h1>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".5echarsheet"
            />
            <p style={{ color: "red" }}>{importErrorMessage}</p>
            <button disabled={!fileSelected} onClick={loadCharacterData}>
              Load character
            </button>
          </div>
        </div>
      )}
      <div className="flex">
        {showSidebar && <Sidebar />}
        <div id="detail">
          <Outlet />
        </div>
      </div>
    </>
  );
}
