import { useEffect, useRef, useState } from "react";
import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { SharePresenceEntry } from "src/lib/share-presence";

// How often we refresh our heartbeat and check for other editors. Comfortably
// under PRESENCE_FRESH_MS so a peer stays "present" across one slow round-trip.
const POLL_MS = 25_000;

// Warns when someone else is editing the same shared Google Drive character
// while there is *no* live session to co-edit through — the one case the WAMP
// presence roster can't cover (e.g. two recipients editing with the owner
// offline). Detection rides on a Drive appProperties heartbeat; see
// `src/lib/share-presence.ts`. Independent of the auto-live-session setting: even
// with auto-sessions off, silent clobbering deserves a warning.
export default function SharePresenceWarning() {
  const { character } = useCharacter();
  const { datastore } = useDatastoreSelector();
  const { clientId, getRole, getIdentity } = useSharingSessions();

  const uuid = character?.uuid;
  const shareRole = uuid ? datastore?.getShareRole?.(uuid) : undefined;
  const inSession = uuid ? !!getRole(uuid) : false;
  const supported = !!datastore?.heartbeatSharePresence;
  const active = !!uuid && !!shareRole && supported && !inSession;

  const [others, setOthers] = useState<SharePresenceEntry[]>([]);
  // Number of peers present when the user last dismissed the banner; it re-shows
  // only if a *new* editor pushes the count above this.
  const [dismissedAt, setDismissedAt] = useState(0);

  // Read the resolved display name synchronously inside the polling closure.
  const nameRef = useRef("");
  nameRef.current = uuid ? getIdentity(uuid).name : "";

  useEffect(() => {
    if (!active || !uuid) {
      setOthers([]);
      return;
    }
    let cancelled = false;
    const heartbeat = async () => {
      const peers = await datastore!.heartbeatSharePresence!(uuid, {
        clientId,
        name: nameRef.current,
      });
      if (!cancelled) setOthers(peers);
    };
    heartbeat();
    const interval = setInterval(heartbeat, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      // Best-effort: drop our heartbeat so peers stop seeing us promptly.
      datastore?.clearSharePresence?.(uuid, clientId);
    };
    // datastore/clientId are stable for a given open character.
  }, [active, uuid]);

  // Keep the dismiss baseline from drifting above the current peer count.
  useEffect(() => {
    if (others.length === 0 && dismissedAt !== 0) setDismissedAt(0);
  }, [others.length, dismissedAt]);

  if (!active || others.length === 0 || others.length <= dismissedAt) {
    return null;
  }

  const names = Array.from(new Set(others.map((o) => o.name)));
  const who =
    names.length === 1
      ? `${names[0]} is`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are`
        : `${names.length} other people are`;

  return (
    <div className="share-presence-banner" role="status">
      <FaTriangleExclamation aria-hidden />
      <span>
        {who} also editing this character right now. Without a live session your
        changes may overwrite each other.
      </span>
      <button
        className="share-presence-dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissedAt(others.length)}
      >
        <FaXmark />
      </button>
    </div>
  );
}
