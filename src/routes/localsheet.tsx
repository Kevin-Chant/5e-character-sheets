import React, { useCallback, useState } from "react";
import CharSheet from "src/components/charsheet";
import { defaultCharacter } from "src/lib/data/default-data";
import { loadFullCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { validateCharacterData } from "src/lib/utils";

export default function LocalSheet() {
  const [fileSelected, setFileSelected] = useState<File | undefined>();
  const { character, dispatch, setUnsavedChanges } = useCharacter();

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
      var content = readerEvent.target?.result;
      if (typeof content === "string") {
        const characterData = JSON.parse(content);
        const [valid, errors] = validateCharacterData(characterData);
        if (!valid) {
          console.error("Failed to load character data", errors);
          return;
        }
        dispatch(loadFullCharacter(characterData), false);
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

  return (
    <>
      <h1>Local sheet</h1>
      {character && <button onClick={saveCharacter}>Save</button>}
      {!character && (
        <button onClick={loadDefaultCharacter}>Create new character</button>
      )}
      <div>
        <input type="file" onChange={handleFileChange} accept=".5echarsheet" />
        <button onClick={loadCharacterData}>Load</button>
      </div>
      {character && <CharSheet />}
    </>
  );
}
