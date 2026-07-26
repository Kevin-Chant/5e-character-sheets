import { useState } from "react";
import { FaGoogleDrive, FaLaptop } from "react-icons/fa6";
import { Link } from "react-router-dom";
import LocalDatastore from "src/datastores/local-datastore";
import Spinner from "src/components/spinner";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { writeLastDatastore } from "src/lib/last-datastore";
import { Character } from "src/lib/types";

// The step between resolving a code and becoming a participant.
//
// It exists because three separate questions have nowhere else to live, and all
// three are about the sheet rather than the session:
//
//  1. **Which sheet am I bringing** — or none, for a player waiting on the DM
//     and for a DM who isn't playing a character.
//  2. **Where do my characters live** — this is the moment not having a
//     datastore actually bites, so it's the moment worth offering one. Joining a
//     game is meant to be tangential to storage, and it stays that way: the
//     answer "nowhere, I'm just joining" is a real answer, not a dead end.
//  3. **What leaves my browser** — said here, where you're choosing the sheet,
//     rather than in a bar you've stopped reading.

export interface LobbySelection {
  // The sheet you play, opened locally and kept live.
  playAs?: Character;
  // Sheets put into the order without being opened. DM-side only.
  bring: Character[];
}

interface SessionLobbyProps {
  mode: "host" | "join";
  code?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (selection: LobbySelection) => void;
}

export default function SessionLobby({
  mode,
  code,
  busy,
  error,
  onCancel,
  onConfirm,
}: SessionLobbyProps) {
  const { datastore } = useDatastoreSelector();
  const { characters, characterLoading } = useDatastore();
  const { setDatastore } = useDatastoreSelector();
  const [playAs, setPlayAs] = useState<Character | undefined>();
  const [brought, setBrought] = useState<Record<string, boolean>>({});

  const hosting = mode === "host";
  const selected = characters.filter((c) => brought[c.uuid]);

  // No datastore is the *storage-less joiner* — a real case, not an error, so
  // it's offered alongside picking a backend rather than behind it.
  if (!datastore) {
    return (
      <div className="lobby">
        <h2>{hosting ? "Start a game" : "Join a game"}</h2>
        <p className="text-muted">
          Your characters are saved somewhere before you can bring one. Pick a
          place, or come in without a sheet.
        </p>
        <div className="lobby-storage">
          <Link className="button-link no-underline" to="/auth">
            <FaGoogleDrive /> Use Google Drive
          </Link>
          <button
            type="button"
            onClick={() => {
              setDatastore(LocalDatastore);
              writeLastDatastore("local");
            }}
          >
            <FaLaptop /> Keep them in this browser
          </button>
        </div>
        <div className="lobby-actions">
          <button type="button" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onConfirm({ bring: [] })}
          >
            {busy ? "Connecting…" : "Continue without a sheet"}
          </button>
        </div>
        {error && <p className="session-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="lobby">
      <h2>{hosting ? "Start a game" : "Join a game"}</h2>
      {code && (
        <p className="text-muted">
          Session <code>{code}</code>
        </p>
      )}
      <p className="text-muted">
        {hosting
          ? "You'll be running this table. Bring any sheets you want in the order — party characters, companions, NPC stat blocks. Their players can take them over by opening them."
          : "Pick the sheet you're playing. Your DM can hand you one instead, so coming in without one is fine."}
      </p>

      {characterLoading && (
        <p>
          Loading your characters <Spinner />
        </p>
      )}

      {!characterLoading && characters.length === 0 && (
        <p className="text-muted">
          You haven&apos;t made any characters yet. You can join now and bring
          one later.
        </p>
      )}

      <ul className="lobby-characters">
        {characters.map((entry) => {
          const chosen = hosting ? !!brought[entry.uuid] : playAs === entry;
          return (
            <li key={entry.uuid}>
              <label className={chosen ? "chosen" : undefined}>
                <input
                  type={hosting ? "checkbox" : "radio"}
                  name="lobby-character"
                  checked={chosen}
                  onChange={() =>
                    hosting
                      ? setBrought((current) => ({
                          ...current,
                          [entry.uuid]: !current[entry.uuid],
                        }))
                      : setPlayAs(chosen ? undefined : entry)
                  }
                />
                <span className="lobby-character-name">{entry.name}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Said at the moment of choosing, because this is the only moment the
          answer can still be no. */}
      <p className="lobby-privacy text-muted">
        The table sees name, initiative, HP, AC, conditions and concentration.
        Your sheet itself stays in this browser.
      </p>

      <div className="lobby-actions">
        <button type="button" onClick={onCancel}>
          Back
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            onConfirm(hosting ? { bring: selected } : { playAs, bring: [] })
          }
        >
          {busy
            ? "Connecting…"
            : hosting
              ? selected.length > 0
                ? `Start with ${selected.length} sheet${selected.length === 1 ? "" : "s"}`
                : "Start the session"
              : playAs
                ? `Join as ${playAs.name}`
                : "Join without a sheet"}
        </button>
      </div>
      {error && <p className="session-error">{error}</p>}
    </div>
  );
}
