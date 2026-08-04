import { sum } from "lodash";
import {
  FaCloudArrowUp,
  FaPlus,
  FaRotateRight,
  FaTowerBroadcast,
  FaTriangleExclamation,
} from "react-icons/fa6";
import DriveAccountNotice from "src/components/drive-account-notice";
import ShareRoleBadge from "src/components/share-role-badge";
import Spinner from "src/components/spinner";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useCharacterBuilder } from "src/lib/hooks/use-character-builder";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { formatClass } from "src/lib/utils";

// Landing gallery shown when a datastore is selected but no character is open.
// Previews each saved character as a card and offers a "create" affordance.
export default function CharacterPicker() {
  const { characters, characterLoading, unsynced, loadError, refresh } =
    useDatastore();
  const { dispatch } = useCharacter();
  const { getRole } = useSharingSessions();
  const { openBuilder } = useCharacterBuilder();

  return (
    <div className="character-picker">
      <div className="character-picker-header">
        <h1>Your characters</h1>
        {characterLoading && <Spinner />}
      </div>

      <DriveAccountNotice />

      {/* An empty list and an unreadable one look identical and mean opposite
          things. Saying "no characters yet" over a failed fetch invites you to
          make a new one in a store that couldn't be read — and, with Drive,
          into an account whose sheets are still there. */}
      {loadError && (
        <div className="character-picker-error">
          <FaTriangleExclamation />
          <p>
            Couldn&apos;t load your characters. They&apos;re still in storage —
            this is a connection problem, not a missing sheet.
          </p>
          <button onClick={refresh}>
            <FaRotateRight /> Try again
          </button>
        </div>
      )}

      {characters.length === 0 && !characterLoading && !loadError && (
        <p className="text-muted character-picker-empty">
          No characters yet. Get started by creating a new sheet:
        </p>
      )}

      <div className="option-grid">
        {characters.map((char) => {
          const totalLevel = sum(char.class.map((klass) => klass.level));
          return (
            <button
              key={char.uuid}
              id={char.uuid}
              className="option-card character-card"
              onClick={() => dispatch(loadPersistedCharacter(char))}
            >
              <h2 className="character-card-name">
                {getRole(char.uuid) === "host" && (
                  <FaTowerBroadcast
                    className="character-card-badge"
                    title="Live sharing session in progress"
                  />
                )}
                {unsynced.has(char.uuid) && (
                  <FaCloudArrowUp
                    className="character-card-badge unsynced-badge"
                    title="Still saving to storage — the sheet is safe to open"
                  />
                )}
                <ShareRoleBadge
                  uuid={char.uuid}
                  className="character-card-badge"
                />
                {char.name}
              </h2>
              <p className="text-muted">
                Level {totalLevel} · {char.race.name}
              </p>
              <p className="text-muted">{formatClass(char.class)}</p>
            </button>
          );
        })}

        {/* Withheld while the store is unreadable: a character created now
            would be written into a backend we just failed to read, which is
            the one situation where "create" can lose work rather than make
            it. */}
        {!loadError && (
          <button className="option-card create-card" onClick={openBuilder}>
            <span className="option-card-icon">
              <FaPlus />
            </span>
            <span>Create new character</span>
          </button>
        )}
      </div>
    </div>
  );
}
