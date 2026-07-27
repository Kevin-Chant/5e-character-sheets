# The play surface

`/play` — the turn, as its own destination. The sheet is a document you read;
this is a control panel you act from. It is a **route, not a mode**: a fullscreen
takeover with an "Open sheet" link back, and a nav button that swaps between the
two.

This is layer A of a larger plan (see "What this is the first layer of").

## Why it isn't the sheet with fewer buttons

The sheet files an ability under the section that owns its data — attacks in the
attack table, spells across nine level columns, pools in Limited-Use Abilities.
That's the right filing for a reference document and the wrong one for a turn,
where the only question is what something _costs_. Answering "can I still take a
bonus action, and what are my options?" used to mean scanning three separate
regions and knowing 5e well enough to recall that Misty Step is a bonus action
and Shield is a reaction.

The board is that regrouping. It's also the thing that finally consumes
`Spell.castingTime`, which had been typed and stored since the SRD import and
read by nothing.

## The projection: `src/lib/play/turn-actions.ts`

Pure, no React, unit-tested — the same split as the rest planner, for the same
reason: the grouping rules are the part worth testing.

`turnActions(character)` walks three sources and returns a flat `TurnAction[]`
tagged with an `ActionCost`; `groupByCost` buckets them.

| Source              | Cost comes from                                     |
| ------------------- | --------------------------------------------------- |
| `character.attacks` | Always `action` (see below)                         |
| `character.spells`  | `normalizeCastingTime(spell.castingTime)`           |
| `LimitedUseAbility` | `mechanics.actions[].cost`, already an `ActionCost` |

**Adding an action to the board is not a board change.** Give a feature
mechanics in `mechanics/catalog.ts`, or a spell a `castingTime`, and it appears.

### `normalizeCastingTime`

The bundled catalog is regular enough that this is a small function: across the
319 SRD spells and ~195 non-SRD ones, casting times are `1 action` (242 in the
SRD), `1 bonus action`, `1 reaction[, trigger…]`, or a duration. The three
action-economy values match `CastingTime` exactly; a reaction keeps its trigger
clause as the row's note; everything else falls to `special` carrying its own
text, rather than being guessed into a turn it doesn't fit.

An **absent** casting time resolves to `action` — a spell without one is
hand-authored, not slow, and `action` is both the overwhelming majority and the
harmless guess.

### Two deliberate imprecisions

- **Attacks are always `action`.** `Attack` carries no cost field, and adding one
  would be a schema change for something that is `action` on everything except
  the off-hand attack of a two-weapon fight — which depends on what you did with
  your Action, not on the weapon.
- **An unprepared spell dims, it doesn't disappear.** The first implementation
  filtered them out, and a 9th-level wizard who hadn't ticked anything prepared
  got a board holding three cantrips. Same failure as the rest panel's "Nothing
  to restore": a view built only from what's currently _actionable_ lies whenever
  the useful part is what you haven't set up yet. Caught by screenshotting the
  real fixture, not by tests.

## Per-round guidance: the turn banner and the off-turn dim

In combat the player surface answers "whose round is it" once, in a banner
between the rail and the economy: **Your turn** (accent-filled, the loudest
thing on the surface — it's the moment the layer exists for) or **"{name} is
acting"** with a reminder that the reaction stays ready. The same fact drives
the board: off-turn, `play-body.off-turn` dims every action group except
reactions.

The dimming is the mission's "narrowing with an escape hatch" and it obeys the
advisory rule below: it's opacity on a class, never `disabled`, and hovering or
focusing a dimmed group restores it — a readied action, a held Sentinel swing
or a DM ruling outranks anything the surface can see.
(`play-surface.test.tsx` pins both halves: the banner swaps with the turn, and
going off-turn disables nothing that wasn't already.)

## Everything is advisory

This is the surface's governing rule and it matches how the rest of the app
treats rules it can't see the whole of (`remind` effects, the rest planner's
follow-ups, prose over automation).

- **The turn economy** (`src/lib/play/use-turn.ts`) marks a slot spent when you
  use something off the board, and every slot is click-to-toggle so the guess can
  be corrected in either direction. It never blocks a second Action — the app
  can't see a DM ruling, a readied action, or an Action Surge.
- **`available: false` dims a row, it never disables it.** No slots left, pool
  empty, spell not prepared — all stated, none enforced.
- **The one exception is `CastButton`,** disabled at zero slots. That's
  arithmetic, not a rules judgement: you cannot expend a slot that doesn't exist.

The turn state is **ephemeral component state**, not on the character. A turn
isn't a fact about the character, and it lasts about a minute. It's behind a hook
so it can move onto the shared encounter object later without touching callers.

## Reuse, and the one context trick

The board renders the sheet's own controls rather than parallel ones:
`RollButton` for attacks and spells, and `ActionRow` (exported from
`display/ability-actions.tsx`) for pool actions, which brings its own level
pickers, amount steppers and enablement — so the board never second-guesses
whether an ability action is payable.

Both of those render only when `useEditMode()` reports **not** editing. The play
surface therefore wraps its subtree in an `EditModeContext.Provider` pinned to
`editMode: false`. That's the whole integration: no component needed changing.

`PlaySurface` also mounts its own `RollerProvider` + `RollModal`, since those
live inside `charsheet.tsx` and the play route doesn't render it.

Casting spends the slot via `resolveEffects([{ effect: "expendSlot" }])` — the
existing mechanics interpreter — so it syncs, undoes and autosaves like any edit.
The roll dialog deliberately does _not_ spend the slot (it only picks a level to
scale damage by), which is why the board offers an explicit `Cast`.

## Styling

`src/styles/play.css`, imported from `index.css` with the other route
stylesheets. Same tokens as the sheet — same accent, same fonts, light/dark for
free — but a different **material**: denser, grid-locked, and with the economy
slots carrying weight nothing on the sheet carries.

Unlike the sheet, this file **may use `@media`**. `styles.test.ts` scopes the
no-viewport-queries rule to `responsive-sheet.css`, and it's the right rule
there because the sheet reflows inside a container that is only part of the page.
The play surface _is_ the viewport, so viewport queries are the honest tool.

Gotcha worth knowing: `SlotPips` brings the shared `.row` utility, which grows.
A sibling with `flex: 1` next to it collapses to zero width — which is exactly
how the vitals rail lost every one of its pool labels. Pin the pips to
`flex: 0 0 auto` and let the label take the remainder.

## The encounter (layer B)

`src/lib/play/encounter.ts` — pure; `use-encounter.tsx` — storage and React.

**It is its own object, never a field on `Character`.** With one player that
looks like a distinction without a difference. It isn't: a round belongs to no
single character, and every player holding a private copy of "whose turn is it"
is precisely what makes a shared encounter impossible later. This is what keeps
layer C an increment rather than a migration.

It's **local-first**: an ordinary object in `localStorage` behind a pure module,
working with no network, no sidecar and no other players — the same two-layer
shape as characters (a local object plus an independent broadcast overlay), which
is where C attaches.

The provider sits **above the routes** in `index.tsx`, not inside the play
surface, because the roll dialog reads conditions on the sheet too and the
encounter has to survive navigating between them. `renderWithCharacter` supplies
it as well, and **clears its storage key per render** — an object that
deliberately outlives a component also outlives a test.

### Shape

- `round: 0` means "not in combat". The encounter always exists, because the turn
  economy and conditions are useful outside a fight; `round` is what separates
  tracking a fight from merely being open.
- A **self participant** is created and name-synced for the open character.
  Everyone else is typed in by hand — an ally, a monster the DM called out.
- `dmClientId` exists and is unused. It's a **UI gate** for layer C: it decides
  which controls render, never who may write. The DM may not be in the app at
  all, and a sleeping laptop must not freeze someone else's fight.

### Turn boundaries

`advanceTurn` does its work on the way _in_, not on the way out: the incoming
participant's economy resets (reaction included — in 5e that refreshes at the
start of your turn) and their conditions tick down. Ticking on entry means a
condition with one round left is still visible for the whole turn it applies to.

It returns a `TurnAdvance` — the new encounter, who's up, what expired, whether
the round moved — so the rail can fire triggers and print a receipt without the
pure layer knowing anything about dispatch.

Ending combat **keeps conditions and concentration**. A fight ending is not a
rest; a poisoned character is still poisoned afterwards. Only the round, the
order position and the per-turn economy reset.

### Event triggers

`src/lib/play/triggers.ts` — `planTrigger(character, event)` returns updates plus
a human account of them, deliberately the same shape as `planRest`. Events:
`combatStart`, `startOfTurn`, `endOfTurn`, `dawn`.

This is what finally consumes the free-text `RechargeCriteria` that `rest.ts`
punts to a `manualRecharge` follow-up. Matching is textual for the same reason
`rechargesOnRest` is: the type is deliberately open and the presets only cover
rests. **Rest triggers are excluded first**, so a homebrew "long rest or dawn"
isn't restored by both planners.

They're **auto-applied with a receipt**, not confirmed. Restoring a pool to full
is deterministic and undoes in one step; a confirmation dialog on every turn
boundary would cost more than the certainty is worth. `startOfTurn` only fires
when the turn that started is _ours_ — someone else's turn beginning is not an
event on our sheet. `dawn` has no turn boundary to hang off, so it's a button,
shown only when `hasTriggerFor` says the character has something to recharge.

### Conditions

The fourteen, in `src/lib/play/conditions.ts`, with optional round durations.
`conditionRollNotes` returns prose shaped like `advantageNotes` output, and the
roll dialog renders **one list** from both sources — feature riders and
conditions are saying the same kind of thing ("this roll may have advantage, you
decide") and shouldn't arrive as two competing sets of small print.

Nothing is applied. Half these conditions are conditional on something the sheet
can't see ("while the source of your fear is in sight"), and silently applying
disadvantage to a roll that didn't deserve it is worse than saying nothing.

Casting a spell with `concentration` from the board **sets** concentration,
replacing whatever was held — that's the 5e rule and it's the half players
forget. It's visible in the rail and one click to drop.

## The party session (layer C)

`src/lib/play/session.ts` — pure; `use-play-session.tsx` — transport.

**Everyone opens their own character locally and joins a shared code.** The
session syncs the _encounter_, not characters. That's what makes it much simpler
than the character-sharing layer: no host owning someone else's sheet, no joiner
without a datastore, and no reason for a character to cross the wire at all.

**Only a projection ever leaves the browser** — names, initiative, HP, AC,
conditions, concentration. No spell list, no inventory, no backstory. The privacy
default Kevin asked for therefore holds _by construction_ rather than by a flag:
in a client-side app a broadcast-but-hidden sheet is fake privacy, so the
guarantee has to be "never transmitted", and it is.

### Codes and realms

**A session code is a uuid, and the uuid is the authentication** — the same trust
model the character realms already run on.

The first draft used six characters from a spoken-friendly alphabet, on the
theory that codes get read out over a call. That was wrong: `openRealm` is an
unauthenticated GET with no rate limiting, so ~9×10⁸ possibilities put a
stranger a few hours of guessing away from reading the party's HP and conditions.
A code is pasted into a group chat, not spoken, so the short form bought nothing.

`normalizeSessionCode` handles what a paste actually brings — surrounding
whitespace, wrong case, the dash-less form some tools produce — and canonicalises
to the dashed lowercase uuid. The realm is `sess<hex>`, namespaced away from the
character realms (bare hex uuids), which matters more now that both are uuids.

The cost is that codes are no longer memorable, which is why characters remember
them: `Character.playSessions` is an optional list of `{ code, lastJoined }`,
most recent first, capped at `REMEMBERED_SESSIONS`. It's on the _character_
rather than in settings because it's per-character — your wizard plays in the
Tuesday game, your paladin doesn't. Optional, so no migration; `pnpm
generate-schema` is the only schema step. A code is recorded when the connection
**succeeds**, not when it's typed, or the list fills with typos.

### Convergence

Anyone may write; the DM seat is a UI gate, not a lock. So convergence is
**last-write-wins on a monotonic `revision`**, ties broken by client id so two
simultaneous writers land on the same answer in every browser instead of
swapping states forever.

Three exceptions, all learned the hard way:

- **You are authoritative for your own vitals.** A peer's copy of your HP is only
  as fresh as the last state they received, so accepting it wholesale makes your
  own HP bar jump backwards every time somebody else advances the turn.
- **A merge re-adds participants this client contributed that the peer hasn't
  seen.** That's the join case: you announce yourself, whoever's there replies
  with a state predating you, and accepting it deletes you from your own roster —
  with nothing to put you back, since the participant-sync effect only runs when
  the character changes. The merge is published (not applied silently) whenever
  the result contains someone the peer hasn't heard of, or nobody ever learns you
  arrived.
- **A joiner adopts the room rather than racing it** (`mergeEncounter`'s `adopt`
  argument, set by `joinSession` and cleared on the first reply). Revisions only
  order writes _within one shared history_. A client that has just joined has its
  own unrelated history — its local encounter has been counting up on its own —
  and the two routinely collide on the same number, at which point the clientId
  tiebreak decides who exists by comparing two random uuids. Roughly half the
  time the joiner "won" and silently discarded the room: the fight in progress,
  the DM seat, everyone else's initiative. A newcomer has nothing to be
  authoritative about, so it defers to the room and contributes only its own
  participants. Only _joining_ sets the flag — a host that kept adopting would
  let the next arrival's empty state wipe its own fight.

Everything else from a peer is applied **silently**: echoing a peer's state back
is an endless exchange, the same loop the character layer avoids with
`suppressBroadcast`.

### The DM seat

Purely a UI gate on which controls render. The transport accepts anyone's write,
always, because layer B has to keep working with **no session at all** — solo
prep, a one-shot with no party, testing on one machine. `canRunCombat` returns
true when the seat is unclaimed, and making "only the DM may write" a merge rule
rather than a UI rule is what would break that.

- **Starting a game takes the seat.** The entry path said you were running the
  table, so `hostSession` claims it at creation instead of leaving it to be
  raced for afterwards. This replaced a first draft where the seat was empty
  until somebody pressed a button, which read as a thing to compete over.
- An unclaimed seat means **everybody** gets the controls — the right default for
  a table whose DM isn't in the app at all.
- **The seat is sticky across reloads.** The seat has two halves: `dmClientId`
  (the tab holding it now) and `dmToken` (a uuid in the DM's own localStorage,
  `DM_TOKEN_STORAGE_KEY`). `clientId` is per-tab, so a refresh mints a new one —
  before the token, every reload cost the DM their seat. Now `reclaimDmSeat`
  (folded into `receiveState`) hands it back automatically when a state arrives
  and the token matches. Leaving puts the seat down (`dmClientId` clears via
  `withoutClient`, so nobody is gated on someone who's gone) but keeps the
  token; `releaseDmSeat` — a decision, not a disconnection — drops both.
- **There is no takeover button on the bar any more.** Its two everyday reasons
  (racing for an unclaimed seat at the start, recovering from a reload) are gone
  — creation claims, the token reclaims. The genuinely-dead-browser case lives
  in Settings → Game as an escape hatch that only renders while connected to a
  session someone else is running.
- **`lastSession`** (`LAST_SESSION_STORAGE_KEY`, device-level) remembers the
  code this browser was last connected to, recorded on successful connect and
  cleared by leaving on purpose. It exists because `Character.playSessions` is
  per-character and only records _joins_ — a DM often has no character open, so
  hosting wrote the code nowhere and a refreshed DM was locked out of their own
  game. The rejoin offer renders on the session bar **and on `/sessions`** —
  the latter is load-bearing: a DM with no character and no session gets bounced
  off `/play`, so `/sessions` is the only session surface they can reach.

An earlier draft of this section justified the seat's design with "a DM whose
laptop sleeps must not freeze the table". Kevin pushed back and he was right: a
DM who has opened this tool is present by definition, and blocking on them is
what the table is doing anyway. What survives the correction is the per-tab
`clientId` problem above — about refreshes, not absence.

Nobody closes the realm on leave: a party session has no owner, and one player
going to bed must not end everyone else's fight. Realms are reclaimed by
restarting the sidecar, same as the character-sharing ones.

### Verifying it

Unit tests cover the merge rules, and everything that happens when a peer's
state arrives is one pure function — `receiveState` in `play/session.ts`
(merge + seat reclaim + the publish-back decision), so the provider is reduced
to storage, React state and the network. **Multi-client convergence is unit
tested** via `src/lib/fixtures/session-sim.ts`: a fake broker (topic map,
synchronous delivery, publisher receives its own messages — nightlife-rabbit
doesn't honour `exclude_me`, and the sim deliberately reproduces that) driving
several `SimClient`s that run the real decision functions.
`session-convergence.test.ts` covers the table converging, the revision race,
the seat surviving a reload (`reopenAs` models "new tab, same browser"), and
leave/rejoin. The transport itself is verified by hand, per the codebase
convention. The hand check is committed: **`pnpm session-smoke`** drives
several real browser contexts through the flows against a running `pnpm dev` +
`pnpm server` and asserts what converges. `--only <scenario>`, `--headed`,
`--slow <ms>` and `--shots <dir>` are there for watching a failure happen.

Every bug in this layer so far was found that way and none was reachable from a
unit test: the joiner's participant deleted by the host's reply, the host never
learning about the joiner, the DM seat frozen after its holder left, the join
form staying open after a successful connect, and the revision race above.

Two rules for working on that script, both of which it cost time to learn:

- **Never sleep, always wait for a condition.** The first version was hardcoded
  `waitForTimeout` calls; a run took ~30s and, worse, the harness's flakiness and
  the app's were the same symptom. Condition waits took it to under 2s a scenario
  and made a real intermittent bug reproducible.
- A cold `goto('/play')` correctly bounces to the sheet when there's no character
  and no session, so drive the app through its nav rather than deep links.

## Sheet assignment

The one deliberate exception to "only a projection crosses the wire", and it
stays an exception by construction rather than by discipline:

- **Offering is a per-sheet act of consent.** Bringing a sheet into the order
  shows its projection; the "Offer sheet" button on the DM board
  (`Participant.claimable`) is what consents to the whole sheet travelling.
  Player-owned sheets have no path through this code at all.
- **Two ways in, one consent flag.** Players can pick an offered sheet up, or
  the DM can point one at a specific person — "Hand to…" on the row, listing
  who's connected. Assignment is a **targeted offer, not a push**: it sets
  `claimable` (assignment is a superset of offering) and sends `ASSIGN`
  `{participantId, toClientId}`; the target gets an accept prompt, and
  accepting runs the ordinary claim flow below. That shape keeps consent
  two-sided (a sheet never hijacks a screen), reuses the claim machinery
  end-to-end, and makes a ghost target harmless — no reply, the offer stands.
- **Presence is what the DM points at** (`PRESENCE` topic; pure roster helpers
  `withPresence`/`withoutPresence` in `session.ts`). Each client announces
  `{clientId, displayName}` on connect and in reply to every `hello`; `LEAVE`
  removes. **No heartbeats** — a crashed tab leaves a ghost name until the
  session turns over, which costs a stale dropdown entry and nothing else.
  Presence is provider state, never on the `Encounter`: liveness merged by
  revision would be a category error. A sheetless joiner types a table name
  into the lobby ("What should the table call you?", default "Player"); a
  player with a character announces its name.
- **The wire**: `CLAIM_SHEET` (claimant → table) and `SHEET` (owner → claimant,
  addressed by clientId — everyone receives it, only the addressee loads it;
  this broker has no private lanes). The owner answers only if the offer still
  stands, checked at send time rather than trusted from the asker. The arriving
  character goes through `hydrateCharacter` like any foreign payload.
- **Borrowed, never persisted.** A picked-up sheet is registered via
  `markBorrowed` on the sharing context (the context _above_ `CharacterContext`,
  which is where the lazy-save gate lives) — same rule as a remotely-joined
  character, different transport: the DM owns the stored copy, and a local save
  would fork it. Borrowed sheets also can't be re-shared (`canShare` in root).
- **Pickup is just opening the character.** The participant effect sees the
  open sheet and `claimParticipant` moves ownership; from then on it's an
  ordinary owned sheet — vitals publish, DM HP oversight works, rests and rolls
  are local.
- **Leaving hands it back.** `withoutClient` reverts a claimable participant to
  the DM's client as a static, still-offered projection instead of dropping it
  — the player owned it for the evening, the DM brought it.

## Still ahead

- **Live co-editing of a borrowed sheet.** The pickup is a copy handed over,
  not a shared document: the player's edits reach the table as projection
  (vitals/conditions), but the DM's stored copy doesn't accumulate them. Fine
  for a companion, wrong if a table wants persistent borrowed-sheet progression
  — that version nests a character-sharing session inside the play session.
- **Full-sheet _reading_ on request.** Deliberately absent: the projection
  covers the table-visible facts, and a refusable read is only worth it once
  someone actually wants to browse a party member's sheet.
- **Reconnect.** A dropped connection goes to `offline` and stays there; you
  rejoin from the remembered list.

## The DM board

`src/components/play/dm-board.tsx`, rendered by the play surface **instead of**
the action board + vitals rail when this client holds the seat. A player asks
"what can I do right now"; a DM asks "what is the state of eight creatures" —
same encounter, opposite shape, so the body swaps rather than gaining buttons.

**The roster owns the order for the DM; the rail shrinks to match.** The first
draft kept the player rail's per-participant setup strip above the roster, so
every creature appeared twice with different controls. Now `InitiativeRail`
takes a `variant`: the `dm` rail is just round + whose-turn callout + advance /
end (and "Start combat" out of combat), and the board rows carry the
initiative steppers (pre-combat — in combat the order is frozen and the score
is a static badge), the add form and remove. A row is init | who | HP |
conditions | concentration | remove; the active row is spotlit and the next
one carries a small "next" chip.

Workflow pieces the mission ("multiple combats, DM-orchestrated") forced:

- **One submit adds a fight**: name × count, optional HP-each, one initiative
  — a pack of identical monsters shares one roll in 5e, so "Goblin × 4, HP 7,
  init 12" makes numbered, already-tracked rows. A hand-typed combatant added
  without HP still gets it the moment the DM writes a maximum down ("Track").
- **Down and sweeping**: a tracked row at 0 HP dims with a struck name and a
  skull (`.dm-row.down`) but stays — it might be healed, it might be feigning.
  `clearFallen` (pure, in `encounter.ts`) removes every hand-typed combatant at
  0 HP in one click; character-backed rows are exempt because a downed PC is
  making death saves, not leaving. That plus "End combat keeps the party" is
  the whole between-fights reset.
- **The invite is the empty table's job**: with nobody in the order and a
  session connected, the board shows a big copy-the-invite-code affordance —
  the code in the session bar is for later; at minute zero it's the whole
  point of the screen.

- **A late arrival is seated by initiative, not appended.** Mid-combat the
  participants array _is_ the turn order, so `insertParticipant`
  (`encounter.ts`) splices a newcomer — reinforcements, a player joining round
  3 — into initiative position. Ties go after everyone already holding that
  count (the DM breaks ties by nudging a number, not by the code inventing a
  coin flip), and a slot that already passed this round stays passed: the
  insert bumps `turnIndex` so whoever is acting keeps acting, and the newcomer
  first acts next round. `addParticipant` and the session merge's re-add both
  go through it, so the seating holds on every peer's copy, not just locally.

Roster edits are gated by `canRun` once a seat is held — an unclaimed seat
still means everybody, so layer B keeps working with no DM.

### DM HP oversight: `vitalsRev`

The hard part of "the DM can set your HP" is that it collides with **you are
authoritative for your own vitals** — the rule that stops your HP bar jumping
backwards when a peer echoes a stale copy of you. A DM's deliberate edit and a
stale echo arrive looking identical.

`Participant.vitalsRev` is the tiebreaker: bumped on every real `setVitals`
change, so a stale echo carries a rev you've already passed and a real edit
carries one you haven't. The merge accepts the higher rev; `receiveState`
surfaces an accepted foreign write as `ownVitals`, and the provider dispatches
it onto the character itself — the participant is only a projection of the
sheet, so leaving the sheet untouched would publish the old HP right back on
its next change. Only `currHp` crosses over; max HP and AC derive from the
sheet's own formulas. The player's next edit bumps the rev again and wins —
oversight is not custody.

Two guards, both sim-tested: a **joiner keeps its own vitals regardless of
revs** and jumps its rev past the incoming one, because a room can hold last
week's copy of you (a tab that died without a leave message) with an
arbitrarily high rev, and last week's HP must not overwrite the sheet you just
walked in with; and that correction is **published**, so the room stops showing
the stale copy immediately rather than at your next sheet change.

## Table asymmetries and advisories

The two families Kevin named after live-testing, and the shape each takes:

**Asymmetries — what players don't see.** A hand-typed combatant's HP and AC
are the DM's information (the rail shows character-backed vitals only), and a
combatant can be **staged**: `Participant.hidden` (eye toggle on the DM row,
hand-typed rows only — a character-backed row is somebody's seat, not a
surprise). Hidden rows keep their slot in the order but don't render on
player clients — rail, report-target list, and the turn banner says "The DM
is up to something…" instead of leaking the name. This is dramaturgy, not
privacy: the row still travels inside the shared encounter object (no
per-recipient copies exist), it just isn't drawn — real secrets never enter
the encounter at all. Anyone holding the run-combat controls still sees
hidden rows, so an unclaimed-seat table can't end up fighting ghosts.

**The sharing dial** (`Encounter.sharing`, DM-set, defaulting to
`bloodied-enemies`): how much health players see of each other and the
monsters. Four levels — open numbers / bloodied enemies / bloodied everyone /
private — mapped by pure `vitalsVisibility(level, isCharacter)` onto
exact-numbers, a `healthDescriptor` chip (Healthy / Bloodied at ≤half /
Down), or nothing. It lives on the encounter rather than in settings because
it's _table policy_ — it has to reach every client, and LWW merges it like
any other table fact. Controlled from the DM board and mirrored in
Settings → Game (gated by `canRun`). It never touches your own vitals, the
DM's board, or the hidden-row axis. Kevin's "perfect information" tier —
players reading each other's full sheets, consented at join — is the one
step not built: it rides on the deliberately-absent full-sheet-read
machinery and a join-consent flow, a feature of its own.

**Damage is a delta, and temp HP is on the wire.** `ParticipantVitals.tempHp`
(optional, no migration) travels in the projection, because "you take 12" is
how tables speak and the DM can't drain a pool they can't see. Pure
`applyDamage(vitals, amount)` takes temp first, remainder off HP, floored at
0 — used by the report queue's Apply; the row stepper stays an absolute
_editor_. `receiveState.ownVitals` now carries `tempHp` back onto the
target's sheet, and both concentration watchers count absorbed damage (5e
keys the DC off damage _taken_), at the cost of a rare false prompt when
temp HP merely expires.

**The initiative call** (`CALL_INITIATIVE`, carries nothing): the DM rail's
"Call for initiative" rolls d20 + modifier for every sheet this client
brought (`initiativeModifierFor` in `play/initiative.ts`, shared with the
rail's self-roll button) and prompts every player — one click rolls with
their own sheet's modifier and writes their row; "I rolled my own" dismisses
for the dice-on-the-table player. The prompt clears when combat starts or
the connection drops.

**Advisories — the loop-smoothing prompts.** Concentration checks and damage
reports (below); "You're next — line your turn up" when you're on deck; at 0
HP the vitals rail surfaces the sheet's own `DeathSavesDisplay` with a
flat-d20 roll shortcut, and the your-turn banner says the death save comes
first; and out of combat the header offers **Rest** (the door to the
globally-mounted rest dialog), because between fights is when a table rests
and multiple-fights-per-session is the mission.

## Damage reports and concentration checks

Two layers riding the same rule — the app suggests, the table decides:

- **A damage roll can name its target** (`ReportDamageRow` in the roll
  dialog, shown only in a session with a DM who isn't you). It sends a
  `DAMAGE` message — a _report_, not a write: `{reportId, fromName, targetId,
targetName, amount, label}`. The DM board queues it with an editable amount
  ("it saved, halving that"), **Apply** (an ordinary `setVitals` write, so a
  player-owned target's sheet gets it via `ownVitals`) or **Ignore**. Reports
  are transient provider state like presence: deduped by id, capped at 20,
  cleared with the connection. Keeping the HP write on the DM's side is what
  makes the row safe to offer every player.
- **Concentration checks fire wherever the damage lands.** `concentrationDc`
  (max(10, ⌊damage/2⌋), in `encounter.ts`) backs two prompts. DM side: every
  HP write on the board goes through one `applyVitals` wrapper, so damage to a
  concentrating row — stepper or accepted report — raises a per-row "CON DC
  n [Kept] [Broke]" chip. Player side: the provider watches the _sheet's_
  `currHp` (not the projection), so any drop while the self participant
  concentrates — own edit, DM oversight, applied report — raises a banner
  with the DC, a "Roll the save" shortcut into the roll dialog (CON save
  modifier computed from the sheet), and Kept/Lost buttons. Nothing drops
  concentration except the buttons.

## The sessions surface

`src/routes/sessions.tsx` + `src/components/sessions/session-lobby.tsx`.

The page leads with a code box, because a code is the one thing every invited
player arrives holding — and both kinds of code are uuids, so one box takes
either and the probe works out whether it opens onto a table or a shared
sheet. (The first draft was a 2×2 of {editing, gameplay} × {start, join},
which made a guest choose between two "join" doors that led to the same
hallway.) Below the box sit the two _start_ acts as cards, and those are
genuinely different objects with different privacy stories: a gameplay
session is one table with many sheets and no shared sheet at all, an editing
session is one whole sheet with two editors.

### Storage sits before this surface, not beside it

The home page used to present "Sync to Drive", "Edit locally" and "Join a
session" as three peers. They aren't: the first two answer _where do my
characters live_ and the third answers _who am I playing with_. It only looked
like a peer because a joiner ends up with `datastore === undefined`, which is an
implementation artefact leaking into the menu.

Three of the four session paths need a datastore; only "join an editing session"
genuinely doesn't. So home keeps the two storage cards, `/sessions` lives behind
the nav, and the storage-less case is a secondary line on home ("been sent a
code?") rather than a third card. Joining stays tangential to storage — the
answer "nowhere, I'm just joining" is a real answer, not a dead end.

### One box for both kinds of code

Both codes are uuids, so shape can't tell them apart. What can is the
namespacing that keeps them from colliding: a gameplay realm is `sess<hex>` and
a character realm is bare hex, so `detectSessionKind` (`play/probe-realm.ts`)
opens a connection to each candidate in turn and sees which survives. There's no
"does this realm exist" endpoint — `openRealm` would _create_ one — so a probe
is the only way to ask. The ordering is pure and testable in `lib/session-codes.ts`;
the asking is not.

### The lobby

The step between resolving a code and becoming a participant. It exists because
three questions have nowhere else to live, and all three are about the sheet
rather than the session:

1. **Which sheet am I bringing** — or none, for a player waiting on the DM and
   for a DM who isn't playing a character. A DM's selection is multi-select
   (`bringCharacters`): party sheets, companions, NPC stat blocks all go into the
   order as static projections.
2. **Where do my characters live** — the moment not having a datastore actually
   bites is the moment worth offering one.
3. **What leaves my browser** — said where you're choosing the sheet, which is
   the only moment the answer can still be no.

Joining "as" a character is implemented as _opening_ it: the participant effect
in `use-encounter` already keeps whatever sheet is open in step with the order.
A DM brings sheets without opening any, so `/play` had to learn to render
without a character — the rail works, everything below it doesn't, because
everything below it is a view of a character.

### Participant ownership follows the open sheet

`addParticipant` is a no-op on a duplicate id and `claimParticipant` transfers
ownership, because a DM-brought sheet and its player's open one derive the same
id from the character uuid. Ownership decides whose vitals are authoritative and
who takes the participant with them on leaving, so it has to follow the live
copy. That is also most of "the DM assigns a player to a sheet" already working,
minus the sheet itself travelling.
