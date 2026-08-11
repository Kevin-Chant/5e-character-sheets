import { useEffect, useRef } from "react";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastoreSelector } from "src/lib/hooks/use-datastore-selector";
import {
  useRemoteSharingSession,
  useSharingSessions,
} from "src/lib/hooks/use-sharing-session";
import { useSettings } from "src/lib/hooks/use-settings";
import { useConfirm } from "src/lib/hooks/confirm/confirm.hooks";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";

// How often a recipient re-attempts to join while the owner isn't online yet.
const JOIN_RETRY_MS = 15_000;

// Auto-connects both sides of a shared Google Drive character into one live
// session. Realm = character uuid. "owner" auto-hosts; "recipient" auto-joins,
// retrying until the owner comes online. Renders nothing.
export default function DriveLiveSessionBootstrap() {
  const { character, dispatch, openSharingSession, unsavedChanges } =
    useCharacter();
  const { datastore } = useDatastoreSelector();
  const { getRole } = useSharingSessions();
  const { joinSession, getCharacter, disconnect } =
    useRemoteSharingSession(dispatch);
  const { settings } = useSettings();
  const { show } = useConfirm();

  const uuid = character?.uuid;
  const shareRole = uuid ? datastore?.getShareRole?.(uuid) : undefined;
  const autoEnabled = settings.autoLiveSession;

  // Characters already auto-acted on, so we don't re-host after opt-out or fire twice.
  const handledRef = useRef<Set<string>>(new Set());
  // Latest unsavedChanges, readable synchronously inside the async join flow.
  const unsavedRef = useRef(unsavedChanges);
  unsavedRef.current = unsavedChanges;
  // Which sheet is open now, for the deferred confirm below (can outlive the character it was raised for).
  const openUuidRef = useRef(uuid);
  openUuidRef.current = uuid;

  useEffect(() => {
    if (!uuid || !autoEnabled || !shareRole) return;
    // A character joined remotely is host-owned — never re-host it.
    if (getRole(uuid) === "remote") return;

    if (shareRole === "owner") {
      // Host once; if the sidecar is unreachable we stay solo quietly.
      if (getRole(uuid) || handledRef.current.has(uuid)) return;
      handledRef.current.add(uuid);
      openSharingSession({ silent: true });
      return;
    }

    // Recipient: poll until the owner's realm exists, then pull their character.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const applyJoined = async () => {
      const hostCharacter = await getCharacter(uuid);
      if (cancelled || !hostCharacter) return;
      const result = hydrateCharacter(hostCharacter);
      if (!result.ok) {
        console.error("Joined character failed validation", result.errors);
        return;
      }
      // Re-checked when it runs, not when offered: the confirm below waits on
      // a human and the open sheet can change meanwhile. `cancelled` only
      // covers the effect unmounting, hence the separate openUuidRef check.
      const load = () => {
        if (cancelled || openUuidRef.current !== uuid) return;
        dispatch(loadPersistedCharacter(result.character));
      };
      // Joining replaces the in-memory character; confirm first if we made
      // solo edits while the owner was offline.
      if (unsavedRef.current) {
        show({
          title: "Rejoin live session?",
          subtitle:
            "The owner is online. Joining will replace your unsaved local changes with their copy.",
          confirmText: "Rejoin",
          cancelText: "Keep editing solo",
          type: "warning",
          onConfirm: load,
          onCancel: () => disconnect(uuid),
        });
      } else {
        load();
      }
    };

    const attempt = async () => {
      if (cancelled) return;
      try {
        await joinSession(uuid);
        // The join can resolve after this effect tore down (character switched
        // mid-flight); getRole scopes the disconnect to our uuid so a session
        // opened meanwhile is left alone.
        if (cancelled) {
          if (getRole(uuid) === "remote") disconnect(uuid);
          return;
        }
        await applyJoined();
      } catch {
        // Owner isn't online yet (realm not open) — retry quietly.
        if (!cancelled) timer = setTimeout(attempt, JOIN_RETRY_MS);
      }
    };
    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Leave the owner's session when switching away or unmounting.
      if (getRole(uuid) === "remote") disconnect(uuid);
    };
    // Deps intentionally limited to uuid/shareRole/autoEnabled (exhaustive-deps is off).
  }, [uuid, shareRole, autoEnabled]);

  return null;
}
