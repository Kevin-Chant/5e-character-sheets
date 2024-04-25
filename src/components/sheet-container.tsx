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
import { leaveSharingSession, startSharingSession } from "src/lib/sharing";
import { validateCharacterData } from "src/lib/utils";

export default function SheetContainer() {
  const [fileSelected, setFileSelected] = useState<File | undefined>();
  const { character, dispatch, setUnsavedChanges } = useCharacter();
  const [modalOpen, setModalOpen] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState("");
  const { datastore } = useDatastoreSelector();
  const navigate = useNavigate();

  useEffect(() => {
    if (!datastore) navigate("/");
  }, []);

  useEffect(() => {
    if (character?.uuid) {
      console.log("Joining session for", character.uuid);
      startSharingSession(character.uuid, dispatch);
      return () => {
        console.log("Leaving session for", character.uuid);
        leaveSharingSession(character.uuid);
      };
    }
  }, [character?.uuid]);

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

  const loadDefaultCharacter = useCallback(() => {
    dispatch(loadFullCharacter(defaultCharacter), false);
  }, [dispatch]);

  if (!datastore) {
    return <></>;
  }
  return (
    <>
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
      <div className="header">
        <h1>{datastore.name}</h1>
        <button onClick={saveCharacter} disabled={!character}>
          Export to file
        </button>
        <div>
          <button
            onClick={(e) => {
              e.preventDefault();
              setModalOpen(true);
            }}
          >
            Load from file
          </button>
        </div>
      </div>
      {!character && (
        <button onClick={loadDefaultCharacter}>Create new character</button>
      )}
      {character && <CharSheet />}
    </>
  );
}
