import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CharacterPicker from "src/components/character-picker";
import CharSheet from "src/components/charsheet";
import ErrorBoundary from "src/components/error-boundary";
import { resetCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { Character } from "src/lib/types";

function downloadRawCharacter(character: Character) {
  const blob = new Blob([JSON.stringify(character, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.download = `${character.name || "character"}.5echarsheet`;
  a.href = window.URL.createObjectURL(blob);
  a.click();
  a.remove();
}

export default function SheetContainer() {
  const { character, dispatch } = useCharacter();
  const { datastore } = useDatastoreSelector();
  const navigate = useNavigate();

  // A remote joiner has no datastore but does have a character pushed into
  // context, so only bounce home when there's genuinely nothing to show.
  useEffect(() => {
    if (!datastore && !character) navigate("/");
  }, []);

  if (!datastore && !character) {
    return <></>;
  }
  return (
    <>
      {!character && datastore && <CharacterPicker />}
      {character && (
        <ErrorBoundary
          resetKey={character.uuid}
          fallback={(error) => (
            <div className="column flex-start margin">
              <h2>This character couldn&apos;t be displayed</h2>
              <p>
                Something in this character&apos;s data caused an error while
                rendering. Your other characters are unaffected. You can
                download a backup of the raw data and then return to the
                character list.
              </p>
              <pre className="margin-small">{String(error.message)}</pre>
              <div className="row">
                <button
                  className="margin-small"
                  onClick={() => downloadRawCharacter(character)}
                >
                  Download raw JSON
                </button>
                <button
                  className="margin-small"
                  onClick={() => dispatch(resetCharacter())}
                >
                  Back to character list
                </button>
              </div>
            </div>
          )}
        >
          <CharSheet />
        </ErrorBoundary>
      )}
    </>
  );
}
