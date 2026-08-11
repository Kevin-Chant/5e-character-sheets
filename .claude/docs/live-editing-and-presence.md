# Live editing & presence

Real-time co-editing runs over WAMP (an `autobahn-browser` client talking to the
`nightlife-rabbit` broker in `server/server.js`). It is an **overlay on top of
normal editing**, independent of where the character is persisted — the same
`update_*` actions that drive local edits (see
[character-state-and-edits.md](character-state-and-edits.md)) are simply also
published to peers. CLAUDE.md covers the connection/role fundamentals; this doc
covers the protocol and the presence roster, all in
`src/lib/hooks/use-sharing-session.tsx` (+ `use-presence.tsx`).

**The transport is `src/lib/realm/use-realm.tsx`, shared with the party-session
layer.** Sockets, subscriptions, the versioned envelope, self-echo filtering
(the broker does not honour WAMP `exclude_me`), addressed-message filtering and
teardown all live there and are documented there — this layer is only the
message kinds (`SharingMessage` + `TOPIC_FOR`), the two roles, and what each
message means. What deliberately did **not** unify: sync stays a `FULL_SYNC`
RPC (an owned document has one host who can be _asked_, which gives the Drive
auto-join retry loop the definite failure it depends on — a peer mesh's
ask-the-room would not), and the host/remote asymmetry stays.

## One realm per character, two roles, one session at a time

A session is a WAMP **realm named after the character uuid**
(`realmForCharacter` in `session-codes.ts`). The **host** opens the realm and
registers the `FULL_SYNC` RPC that serves the current character to anyone who
joins; a **remote** (joiner) calls `FULL_SYNC` on connect to pull initial
state, then streams edits. The host owns persistence — a joined character is
never saved locally by the joiner.

**The provider holds one sharing session per character**, in a
`Map<uuid, Session>`. It held exactly one for a while, and that was an honest
description of what the layer could do rather than a design: a session's edits
were dispatched into whatever character was _open_ and `FULL_SYNC` served the
open character whatever realm asked, so a session only worked while its
character stayed on screen.

**What made one-at-a-time stop being merely limited and start being dangerous**
is that nothing ends a session when you open a different character. A DM who
owns the party's shared sheets clicks between them all evening; the browser
kept holding the first sheet's realm, and that sheet's arriving edits landed on
whichever one was now on screen — and were autosaved there, because the save
gate only skips sheets joined _remotely_. Sheets got scrambled into each other.
A broadcast `load_character` on top of that (navigation used to travel, stamped
with the _pre-dispatch_ uuid) put one player's whole character on everyone's
screen.

Three things make holding several real:

1. **The transport and the roster are plain factories** — `realm/realm.ts` and
   `realm/presence-store.ts` — not hooks, because a hook can only ever hold one
   of a thing. `use-realm.tsx` and `use-presence.tsx` remain as thin
   `useSyncExternalStore` wrappers for the party-session layer, which genuinely
   wants exactly one (a browser sits at one table).
2. **Every `dispatch` message carries the uuid it edits**, so `applyRemoteEdit`
   routes instead of guessing. The check the outbound `broadcast` and tab-sync's
   inbound handler both had, the inbound WAMP path never did — because the
   message had nothing to check against. Two things follow from a routing key
   arriving over the wire, and both are checks the first pass missed:
   - **The uuid is checked against the session's own**, so a realm may only
     carry edits for the character it is named for. Nothing this app publishes
     can produce a mismatch and the v4 envelope drops uuid-less older clients,
     so it can only be a hand-rolled message — but the broker is
     unauthenticated, and a trusted routing key is a write primitive for any
     uuid a peer can name.
   - **The reconnect `FULL_SYNC` asks the second question too.** Checking the
     host's answer against the session (which it always did) says the host
     replied about the right character; it does not say we are still looking at
     it. A joiner holding a background session — join a friend's sheet, then
     open one of your own — had its own sheet replaced by theirs on the first
     dropped socket, dirty flag cleared on the way past. It now drops instead;
     reopening re-joins and pulls a fresh sync.
3. **A session whose sheet isn't open still works.** `loadStored`/`saveStored`
   are bound up from `CharacterContext`: a host folds an arriving edit into the
   stored copy through the same pure reducer and writes it back, on a
   **per-uuid write queue** — each apply is read-modify-write against storage,
   so two edits in one tick would otherwise both read the same copy and the
   second would erase the first, silently, to a file nobody has open to notice.
   A _joined_ session whose sheet is closed writes nothing on purpose: the host
   owns that document and folding a peer's edit into our copy is the fork the
   save gate exists to prevent. Nothing is lost — reopening re-joins and pulls
   `FULL_SYNC`.

   Two details the background writer earns by being the path nobody is
   watching. The open-sheet check is made **on both sides of the storage
   read**, because a Drive round-trip is long enough to open the sheet during,
   and a fold written against the copy we read a moment ago would then be
   beaten by the open sheet's next autosave. And a **failed fold is held, not
   logged**: the edit is the only copy of that change, the peer who made it was
   told it landed, and the host would otherwise go on serving the stale copy as
   authoritative. `backgroundSaveErrors` surfaces that in the nav (with the
   sign-in click when it's an expired Drive session) and `retryBackgroundSaves`
   replays what was held.

The public API was uuid-keyed throughout all of this (`getRole(uuid)`,
`broadcast(uuid, …)`, `getParticipants(uuid)`), which is why the change was
mostly deleting `active?.uuid === uuid` comparisons. `fetchRemoteCharacter` and
`disconnectRemote` gained the uuid they had been doing without.

`FULL_SYNC` serves the open sheet when it is this session's, and that
character's stored copy otherwise — a host holding several sessions is
routinely serving a sheet it is not looking at. The answer is checked against
the uuid that was asked for on the way back in, too. The registration is
**awaited, and its failure ends the hosting attempt**: the broker rejects a
procedure another session already holds, which is what a second tab hosting
the same character hits. Pressing on regardless made that tab a zombie host —
connected and presence-visible, but unable to answer the one call joiners
bootstrap through, forever. Failing means staying honestly solo (sibling tabs
converge over `tab-sync.ts` anyway); on a host _reconnect_ the same rejection
spends that ladder attempt instead, buying time for the broker to free the
dead session's registration.

Because the character (and its `dispatch`) live in `CharacterContext`, which
mounts _below_ this provider, the role hooks (`useHostSharingSession`,
`useRemoteSharingSession`) hand `dispatch`/`getCharacter` — and the
`loadStored`/`saveStored` pair the background writer runs on — up through
`bind(...)` refs each render — the same knot the encounter provider ties with
its transport handlers.

## Layer 1: edit sync (`dispatch`)

`SharingSessionsContext.broadcast(uuid, action)` publishes an edit action to
the realm — host and joiner publish over the same transport, giving
bidirectional editing. `applyRemoteEdit` replays an arriving action into the
local reducer **with `suppressBroadcast`**, or applying it would re-publish and
loop; that invariant is pinned by `use-sharing-session.dispatch.test.ts`.
(Self-echo filtering moved to the envelope.) The
replay-a-serialized-action model works precisely because actions are
self-contained full-value writes.

## Layer 2: presence (`presence` / `leave`)

Presence is a **separate, best-effort gossip layer** — losing a presence
message degrades a highlight, it never corrupts the character. The roster,
heartbeat and liveness pruning are the shared `realm/use-presence.tsx`
(HEARTBEAT_MS 10s, TTL 3 beats — the numbers were born in this layer); the
payload here is `{name, color, field}`:

- **Selection** — `broadcastSelection` records which field path this tab has
  open (mirroring the targeted-field path, `null` when nothing is open). It
  feeds the presence payload, so a change re-announces by itself, and peers
  outline the field in the editor's color via `use-presence.tsx` (the
  field-editor hook, distinct from the shared roster hook).
- **Answer the newcomer** — the old `hello`/`update` handshake survives in one
  rule: a presence message from a clientId we haven't heard from yet is
  answered with an immediate announcement of our own, so the newcomer sees
  chips and highlights now rather than one heartbeat from now. Terminates
  because the answer isn't new to them twice.
- **Identity** — each tab's name + palette color persists in `localStorage`
  (per-session overrides in state); a mid-session change flows into the
  payload and re-announces.

## Teardown is asymmetric

`teardownSession` differs by role and this asymmetry is deliberate: a **host**
publishes `closeSession` (so joiners clear the now-dead character and alert)
and then asks the server to close the realm; a **remote** just publishes
`leave` so peers drop its chip.

**The goodbye is awaited, not fired** (`realm.farewell` — publish with WAMP's
`acknowledge`, bounded at two seconds so a dead socket can't hold a teardown
open). Ending a session is two messages to the same box over two different
transports — the `closeSession` through the broker and the `closeRealm` over
HTTP — and the second kills the realm the first is still crossing. Whoever lost
that race sat on a frozen sheet with no notice until the reconnect campaign
gave up on it, half a minute later. It reproduced about half the time in
`session-smoke --only editing`, which is what a race between two roughly equal
latencies looks like from outside. nightlife-rabbit sends `PUBLISHED` before
dispatching the event, but queues the subscribers' writes in the same turn, so
the ack is the point after which the close can no longer overtake the goodbye. The transport's rule that a deliberate
`close()` never fires `onClosed` (see `use-realm.tsx`) is what tells a
deliberate teardown from an unexpected one without the old
`intentionalDisconnect` ref.

### An unexpected close is not an ending

A joiner losing its connection without asking to used to run `endedRemotely`
immediately: reset the character, alert. **That was wrong, and wrong in the
worst direction.** On a phone a dropped socket is a routine event — a wifi
handover, a tunnel, a backgrounded tab, an idle NAT mapping — and the response
to one was to destroy the borrowed sheet and tell the player their friend had
closed the session. Reported from real use, more than once.

`onClosed` now starts a **reconnect campaign** (`reconnect`, backing off over
about thirty seconds), and the retry _is_ the diagnosis: there is no message
that distinguishes "the host closed the realm" from "my connection dropped",
but there is an experiment. A realm that answers was never gone. A realm that
keeps reporting `absent` is one nobody is hosting. Only when the attempts run
out does a joiner run `endedRemotely`; a host that can't get back keeps its own
character and simply stops sharing.

Two details that make the campaign correct rather than merely persistent:

- **The host's `closeSession` still ends it instantly.** A real goodbye is a
  message, not an absence, so only an _unannounced_ disappearance pays the
  wait.
- **Getting back in is not the same as being in step.** A joiner re-runs
  `FULL_SYNC` on reconnect to collect what the host changed while it was away,
  and a host re-registers that procedure, because a registration dies with the
  session that made it. Edits the joiner made while offline are not lost
  either: `dispatch` is the one kind this layer marks `queueWhileOffline`, so
  they are replayed into the realm before the resync asks for the answer.
  That replay covers the **zombie window** too: a replayable publish asks the
  broker to acknowledge (`PUBLISHED`), and one unconfirmed after
  `ACK_TIMEOUT_MS` is held for the same replay — a socket that died without a
  close frame accepts publishes without error for the tens of seconds the
  liveness probe needs to notice, and everything "sent" in that window used to
  be simply lost. A late confirmation pulls the message back out of the queue,
  because replaying a _delivered_ edit after newer ones could roll a field
  back.

`session-smoke`'s `dropout` scenario drives exactly this with a real network
drop (`context.setOffline`), and asserts the two things the old behaviour got
wrong: the sheet is still there, and nobody was told the session ended.

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

Supporting invariant for the retry loop: a connection that closes **before**
the realm ever opened is a quiet probe failure (owner not online yet), not a
host-ended-the-session event — `useRealm.connect` resolves it as
`{ok: false, reason: "absent"}` and `joinCharacterSession` throws, which the
retry loop catches; only a close _after_ a successful open runs the
character-clearing `endedRemotely`. Without this, every failed auto-join retry
would wipe the open character and alert.

Verification: the never-opened-vs-host-closed guard is pinned by
`src/lib/hooks/use-sharing-session.test.ts` (provider rendered over a mocked
autobahn); the full co-edit path — share, join by code, an edit in each
direction, presence chips, host teardown alerting the joiner — is the
`editing` scenario in `pnpm session-smoke`. Preserve the invariants above;
anything deeper than those two harnesses reach is still verified manually
in-browser.
