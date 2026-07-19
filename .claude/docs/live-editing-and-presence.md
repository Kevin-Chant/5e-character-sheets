# Live editing & presence

Real-time co-editing runs over WAMP (an `autobahn-browser` client talking to the
`nightlife-rabbit` broker in `server/server.js`). It is an **overlay on top of
normal editing**, independent of where the character is persisted — the same
`update_*` actions that drive local edits (see
[character-state-and-edits.md](character-state-and-edits.md)) are simply also
published to peers. CLAUDE.md covers the connection/role fundamentals; this doc
covers the two message layers and the presence roster, all in
`src/lib/hooks/use-sharing-session.tsx` (+ `use-presence.tsx`).

## One realm per character, two roles

A session is a WAMP **realm named after the character uuid**. The **host** opens
the realm and registers the `FULL_SYNC` RPC that serves the current character to
anyone who joins; a **remote** (joiner) calls `FULL_SYNC` on connect to pull
initial state, then streams edits. The host owns persistence — a joined
character is never saved locally by the joiner.

Two design points that are easy to get wrong and must stay true:

- **Connections live in refs, not React state**, so teardown and full-sync
  handlers read them synchronously without a stale closure. `FULL_SYNC` in
  particular reads the character through a ref so it always serves the _current_
  value, not the one captured when the handler was registered.
- **The broker does not honor WAMP `exclude_me`, so publishers receive their own
  messages.** Every message carries this tab's `clientId`; handlers drop
  messages whose `senderId`/`clientId` is their own. Incoming edits are then
  dispatched with `suppressBroadcast` so applying them doesn't re-publish and
  loop. This self-echo filtering is the backbone of both layers below — don't
  remove the `clientId` stamp.

## Layer 1: edit sync (`DISPATCH`)

`SharingSessionsContext.broadcast(uuid, action)` publishes an edit action to the
realm; it's centralized and keyed by character uuid so host and joiner publish
over the _same_ connection, giving bidirectional editing. `makeDispatchHandler`
receives, filters self-echo, and replays the action into the local reducer. That
replay-a-serialized-action model works precisely because actions are
self-contained full-value writes.

## Layer 2: presence (`PRESENCE` / `LEAVE`)

Presence is a **separate, best-effort gossip layer** — losing a presence message
degrades a highlight, it never corrupts the character. It answers "who else is
here and which field are they editing," keyed by uuid then `clientId`:

- **Join handshake** — a newcomer publishes `hello`; everyone already in the
  realm replies with an `update` carrying their own name/color/field, so the
  newcomer assembles the full roster without a central directory.
- **Selection** — `broadcastSelection` announces which field path this tab has
  open (mirroring the targeted-field path, `null` when nothing is open), so
  peers can outline it in the editor's color. `use-presence.tsx` turns that into
  the actual highlight props on a field.
- **Heartbeat & liveness** — a single provider-wide timer re-announces presence
  every `HEARTBEAT_MS` and prunes any peer unheard-from past
  `PRESENCE_TIMEOUT_MS`. The timeout is 3× the interval on purpose: one dropped
  beat shouldn't flap an active editor out of the roster. This is the safety net
  for tabs that vanish without a clean `LEAVE` (a hard-closed browser).
- **Identity** — each tab's name + palette color persists in `localStorage` and
  is re-announced to every open session when changed mid-edit.

## Teardown is asymmetric

`teardownSession` differs by role and this asymmetry is deliberate: a **host**
publishes `CLOSE_SESSION` (so joiners clear the now-dead character and alert)
and then asks the server to close the realm; a **remote** just publishes `LEAVE`
so peers drop its chip. Joiners rely on `connection.onclose` as the authoritative
teardown signal and use an `intentionalDisconnect` ref to tell a user-initiated
leave apart from the host ending the session. autobahn's auto-reconnect is
suppressed (the `onclose` handler returns `true`) so a closed realm stays closed.

## Auto-bootstrap for shared Google Drive characters

Manually toggling a session and hand-exchanging a UUID code is friction Google
Drive users don't expect — if the owner shared the file in Drive, co-editing
should "just work." `src/components/drive-live-session-bootstrap.tsx` (a renderless
component mounted in `charsheet.tsx` beside `PresenceBroadcaster`) closes that gap
by **auto-driving the same host/remote hooks** — it adds no new sync machinery.

The pieces that make it cheap:

- **The realm is the character uuid**, so both sides already address the same
  realm with nothing to exchange. The only open question is who hosts.
- **The datastore already knows which side you're on**: `getShareRole(uuid)`
  returns `"owner"` for a promoted doc we created vs. `"recipient"` for one
  imported (shared _with_ us) via the Picker — derived from `importedIndex` vs.
  `knownFiles[uuid].shared` in `google-drive-datastore.ts`.

On opening a shared character (gated by the `autoLiveSession` setting, default
on):

- **Owner** → `openSharingSession({ silent: true })` hosts the realm. `silent`
  suppresses the failure alert so a down sidecar just leaves them editing solo.
- **Recipient** → `joinSession(uuid)`, retrying every ~15s until the owner's realm
  exists, then pulls the host's character via `FULL_SYNC` and loads it. If the
  recipient made **unsaved solo edits** while the owner was offline, a `useConfirm`
  prompt guards the `FULL_SYNC` replacement (rejoin-and-discard vs. keep editing
  solo). Fresh opens join silently.

**Only the owner ever hosts.** That's the deliberate simplification that avoids
host-election races (no simultaneous `openRealm` winners to arbitrate) and host
migration — a `remote` character is never re-hosted, and the effect's `handledRef`
plus the `getRole` check keep it from fighting a manual opt-out. The cost is two
uncovered gaps, both **out of scope by design**:

- **Owner offline, recipient edits solo** — degrades to a plain Drive write (the
  recipient has writer access), then auto-rejoins when the owner returns.
- **Two recipients, no owner online** — neither hosts, so no session and no
  presence form; concurrent edits would blind-clobber the owner's single Drive
  file. This case is **warned about but not prevented** (below).

## Editor-presence warning (pre-session awareness)

WAMP presence only exists once someone is hosting, so it can't cover the
two-recipients-no-owner case above. `src/components/share-presence-warning.tsx`
fills that gap using the one channel every collaborator shares _before_ a session:
the Drive file's `appProperties`. While a shared character is open with **no live
session** (`getRole` falsy), each client polls (~25s) via
`datastore.heartbeatSharePresence(uuid, self)`, which stamps an
`editor_<clientId>` → `<epochMs>|<name>` key and returns the other editors seen
within `PRESENCE_FRESH_MS`. When any are present a dismissible amber banner warns
that edits may overwrite each other. `clearSharePresence` drops our key on close.

The pure read/prune logic is `computePresenceUpdate` in `src/lib/share-presence.ts`
(unit-tested): it refreshes our own key, prunes only heartbeats past
`PRESENCE_TTL_MS` (never a stale-but-live one, to avoid racing a peer's write),
and never touches non-`editor_` keys so the `SHARED_*` markers survive. This is
awareness only — it does **not** start a session (recipients can't host without
the owner); it's independent of the `autoLiveSession` setting because silent
clobbering deserves a warning regardless. **Caveat to verify in-browser:** it
relies on `appProperties` written by one user being readable by another user of
the same app on a shared file.

Supporting invariant added for the retry loop: in `useRemoteSharingSession`, a
`connection.onclose` that fires **before** the realm ever opened is a quiet probe
failure (owner not online yet), not a host-ended-the-session event — only a close
_after_ a successful open runs the character-clearing `cleanUpAfterClose`. Without
this, every failed auto-join retry would wipe the open character and alert.

Networking code here is gapi/WAMP-bound and **verified manually in-browser or
against a local `nightlife-rabbit`**, not unit-tested — preserve the invariants
above rather than assuming a test will catch a regression. (The one exception is
the never-opened-vs-host-closed guard above, pinned by
`src/lib/hooks/use-sharing-session.test.ts` with a mocked connection.)
