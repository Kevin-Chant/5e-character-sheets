import { sum } from "lodash";
import { FaPlus, FaTowerBroadcast } from "react-icons/fa6";
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
  const { characters, characterLoading } = useDatastore();
  const { dispatch } = useCharacter();
  const { getRole } = useSharingSessions();
  const { openBuilder } = useCharacterBuilder();

  return (
    <div className="character-picker">
      <div className="character-picker-header">
        <h1>Your characters</h1>
        {characterLoading && <Spinner />}
      </div>

      {characters.length === 0 && !characterLoading && (
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
                {char.name}
              </h2>
              <p className="text-muted">
                Level {totalLevel} · {char.race.name}
              </p>
              <p className="text-muted">{formatClass(char.class)}</p>
            </button>
          );
        })}

        <button className="option-card create-card" onClick={openBuilder}>
          <span className="option-card-icon">
            <FaPlus />
          </span>
          <span>Create new character</span>
        </button>
      </div>
    </div>
  );
}
