import { useEffect, useState } from "react";
import { FaGoogleDrive, FaLaptop } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import LocalDatastore from "src/datastores/local-datastore";
import Spinner from "src/components/spinner";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { readLastDatastore, writeLastDatastore } from "src/lib/last-datastore";
import {
  lastPlayedCharacter,
  sessionMemoryFor,
} from "src/lib/play/session-memory";
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
//
// Which of those it leads with is the whole difference between the people who
// arrive here. Someone whose DM told them not to worry about a character sheet
// should not meet a storage picker; someone rejoining the table they run should
// meet the sheets they brought last week, already ticked.
//
// Note that "hosting" and "running the table" aren't the same question. Hosting
// opens a realm and is where sheets get brought; a DM whose tab dropped *joins*
// the code again, and must not be asked about sheets a second time — the room
// already holds their monsters, at whatever HP the fight has left them on, and
// re-bringing would re-snapshot those from the full-health sheets. So there are
// three shapes here, not two: start a table, rejoin the table you run, and join
// someone else's.

export interface LobbySelection {
  // The sheet you play, opened locally and kept live.
  playAs?: Character;
  // Sheets put into the order without being opened. DM-side only.
  bring: Character[];
  // What the table should call a joiner with no sheet — the name the DM sees
  // when handing one out. Ignored when a character is chosen: its name wins.
  displayName?: string;
  // The DM's own label for this table, for their rejoin list. Optional.
  tableName?: string;
  // Whether this browser is running the table. Reported rather than inferred:
  // a DM who brought no sheets and a player who brought none look identical
  // from the outside, and the difference is what the next rejoin depends on.
  runningTable: boolean;
}

interface SessionLobbyProps {
  mode: "host" | "join";
  code?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (selection: LobbySelection) => void;
}

// Only shown when starting a table. A DM who runs one campaign never needs it;
// a DM who runs two can't tell their rejoin rows apart without it.
function TableNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="lobby-name">
      <span className="text-muted">
        Call this table something? (just for your own list)
      </span>
      <input
        type="text"
        aria-label="What to call this table"
        placeholder="Thursday game"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
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
  const { datastore, setDatastore } = useDatastoreSelector();
  const { characters, characterLoading } = useDatastore();
  const location = useLocation();

  // What this browser did at this table before. Read once — it's a localStorage
  // read whose answer can't change while the lobby is open.
  const [remembered] = useState(() =>
    code ? sessionMemoryFor(code) : undefined,
  );
  const hosting = mode === "host";
  // Coming back to a table this browser was running. The realm is still up (the
  // probe said so), so everything they brought is already in it.
  const resumingAsDm = !hosting && remembered?.seat === "dm";

  // Selections are held by uuid rather than by object because the character
  // list arrives asynchronously — a Drive fetch resolves after this mounts, and
  // a prefill has to survive that.
  // Falls back to whoever this browser played last. Codes churn week to week —
  // a DM who doesn't reopen the old one sends a new link every session — so the
  // per-code memory is empty far more often than the player's habit changes.
  const [playAsUuid, setPlayAsUuid] = useState<string | undefined>(
    () => remembered?.playAsUuid ?? lastPlayedCharacter()?.uuid,
  );
  const [broughtUuids, setBroughtUuids] = useState<string[]>(
    remembered?.broughtUuids ?? [],
  );
  const [displayName, setDisplayName] = useState(remembered?.displayName ?? "");
  const [tableName, setTableName] = useState(remembered?.title ?? "");

  const playAs = characters.find((c) => c.uuid === playAsUuid);
  const selected = characters.filter((c) => broughtUuids.includes(c.uuid));
  // Prefilled sheets that aren't in this datastore (deleted, or a different
  // Drive account) are dropped silently rather than counted — the button would
  // otherwise promise more sheets than it can bring.
  const prefilled = !!remembered && (!!playAs || selected.length > 0);

  // A deep link (or a refresh) lands here with no datastore selected even when
  // this browser has already answered the storage question — home normally
  // re-selects it on the way through, but an invite link doesn't go through
  // home at all. Adopt the remembered local choice instead of re-asking; Drive
  // still needs its OAuth round-trip, so it stays a button.
  useEffect(() => {
    if (!datastore && readLastDatastore() === "local") {
      setDatastore(LocalDatastore);
    }
  }, [datastore, setDatastore]);

  // Picking Drive leaves for an OAuth popup and comes back here. The lobby is a
  // URL now, so "back here" is just this path — no half-answered lobby needs
  // ferrying through router state.
  const driveLink = (
    <Link
      className="button-link no-underline"
      to="/auth"
      state={{ returnTo: location.pathname }}
    >
      <FaGoogleDrive /> Use Google Drive
    </Link>
  );
  const localButton = (
    <button
      type="button"
      onClick={() => {
        setDatastore(LocalDatastore);
        writeLastDatastore("local");
      }}
    >
      <FaLaptop /> Keep them in this browser
    </button>
  );

  const heading = hosting
    ? "Start a game"
    : resumingAsDm
      ? "Back to your table"
      : "Join a game";

  // Coming back to a table that's still running. There is nothing to ask: the
  // sheets are already in the room, and asking again would offer to re-snapshot
  // their HP from full-health sheets mid-fight.
  if (resumingAsDm) {
    return (
      <div className="lobby">
        <h2>{heading}</h2>
        <p className="text-muted">
          Session <code>{code}</code>
        </p>
        <p className="text-muted">
          Your table is still up, with everything you brought to it. Rejoining
          takes the DM controls back.
        </p>
        <div className="lobby-actions">
          <button type="button" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onConfirm({ bring: [], runningTable: true })}
          >
            {busy ? "Rejoining…" : "Rejoin the table"}
          </button>
        </div>
        {error && <p className="session-error">{error}</p>}
      </div>
    );
  }

  // No datastore at all. For a DM that's an ordinary way to run a game — the
  // players own the sheets — and for a player it's usually the one their DM
  // told them not to worry about. Neither should be met with a storage picker,
  // so the storage offer moves below the thing they came to do.
  if (!datastore) {
    return (
      <div className="lobby">
        <h2>{heading}</h2>
        {code && (
          <p className="text-muted">
            Session <code>{code}</code>
          </p>
        )}
        <p className="text-muted">
          {hosting
            ? "You'll be hosting this table. You don't need a character sheet to do it — initiative, HP and conditions are yours either way."
            : "You don't need a character sheet to join. Your DM can hand you one at the table."}
        </p>
        {hosting ? (
          <TableNameField value={tableName} onChange={setTableName} />
        ) : (
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
              onConfirm({
                bring: [],
                displayName: displayName.trim(),
                tableName: tableName.trim(),
                runningTable: hosting,
              })
            }
          >
            {busy
              ? "Connecting…"
              : hosting
                ? "Start the game"
                : "Join the game"}
          </button>
        </div>
        {error && <p className="session-error">{error}</p>}
        {/* Offered, not required. Someone who does have sheets saved somewhere
            is one click from bringing them; someone who doesn't never has to
            read past the button above. */}
        <details className="lobby-storage-offer">
          <summary>
            {hosting
              ? "Want to bring sheets to the table?"
              : "Already have a character saved somewhere?"}
          </summary>
          <p className="text-muted">
            Pick where your sheets live and they&apos;ll be listed here.
          </p>
          <div className="lobby-storage">
            {driveLink}
            {localButton}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h2>{heading}</h2>
      {code && (
        <p className="text-muted">
          Session <code>{code}</code>
        </p>
      )}
      <p className="text-muted">
        {hosting
          ? "You'll be hosting this table. Bring any sheets you want in the order — party characters, companions, NPC stat blocks. From the table you can hand them to players, or leave them offered for pickup."
          : "Pick the sheet you're playing. Your DM can hand you one at the table instead, so coming in without one is fine."}
      </p>

      {prefilled && (
        <p className="text-muted lobby-prefill">
          Carried over from last time — change it if tonight is different.
        </p>
      )}

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
          const chosen = hosting
            ? broughtUuids.includes(entry.uuid)
            : playAsUuid === entry.uuid;
          return (
            <li key={entry.uuid}>
              <label className={chosen ? "chosen" : undefined}>
                <input
                  type={hosting ? "checkbox" : "radio"}
                  name="lobby-character"
                  checked={chosen}
                  onChange={() =>
                    hosting
                      ? setBroughtUuids((current) =>
                          current.includes(entry.uuid)
                            ? current.filter((uuid) => uuid !== entry.uuid)
                            : [...current, entry.uuid],
                        )
                      : setPlayAsUuid(chosen ? undefined : entry.uuid)
                  }
                />
                <span className="lobby-character-name">{entry.name}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {hosting && <TableNameField value={tableName} onChange={setTableName} />}

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
                ? {
                    bring: selected,
                    tableName: tableName.trim(),
                    runningTable: true,
                  }
                : {
                    playAs,
                    bring: [],
                    displayName: displayName.trim(),
                    runningTable: false,
                  },
            )
          }
        >
          {busy
            ? "Connecting…"
            : hosting
              ? selected.length > 0
                ? `${mode === "host" ? "Start" : "Rejoin"} with ${selected.length} sheet${selected.length === 1 ? "" : "s"}`
                : mode === "host"
                  ? "Start the session"
                  : "Rejoin the table"
              : playAs
                ? `Join as ${playAs.name}`
                : "Join without a sheet"}
        </button>
      </div>
      {error && <p className="session-error">{error}</p>}
    </div>
  );
}
