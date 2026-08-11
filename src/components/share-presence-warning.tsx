import { useEffect, useRef, useState } from "react";
import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import { useSharingSessions } from "src/lib/hooks/use-sharing-session";
import { SharePresenceEntry } from "src/lib/share-presence";

// Comfortably under PRESENCE_FRESH_MS so a peer stays "present" across one
// slow round-trip.
const POLL_MS = 25_000;

// Warns when someone else is editing the same shared Drive character with no
// live session to co-edit through. Detection rides a Drive appProperties
// heartbeat; see `src/lib/share-presence.ts`.
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
  // Peer count at last dismissal; banner re-shows only if it's exceeded.
  const [dismissedAt, setDismissedAt] = useState(0);

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
      datastore?.clearSharePresence?.(uuid, clientId);
    };
  }, [active, uuid]);

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
