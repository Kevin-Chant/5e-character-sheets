// Lightweight "someone else is editing this file" awareness for shared Google
// Drive characters that have no live WAMP session (e.g. two recipients editing
// while the owner is offline — see the auto-bootstrap doc). Presence can't help
// there because it only exists inside a session, so we piggy-back on the one
// channel every collaborator shares before any session: the Drive file's
// `appProperties`. Each open client stamps a heartbeat key and reads the others'.
//
// This module is the pure, unit-tested core; the datastore wraps it around the
// gapi calls that read/patch the metadata.

// One heartbeat key per client, e.g. "editor_<clientId>" -> "<epochMs>|<name>".
export const EDITOR_PREFIX = "editor_";

// An editor counts as "here" if seen within this window; a heartbeat older than
// the TTL is pruned so stale keys don't accumulate toward Drive's per-file
// appProperties cap. FRESH is comfortably larger than the poll cadence so one
// slow round-trip doesn't flap an active editor out of view.
export const PRESENCE_FRESH_MS = 60_000;
export const PRESENCE_TTL_MS = 10 * 60_000;

export interface SharePresenceEntry {
  clientId: string;
  name: string;
  at: number; // epoch ms of the last heartbeat
}

export interface SharePresenceSelf {
  clientId: string;
  name: string;
}

/**
 * Given the file's current `appProperties`, compute (a) the metadata patch to
 * apply — our own refreshed heartbeat plus null-outs for any heartbeat past the
 * TTL — and (b) the list of *other* editors seen within the fresh window. Never
 * touches non-`editor_` keys (so the SHARED_* markers are preserved) and never
 * prunes a peer that is merely stale-but-not-expired, avoiding races with a
 * heartbeat that peer just wrote.
 */
export function computePresenceUpdate(
  appProperties: Record<string, string>,
  self: SharePresenceSelf,
  now: number,
): { patch: Record<string, string | null>; others: SharePresenceEntry[] } {
  const patch: Record<string, string | null> = {
    [EDITOR_PREFIX + self.clientId]: `${now}|${self.name}`,
  };
  const others: SharePresenceEntry[] = [];

  for (const [key, value] of Object.entries(appProperties)) {
    if (!key.startsWith(EDITOR_PREFIX)) continue;
    const clientId = key.slice(EDITOR_PREFIX.length);
    if (clientId === self.clientId) continue;

    const sep = value.indexOf("|");
    const at = Number(sep === -1 ? value : value.slice(0, sep));
    if (Number.isNaN(at)) continue;
    const name =
      sep === -1 || sep === value.length - 1 ? "Someone" : value.slice(sep + 1);

    if (now - at > PRESENCE_TTL_MS) {
      patch[key] = null; // very old — safe to prune
    } else if (now - at <= PRESENCE_FRESH_MS) {
      others.push({ clientId, name, at });
    }
  }

  return { patch, others };
}
