import { FaTriangleExclamation } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";

// The two arms of a save the datastore refused (SaveConflictError): someone
// else's save landed since our last read, and only a person can say which
// version is the character now. A banner rather than a modal — both copies
// are safe while it waits (theirs in storage, ours in this tab), so the
// choice shouldn't block editing or be spent by a stray Escape.
export default function SaveConflictBanner() {
  const { character, saveConflict, resolveSaveConflict } = useCharacter();
  if (!saveConflict || character?.uuid !== saveConflict.uuid) return null;

  return (
    <div className="share-presence-banner" role="alert">
      <FaTriangleExclamation aria-hidden />
      <span>
        Someone else saved changes to this character while you were editing, so
        your latest edits haven&apos;t been saved. Which version should this
        character be?
      </span>
      <button
        className="btn-secondary"
        onClick={() => resolveSaveConflict("theirs")}
      >
        Load theirs
      </button>
      <button onClick={() => resolveSaveConflict("mine")}>Keep mine</button>
    </div>
  );
}
