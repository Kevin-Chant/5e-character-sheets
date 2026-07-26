import { useEffect, useState } from "react";
import { FaGoogleDrive, FaLaptop } from "react-icons/fa6";
import { Link } from "react-router-dom";
import LocalDatastore from "src/datastores/local-datastore";
import Spinner from "src/components/spinner";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastDatastore, writeLastDatastore } from "src/lib/last-datastore";
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
  // What the table should call a joiner with no sheet — the name the DM sees
  // when handing one out. Ignored when a character is chosen: its name wins.
  displayName?: string;
}

interface SessionLobbyProps {
  mode: "host" | "join";
  code?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (selection: LobbySelection) => void;
}

// A sheetless joiner is a real person the DM may want to hand a sheet to, and
// without a character there is no name to know them by.
function NameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="lobby-name">
      <span className="text-muted">What should the table call you?</span>
      <input
        type="text"
        aria-label="Your name at the table"
        placeholder="Player"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
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
  const [displayName, setDisplayName] = useState("");

  const hosting = mode === "host";
  const selected = characters.filter((c) => brought[c.uuid]);

  // A deep link (or a refresh) lands here with no datastore selected even when
  // this browser has already answered the storage question — home normally
  // re-selects it on the way through, but nothing forces that route. Adopt the
  // remembered local choice instead of re-asking; Drive still needs its OAuth
  // round-trip, so it stays a button.
  useEffect(() => {
    if (!datastore && readLastDatastore() === "local") {
      setDatastore(LocalDatastore);
    }
  }, [datastore, setDatastore]);

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
        {!hosting && (
          <NameField value={displayName} onChange={setDisplayName} />
        )}
        <div className="lobby-actions">
          <button type="button" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              onConfirm({ bring: [], displayName: displayName.trim() })
            }
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
          ? "You'll be running this table. Bring any sheets you want in the order — party characters, companions, NPC stat blocks. From the table you can hand them to players, or leave them offered for pickup."
          : "Pick the sheet you're playing. Your DM can hand you one at the table instead, so coming in without one is fine."}
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

      {/* Only worth asking when no character will speak for you: the DM hands
          sheets out by name, and a sheetless joiner otherwise has none. */}
      {!hosting && !playAs && (
        <NameField value={displayName} onChange={setDisplayName} />
      )}

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
            onConfirm(
              hosting
                ? { bring: selected }
                : { playAs, bring: [], displayName: displayName.trim() },
            )
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
