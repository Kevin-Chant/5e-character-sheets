import { UUID } from "crypto";
import { Action } from "src/lib/hooks/reducers/actions";

// Cross-tab edit sync: the same dispatch replay the live-sharing layer runs
// over WAMP, carried over a `BroadcastChannel` instead — so two tabs of this
// browser with the same character open converge instantly, with no sidecar, no
// Drive round-trip, and no polling. It exists because there is otherwise *no*
// cross-tab path at all: both datastores cache and never re-read, so a second
// tab used to show a character frozen at whatever it looked like on load.
//
// This is a transport, not a policy layer. Who applies a message, whether it
// re-enters a WAMP realm, and what it does to the dirty flag are all decided
// where the character lives (`use-character.tsx`); the one policy fact encoded
// here is `origin`, which is what keeps the two transports from feeding each
// other loops:
//
// - `"local"` — a user edit in some tab. Every sibling tab applies it, and a
//   sibling holding an open sharing session forwards it into the realm, so an
//   edit made in the tab *without* the session still reaches remote peers.
// - `"remote"` — an edit that arrived over WAMP. Siblings apply it and stop:
//   re-forwarding it would bounce a peer's edit straight back into the realm
//   it came from.
//
// Both transports replay whole-value `update_*` actions (and whole-character
// `replace_character`s), so a message applied twice — routine when two tabs
// share both the channel and a realm — lands on the same state it left.
//
// A tab never receives its own posts: the spec excludes the posting
// `BroadcastChannel` object, and each tab holds exactly one (the module
// singleton below).

export const TAB_SYNC_CHANNEL = "net.dndcharactersheets.tabsync";

export interface TabEditMessage {
  kind: "dispatch";
  uuid: UUID;
  action: Action;
  dirtyAction?: boolean;
  origin: "local" | "remote";
}

// The encounter's ride on the same channel. Unlike character edits — replayed
// as actions — the encounter travels whole and the receiver *merges* it
// (`receiveState`), because the lane counters make a whole-document merge
// converge and an action stream doesn't exist for it. The bounce terminates by
// identity: a merge that changes nothing returns the same object, and an
// unchanged update doesn't republish.
//
// `code` is the table the sender is connected to, if any. A receiver connected
// to a *different* table ignores the message — two tabs at two tables already
// contend for the one stored encounter, and cross-feeding them would make that
// worse. A disconnected receiver takes anything: the encounter is this
// browser's one encounter, and the connected tab holds its freshest copy.
export interface TabEncounterMessage {
  kind: "encounter";
  encounter: unknown;
  code?: string;
}

// Lazy singleton. `BroadcastChannel` is missing in jsdom (component tests), so
// absence degrades to "no cross-tab sync" rather than a crash — the same
// posture the app takes toward a missing sidecar.
let channel: BroadcastChannel | undefined;
function getChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  if (!channel) {
    channel = new BroadcastChannel(TAB_SYNC_CHANNEL);
    // Node's implementation holds the event loop open; unref (browser channels
    // don't have it) so a test worker can exit.
    (channel as { unref?: () => void }).unref?.();
  }
  return channel;
}

export function publishTabEdit(message: Omit<TabEditMessage, "kind">): void {
  getChannel()?.postMessage({ kind: "dispatch", ...message });
}

export function publishTabEncounter(
  message: Omit<TabEncounterMessage, "kind">,
): void {
  getChannel()?.postMessage({ kind: "encounter", ...message });
}

// Returns the unsubscribe. Messages are shape-checked just enough to drop a
// stray post from an old app version rather than dispatch garbage.
export function subscribeTabEdits(
  handler: (message: TabEditMessage) => void,
): () => void {
  const target = getChannel();
  if (!target) return () => {};
  const onMessage = (event: MessageEvent) => {
    const message = event.data as TabEditMessage | undefined;
    if (!message || message.kind !== "dispatch") return;
    if (!message.uuid || !message.action?.type) return;
    handler(message);
  };
  target.addEventListener("message", onMessage);
  return () => target.removeEventListener("message", onMessage);
}

// The encounter's structural validation (`isEncounter`) stays with the
// consumer — this layer doesn't import the play model.
export function subscribeTabEncounters(
  handler: (message: TabEncounterMessage) => void,
): () => void {
  const target = getChannel();
  if (!target) return () => {};
  const onMessage = (event: MessageEvent) => {
    const message = event.data as TabEncounterMessage | undefined;
    if (!message || message.kind !== "encounter") return;
    if (!message.encounter) return;
    handler(message);
  };
  target.addEventListener("message", onMessage);
  return () => target.removeEventListener("message", onMessage);
}
