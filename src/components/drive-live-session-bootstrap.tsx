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

// Auto-connects the two sides of a shared Google Drive character into one live
// session, so co-editing "just works" the way Drive users expect — no manual
// toggle, no code exchange. The WAMP realm is the character uuid, so both sides
// already address the same realm; we only decide who hosts:
//   - "owner"     (a shareable doc we created) auto-hosts the realm.
//   - "recipient" (a doc shared *with* us)     auto-joins, retrying until the
//                                              owner comes online.
// Renders nothing. Mirrors the renderless-effect pattern of PresenceBroadcaster.
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

  // Characters we've already auto-acted on, so we don't re-host after a manual
  // opt-out (flipping the share toggle off) or fire twice for the same uuid.
  const handledRef = useRef<Set<string>>(new Set());
  // Latest unsavedChanges, readable synchronously inside the async join flow.
  const unsavedRef = useRef(unsavedChanges);
  unsavedRef.current = unsavedChanges;

  useEffect(() => {
    if (!uuid || !autoEnabled || !shareRole) return;
    // A character we've joined remotely is owned by the host — never re-host it.
    if (getRole(uuid) === "remote") return;

    if (shareRole === "owner") {
      // Host once; if the sidecar is unreachable we stay solo quietly.
      if (getRole(uuid) || handledRef.current.has(uuid)) return;
      handledRef.current.add(uuid);
      openSharingSession({ silent: true });
      return;
    }

    // Recipient: keep probing until the owner's realm exists, then pull their
    // current character over the session.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const applyJoined = async () => {
      const hostCharacter = await getCharacter();
      if (cancelled || !hostCharacter) return;
      const result = hydrateCharacter(hostCharacter);
      if (!result.ok) {
        console.error("Joined character failed validation", result.errors);
        return;
      }
      const load = () => dispatch(loadPersistedCharacter(result.character));
      // Joining replaces the in-memory character with the host's copy. If we
      // made solo edits while the owner was offline, confirm before discarding
      // them; otherwise join silently.
      if (unsavedRef.current) {
        show({
          title: "Rejoin live session?",
          subtitle:
            "The owner is online. Joining will replace your unsaved local changes with their copy.",
          confirmText: "Rejoin",
          cancelText: "Keep editing solo",
          type: "warning",
          onConfirm: load,
          onCancel: () => disconnect(),
        });
      } else {
        load();
      }
    };

    const attempt = async () => {
      if (cancelled) return;
      try {
        await joinSession(uuid);
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
      if (getRole(uuid) === "remote") disconnect();
    };
    // getRole/dispatch/session helpers are stable enough; re-running only on the
    // character or the auto-session toggle is intended (exhaustive-deps is off).
  }, [uuid, shareRole, autoEnabled]);

  return null;
}
