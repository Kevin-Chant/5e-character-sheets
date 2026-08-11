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

The turn state lives on the **participant** (`Participant.spent`), not the
character — a turn is a fact about the encounter, so it syncs to the table and
clears when the turn actually comes round again (`advanceTurn` resets the
incoming actor's economy).

**"End turn" is the one player control that isn't advisory.** Everything else
on the board needs implicit agreement from the table; relinquishing your own
turn doesn't — it's entirely the acting player's call. So on your turn the
button advances the shared order for real (styled primary, via
`useTurnFlow().advance`), and off-turn / out of combat it falls back to
clearing the spent slots. The DM's "Next turn" stays as the hatch for the
player who forgets to press it. The advance-with-triggers logic lives in
`src/lib/play/use-turn-flow.tsx` (provider mounted by `PlaySurface`), lifted
out of the initiative rail so both doors move the same fight and the rail's
receipt line reports whichever boundary happened last.

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

## Three interaction verbs, and no fourth

Every editable control on this surface is one of three shapes. This is a **closed
list**: adding a control means picking one, not inventing a commit rule for it.

The rule exists because the surface once had nine. Grown one control at a time,
each locally defensible, they added up to a panel where nothing transferred —
two condition adders that looked identical and behaved oppositely, an HP box
whose damage-or-heal mode was a character you typed and never saw, forms where
Enter was the only commit and a rejected entry was indistinguishable from a
dropped keypress.

| Verb        | For                                      | Rule                                                                       | Primitive                                            |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Nudge**   | correcting a number toward a value       | blur or Enter commits, Escape reverts, empty reverts rather than writing 0 | `useDeferredNumber`, `StepperInput`                  |
| **Do**      | an immediate, reversible act             | one click, never staged, never confirmed                                   | plain buttons, `SlotPips`, the condition `<select>`  |
| **Compose** | building a new thing from several fields | a `<form>` with a **visible** submit, disabled until valid                 | `AddCombatants`, `RollCallForm`, `ConcentrationCell` |

Plus one shared exception, `RevealNumber`: a value that reads as text until
clicked, then becomes a Nudge that closes when the edit ends. It's for
corrections rather than for play — set hit points to exactly 14, change how long
a condition has left — and it's deliberately hidden behind the number it edits,
because a permanent input beside every figure would be five controls competing
with the one you actually reach for. Used by `HpTotal` and the condition chip's
duration badge; don't add a sixth reveal without asking whether it's really a
correction.

Two consequences worth stating outright, because both were violated before:

- **Enter is never the only way to commit.** A bare input in a bare form can't
  distinguish "invalid" from "didn't register". If Enter commits, a visible
  affordance commits too, and its disabled state is the answer to "why did
  nothing happen".
- **Nothing is one-shot.** Every control can be used again, including a to-hit
  ruling — the surface is advisory throughout, and the only honesty available
  over an unauthenticated broker is visibility, not enforcement. A ruling that
  can't be corrected is a lock pretending to be a record.

### One control, two mount points

The DM and the player see the same facts from different seats, and the seat
should change the _density_, never the gesture. So the controls are shared and
the panels are only layout:

- `vitals-entry.tsx` — `VitalsEntry` (the delta) + `HpTotal` (the total, and the
  direct-set hatch), mounted in both the DM roster row and `play-vitals.tsx`.
  The mode is a coloured glyph in front of the field; a leading `+`/`−`
  keystroke moves the glyph rather than sitting in the box. Not a stepper —
  `StepperInput` holds initiative one cell over, and chevrons here read as
  "step by 1". **The mode resets to damage after every apply**, deliberately:
  visible isn't the same as looked-at, and a DM types the number while watching
  the roster, so a sticky healing mode would quietly heal the next hit. Damage
  is the overwhelming majority and a heal is still one keystroke (`+9`), so
  making every heal deliberate costs nothing and bounds a mis-set mode to one
  entry.
- `conditions-control.tsx` — chips plus the adder. The duration lives **on the
  chip**, not in the adder, so adding is one act and "for how long" is a
  separate thought answered on the thing it describes. That's also what makes a
  running duration correctable at all. The adder offers two groups: the
  fourteen standard conditions, and **"Spells & effects"** — the
  `CONDITION_MECHANICS` entries whose riders are actually wired
  (`WIRED_CONDITION_NAMES`: Zephyr Strike's d8, Divine Favor's d4, Hex). The
  second group exists because the consent pipeline that normally delivers
  these (`sendReport` → offer → apply) only runs at a table with a separate
  DM client — solo, or as the caster-DM, "I cast Zephyr Strike" had no way
  onto your own row and its rider no way into your rolls. A hand-placed
  effect on someone _else's_ row stamps `from` with your own participant id,
  so caster-only marks (Hex, Hunter's Mark) still pay out on provenance.
- `concentration-cell.tsx` — the input, the drop button, and the optional
  Kept/Broke swap when a check is pending.

Temporary hit points stay a `TrackerValue` Nudge rather than joining
`VitalsEntry`: 5e temp HP replaces rather than accumulates, so "set it to 5" is
the sentence and a delta would be answering the wrong question.

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

Because it's stored per _browser_ while a code names a _table_, the two need
pairing, and `ENCOUNTER_SESSION_STORAGE_KEY` is it: the code the stored
encounter came from, written on connect. Without it, starting a brand-new game
opened straight onto last week's order, round and monsters — the app looking
like it had reopened the old session rather than started a new one. So hosting
on a **new** code starts from `EMPTY_ENCOUNTER` when the stored one belongs to a
session; reopening a code keeps what it has, because that _is_ walking back into
the fight you left. The carve-out is prep: an encounter a DM built with no
session open is theirs, so any local change made while disconnected clears the
key, and hosting then keeps the six goblins they just lined up. A **reopening
host also adopts** the room's sync answer the way a joiner does (see
`connection.ts`): an answer means the table is live without them, and their
stored copy — possibly high-revision solo prep — must not win the document
race against a fight in progress. The empty-room reopen costs nothing: no
answer, no adoption, prep stands.

Two tabs of one browser share the stored encounter but each hold their own
React state, so the fight also crosses between them live over the
`BroadcastChannel` (`tab-sync.ts`): every changed `update` publishes the whole
encounter, tagged with the sender's table code, and the receiver **merges** it
through the ordinary `applyRemoteState` path — a sibling tab is just a peer
who happens to share a localStorage. A tab connected to a _different_ table
ignores it; the bounce terminates because an unchanged merge returns
identically and doesn't republish.

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

A firing trigger restores the pool to full unless the ability carries a
`restore` formula ("regains 1d3 charges at dawn"), rolled via `rollPoolRestore`
in `mechanics/resolve.ts` — shared with `planRest`, which can also consume the
`dawn` trigger when the player marks a rest as spanning dawn.

**"Every X days"** triggers (`rechargeIntervalDays`) are dawn listeners with a
countdown: `tickDawn` seeds `daysUntilRecharge` from the interval the first
dawn after a use, decrements it per dawn (the Dawn button ticks one; a
spans-dawn rest ticks `restDawnSpan` — 7 under gritty realism's long rest), and
restores via `rollPoolRestore` when it comes due. `matchesTrigger` deliberately
answers false for intervals so the plain dawn path can't full-restore what the
countdown owns; `hasTriggerFor(…, "dawn")` still counts them, so the Dawn
button and the spans-dawn checkbox appear.

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
last-write-wins — but not on one counter. The document is a **declared table
of lanes** (`ENCOUNTER_LANES` / `PARTICIPANT_LANES` in `session.ts`): each
lane is a group of fields that move together under one counter, resolved
independently, ties going to the document-race winner. The coarse race — a
monotonic `revision`, ties broken by client id — still exists, but it decides
only **membership** (which rows exist, in what order) and breaks laneless
ties. Every mutator in `encounter.ts` bumps the counter of the lane it writes.

Why lanes at all: the ordinary shape of a fight is several people writing at
the same instant. The DM types "you take 9" while the player, hearing the same
sentence, ticks the spell they're holding; the DM reseats an initiative while
its player marks a condition. Under one counter both writes start from the
same revision and the clientId tiebreak discards one of them whole — observed
in the two-browser harness as the concentration vanishing twice and the DM's
damage vanishing the third time, with nobody told either had happened. Two
writes to the _same_ lane are still genuinely ambiguous and one still loses;
all that's promised there is that everyone picks the same one.

The lanes, and what each one earned its counter for:

- **Encounter `combat` (`turnSeq`): `round` + `turnIndex`, one atomic pair.**
  5e has no additive turn advance — two people pressing "next turn" at the
  same moment is one table event, so two crossed advances tie on `turnSeq` and
  collapse to one. Merging round and index separately could produce an index
  past the end of a round. Roster changes shift `turnIndex` too but
  deliberately don't bump `turnSeq` (that shift is bookkeeping derived from
  membership, and letting it consume the counter would make an insert eat a
  concurrent advance); the merge clamps the index against the merged roster
  instead.
- **Encounter `policy` (`policyRev`): `sharing` + `hideDeathSaves`** — table
  style, versioned apart from the fight so a toggle can't race a turn advance.
- **Encounter `seat` (`seatRev`): `dmClientId` + `dmToken`.** A client that
  has simply never heard of the DM carries `seatRev: 0` and can never win the
  lane — without that, winning the coarse race erased the seat, and since
  `dmToken` goes with it the seat became _unrecoverable_ rather than merely
  unheld (`reclaimDmSeat` matches on the token). Measured at 3 tables in 6
  before the fix. A deliberate release carries a newer `seatRev` and still
  wins — the guard is against ignorance, not intent.
- **Participant rows are five lanes**: `identityRev` (name, ownership, offer,
  hidden, side), `vitalsRev` (the projection, with the guard that a copy holding no
  vitals can't win the lane), `statusRev` (conditions + concentration),
  `initiativeRev`, `economyRev` (spent). Split this finely because each pair
  has a real author pair behind it — DM damage vs player concentration, DM
  reseat vs player economy — and `session-convergence.test.ts` races them
  pairwise.

**Membership stays bespoke and asymmetric, on the coarse race — do not
genericise it into a lane.** "The winner's roster, plus re-add only rows _this
client_ contributed" is the rule that both keeps a joiner from being deleted
by a reply that predates them **and** stops a goblin the DM deliberately
removed from being resurrected by a stale peer. A symmetric union would lose
the second property; a symmetric intersection the first.

**Publishing is one loop over the counters** (`carriesNews`): reply iff the
merged result holds a lane counter the incoming copy is behind on, or a row it
lacks, or a document revision past it. Counters, **not values** — two writes
can coincide on a value and the peer still needs the counter that orders the
next one. The one place a value comparison survives is refusing a peer's copy
of _your own_ vitals: the refusal bumps `vitalsRev` past the refused copy so
the correction is visible to this loop (otherwise the room keeps last week's
HP until your sheet next changes). No ping-pong: a reply carries the counters
the peer is behind on, their merge accepts those lanes, and their next receive
finds nothing to answer — the convergence tests count traffic to prove it.

Older exceptions that survive unchanged, still learned the hard way:

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
  argument). Revisions only order writes _within one shared history_. A client
  that has just joined has its own unrelated history — its local encounter has
  been counting up on its own — and the two routinely collide on the same
  number, at which point the clientId tiebreak decides who exists by comparing
  two random uuids. Roughly half the time the joiner "won" and silently
  discarded the room: the fight in progress, the DM seat, everyone else's
  initiative. A newcomer has nothing to be authoritative about, so it defers to
  the room and contributes only its own participants.
- **Adoption is scoped to a question this client asked** — see
  `play/connection.ts`. It used to be a flag armed on join and cleared by the
  room's reply, which assumes a reply comes: joining an _empty_ realm (the DM
  walking back into their own table, which is the common case, since a realm
  outlives its occupants) gets none, so the flag stayed armed all evening and
  the next arrival's stale copy was adopted over the fight in progress. Now a
  joiner publishes `syncRequest{requestId}`, peers answer with an addressed
  `syncResponse`, and only an answer carrying that request id can replace local
  state. An ordinary `state` broadcast — from a latecomer, from anyone's edit —
  is never adoptable, which retires the failure rather than bounding it.
- **The window ends the waiting, not the listening.** If nobody answers inside
  `SYNC_WINDOW_MS` (750ms) the machine concludes _empty room, our state stands_
  — the third outcome, which previously could not be observed at all because
  "nobody is here" and "the answer hasn't arrived yet" look identical from the
  inside. The first answer wins and ends the wait, so a table of six costs no
  more than a table of one; a late answer still merges the ordinary way.

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
- **Reclaiming happens on the way in, not when a peer gets round to it.**
  Folding `reclaimDmSeat` into `receiveState` covers the reload-with-a-party
  case and only that one: a realm outlives its occupants, so the table a DM
  walks back into the next day is routinely _empty_, no state ever arrives, and
  the seat stays pointed at the tab they closed — the lobby saying "rejoining
  takes the DM controls back" and then seating them as a player. Both ways into
  a session now run one sequence (`enterSession`), and taking the seat is part
  of it: hosting claims, joining reclaims. Anything the room later says still
  wins, since it arrives after.
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
  game. The rejoin offer renders on the session bar **and on the front door** —
  the latter is load-bearing: a DM with no character and no session gets bounced
  off `/play`, so home is the only session surface they can reach. Home's copy
  of it reads from `play/session-memory.ts`, which is `lastSession` generalised
  to a list keyed by code (see "The way in" below).

An earlier draft of this section justified the seat's design with "a DM whose
laptop sleeps must not freeze the table". Kevin pushed back and he was right: a
DM who has opened this tool is present by definition, and blocking on them is
what the table is doing anyway. What survives the correction is the per-tab
`clientId` problem above — about refreshes, not absence.

Nobody closes the realm on leave: a party session has no owner, and one player
going to bed must not end everyone else's fight. Empty realms are swept by the
sidecar after a long idle (~12h), so a table that goes quiet at midnight is
still there at noon, and a DM back next Thursday lands on the reopen flow.

**Entering a session says nothing.** `enterSession`'s update — what the table
opens with, plus taking or retaking the seat — is applied _silently_, never
broadcast. It used to broadcast, which sent the local state into the room
before adoption ever ran: a joiner who runs their own table on other nights
(so the seat-reclaim genuinely rewrites their stored encounter) published
their whole other fight — high revision, seat claim and all — and won the
document race on every peer, wiping the room they were walking into.
Everything a newcomer holds reaches the room through the handshake instead:
the re-add and seat rules in `receiveState` publish exactly what the room
turns out to lack.

### Verifying it

Unit tests cover the merge rules, and everything that happens when a peer's
state arrives is one pure function — `receiveState` in `play/session.ts`
(merge + seat reclaim + the publish-back decision), so the provider is reduced
to storage, React state and the network. **Multi-client convergence and the
connection lifecycle are unit tested** via `src/lib/fixtures/session-sim.ts`:
a fake broker (topic map, synchronous delivery, publisher receives its own
messages — nightlife-rabbit doesn't honour `exclude_me`) driving several
`SimClient`s that run the _real_ pieces — the envelope (`accept`/`stamp`, so
self-echo and stale-version drops are the app's own), the connection machine
(`connectionReducer`), the entry rules (`encounterForTable`, seat
claim/reclaim, the silent entry) and the merge. The broker being synchronous
gives "the sync window closed with no answer" a natural reading: still
`syncing` when `enter` returns means the room is empty; `crossing()` holds
messages to model an answer arriving _after_ the window.
`session-convergence.test.ts` covers the table converging, the lane races and
the seat; `session-lifecycle.test.ts` covers joining, syncing, reopening and
the stored encounter's table pairing — this week's three shipped bugs live
there as unit tests, plus the DM-elsewhere entry-broadcast wipe the simulator
itself caught. The transport is verified by the committed hand check:
**`pnpm session-smoke`** drives several real browser contexts through the
flows against a running `pnpm dev` + `pnpm server` and asserts what converges.
`--only <scenario>`, `--headed`, `--slow <ms>` and `--shots <dir>` are there
for watching a failure happen.

The split used to be lopsided — every bug in this layer was found in the
browser harness because no unit test could express a connect. The lifecycle
suite exists so the next one is a unit test first.

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
  The owner answers each offer **at most once** (a synchronous ref in
  `onClaimSheet`, because two claims in one round-trip window both read the
  pre-claim state and both used to be sent the sheet — after which two
  browsers fought over one participant row). Re-offering or re-assigning the
  sheet is what re-arms it, which is also the DM's answer to a claimant who
  vanished before opening.
- **Presence is what the DM points at** (`PRESENCE` topic; pure roster helpers
  `withPresence`/`withoutPresence` in `session.ts`). Each client announces
  `{clientId, displayName}` on connect, on a heartbeat and in reply to every
  sync request; `LEAVE`
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
is a static badge), the add form and remove. A row is init | who | vitals |
conditions | concentration | remove; the active row is spotlit and the next
one carries a small "next" chip. The vitals cell speaks deltas first: a small
damage box ("takes 9"; `+N` heals) is the primary write, routed through
`applyDamage`/`applyHealing` so temp HP drains first and the concentration
reminder fires with the true dealt number — and the running total beside it
is a button that opens a direct set-HP edit, the escape hatch for corrections
a delta can't express.

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

### Is anybody behind this row? (`play/liveness.ts`)

A roster of creatures could not say which of them were _people who were still
there_. A player whose phone dropped out left a row identical to a player who
simply hadn't acted yet — same name, same HP — so the table waited on a turn
that was never coming and the only way to find out was to ask out loud.

Nothing in the encounter can answer it, and shouldn't: liveness is not a fact a
document converges on (see `realm/presence.ts`). It's the crossing of the row's
`ownerClientId`, which _is_ in the document, with the presence roster, which is
not. `participantLiveness` returns `none` (a stat block), `self` (a sheet this
browser holds), `live`, `quiet` or `gone`, and only the last three draw a chip
— a chip on every row is a chip nobody reads.

**`quiet` is the interesting one, and it exists because of phones.** A
backgrounded mobile tab has its timers throttled to roughly one firing a
minute, so a missed heartbeat from a player is far more often "their screen is
off" than "they dropped". One timeout can't say both — short enough to notice a
drop is short enough to flap on every backgrounded phone — so there are two:
`PRESENCE_QUIET_MS` (25s, the word changes) and, for this layer only,
`TABLE_PRESENCE_TTL_MS` (3 min, they're forgotten). Two more things hold the
reading up on a bad connection:

- **Every inbound message refreshes the clock** (`onPeerHeard` → `touch`), not
  just the heartbeat. A client publishing a roll or an encounter is as alive as
  one saying so, and on a throttled tab a tap-triggered publish gets out when
  the interval doesn't. `touch` deliberately isn't an upsert — there's no name
  in it, and a named roster entry must not be replaced by an anonymous one.
- **The quiet set is state, not a render-time derivation**, recomputed on the
  beat, so it changes with the clock rather than with whatever unrelated
  re-render happened to land.

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

That `ownVitals` push needs an **open** character, which is the gap the
open-time adoption closes: a sheet that was closed when the DM's write arrived
used to reopen holding its old number and immediately publish it back,
silently reverting the correction. So the vitals-publish effect's first run
for a newly-opened character goes row → sheet (`currHp`/`tempHp`, as an
ordinary dirty, undoable edit) — but **only while connected**: at a live table
the room's copy is the current truth, while an offline row is exactly what it
isn't (last week's fight, a sheet since rested in Drive), so solo the sheet
stays the document of record.

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

**Sides** — every DM row also carries a Foe/Party chip (`Participant.side`,
identity lane, `setSide`): the grouping the players' target strip and the
dialog's pickers read via `isFoe`. It defaults from the no-sheet-means-foe
heuristic and exists because that heuristic misses both ways (a hand-typed
NPC ally, a sheet-backed villain) — and because sides change mid-fight.
Advisory grouping only: anyone can still target anyone.

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
0 — used by the report queue's Apply **and** by each DM row's damage box
(`applyHealing` is the `+N` counterpart, clamped to max); direct HP set is
the click-the-total escape hatch. `receiveState.ownVitals` carries `tempHp`
back onto the
target's sheet, and both concentration watchers count absorbed damage (5e
keys the DC off damage _taken_), at the cost of a rare false prompt when
temp HP merely expires.

**The initiative call** (`CALL_INITIATIVE`, carries nothing): the DM rail's
"Call for initiative" rolls d20 + modifier for every sheet this client
brought (`initiativeModifierFor` in `play/initiative.ts`, shared with the
rail's self-roll button) and prompts every player. The prompt follows the
roll-mode toggle (see `rolling.md`): app mode is one click with the sheet's
own modifier; real-dice mode asks for the d20's face and adds the modifier
itself, the same ask as every other manual d20. Either writes the
row directly — and either also reports itself to the seat (a `roll`-stage
report labelled "Initiative", faces and typed-or-rolled flag included), as
does the rail's self-roll die button: the roster's number alone couldn't say
what the d20 showed or what was added to it. "Not now" dismisses. The prompt clears when combat starts or
the connection drops. In real-dice mode the rail's self-roll die button
also disappears — the stepper beside it is the entry.

**Advisories — the loop-smoothing prompts.** Concentration checks and damage
reports (below); "You're next — line your turn up" when you're on deck; at 0
HP the vitals rail surfaces the sheet's own `DeathSavesDisplay` with a
flat-d20 roll shortcut, and the your-turn banner says the death save comes
first; and out of combat the header offers **Rest** (the door to the
globally-mounted rest dialog), because between fights is when a table rests
and multiple-fights-per-session is the mission.

## Roll reports: the attack as a conversation

`src/lib/play/reports.ts` is the pure core; `REPORT` / `VERDICT` carry it; and
`use-table-talk.tsx` holds the state.

**Why a second context.** The encounter is a shared document — merged,
versioned, persisted. None of that applies to a rolled 17, a "give me a
Perception check", a ruling of "that hits" or an offer of 8 healing: each
describes a moment rather than a state, is addressed to somebody, is answered or
ignored, and is gone when the connection is. They lived in the encounter
provider because that is where the transport is, and it reached 1075 lines
behind a 68-member context as a result. The split is **by lifetime, not by
feature** — everything born from an arriving message and dying with the socket
moves out, with an explicit input contract. It is still mounted by the encounter
provider (the handlers must reach `usePlaySession` at creation while the senders
only exist afterwards; `bind` closes that loop, as `broadcastRef` does for
state).

An attack is not one roll, it's a small exchange, and the first draft made the
player hold that exchange out loud: roll to hit, ask the DM whether it landed,
roll damage, _then_ pick a target from a dropdown and press "Report to DM" to
send a bare number. Four steps, three of them invisible to the person who has
to rule on them. The order is now **target first, then dice**:

- **A `RollReport` is one roll, published as it lands.** Rolls made in one
  opening of the dialog share an `exchangeId` (the `RollRequest.id`), so the
  seat reads one filling-in card rather than unrelated numbers. It carries what
  the DM actually needs to rule: the d20 faces and adv/disadv `mode`,
  `critical`/`fumble`, damage itemised by type _and by rider source_
  (resistance is a ruling, and a second Sneak Attack in one round should be
  visible), the save `dc`, and `manual` — whether the number was generated or
  typed from real dice. Bonus dice riding a d20 (Bless's d4) cross itemised by
  source (`bonuses`), and the flat modifier is _derived_ on the board
  (`impliedModifier`: total − kept − bonuses, so the parts always add up) —
  the seat reads "d20 14, +3 modifier, +4 — Bless (4)" rather than a bare
  total. All of that used to stay on the roller's screen.
- **Re-rolls are numbered, never blocked** (`attempt`). Click Roll having
  forgotten your advantage and you just roll again; the card says
  "re-rolled ×1 — was 8". A roll made _before_ a target is named is **held and
  flushed with its true attempt** the moment one is, because roll-then-target
  was otherwise the way to make a bad roll disappear. That is the whole
  enforcement model and it is deliberately social: a rogue client can publish
  anything, so the goal is only to make the ordinary, half-innocent re-roll
  visible. What can't be stopped can still be witnessed.
- **The DM rules in-app.** `ToHitRuling` shows the roll against the target's
  `vitals.ac` with a `beatsAc` opinion, and **Hit / Miss** sends a `VERDICT`
  back to the roller, who sees "Your DM says: that hits" under the roll it
  answers. Advisory both ways — the opinion can't see a Shield reaction, and
  the damage button never waited on the answer. A **check** gets the same
  treatment via `CheckRuling` — **Success / Fail**, no advisory opinion (the
  DC lives in the DM's head) — and the answer lands under the roll-call
  prompt or the check dialog alike. Death saves are exempt: they score
  themselves, so the verdict is already in the label.
- **Self-directed rolls report themselves.** A hit-die spend and every
  resource-action roll (`ActionRow` → `resolveEffects` display rolls — Second
  Wind's d10, a feature's `roll` effect) go to the seat as they land: the HP
  write reaches the DM as a bare projection change, and these are the
  "Second Wind: 9" that explains it. Healing-shaped rolls ride the `healing`
  stage _untargeted_ (no target → no apply row — the write is the player's
  own); anything else rides the generic `roll` stage, which has nothing to
  rule and nothing to apply. Each ability use is its own exchange at
  attempt 1 — using Second Wind twice is two acts, not a re-roll.
- **Damage still lands the same way**: an editable amount ("it saved, halving
  that") and **Apply**, an ordinary `setVitals` write, so a player-owned
  target's sheet gets it via `ownVitals`. Applying dismisses the card — with
  every roll at the table arriving here, a queue that only grew would be
  unreadable by round three. Reports are transient provider state like
  presence: deduped by id, capped at `REPORT_CAP`, cleared with the connection.
- **A save-based effect targets a set, not a pick.** An attack roll carries
  one `targetId`; a save-based spell or ability carries `targetIds` (+
  index-aligned `targetNames`) — checkboxes in the dialog, because "Orc 1 and
  2 are in the blast" is a set. The exchange card normalises both shapes into
  `Exchange.targets` and renders **one apply row per tracked target** ("Orc 1
  saved, Orc 2 didn't" is the ordinary ruling, so each box takes its own
  halving); with several rows, applying one marks it Applied and the card
  stays until dismissed, so the first orc's ruling can't sweep the second's
  box off the queue. The spell's save DC rides the report (`spellSaveEffect`
  in `attack-roll.ts` bridges the catalog's `resolution: {kind:"save"}` into
  the dialog's `SaveEffect` — the dialog used to drop it entirely, so
  Fireball showed no DC).
- **A diceless cast still crosses the wire** — the `cast` stage. Hideous
  Laughter rolls nothing on the caster's side, so the dialog (rollable now
  means "dice, or a save to announce" — `rollableSpell`) offers **Announce
  cast**: disabled until aimed, then one button sends the label + DC +
  targets, and the card renders it with no total (the save chip is the
  number). Re-announcing is numbered like any re-roll.
- **The target is remembered** (`lastTargetId`, local to the browser), so a
  second swing at the same goblin needs no second pick — but **only an
  attack opens pre-aimed**: a plain check or a hit die must not inherit the
  goblin from your last swing and report itself as aimed at it (it briefly
  did). It can be set _before_ any attack from the **target strip**
  (`target-strip.tsx`): a
  standing row of foe chips (`isFoe`: the DM's explicit `side` if set, else
  no-sheet-means-foe) between the play header and the board, each showing the
  shared-vitals read and conditions, one tap making it your target. The roll
  dialog's single-target select groups by the same split (Enemies above
  Party; healing reverses the order) — and healing may aim at **yourself**,
  listed "(you)" and first in the Party group; a DM-approved self-heal offer
  routes back to the caster like any character-backed target.

- **Cast conditions travel as names, never mechanics.** A condition-granting
  spell (looked up by title in `spells/spell-conditions.ts` — an overlay, not
  a mechanics field, so already-imported sheets and the generator-owned SRD
  JSON both stay untouched) stamps `condition: {name, rounds?}` onto every
  report of its exchange, and announces even with no dice and no save (Bless:
  the announcement _is_ the cast, and a save-less condition may target
  yourself). **Abilities ride the same channel**: an `AbilityAction` with
  `applies` (Stunning Strike → Stunned, Hexblade's Curse, Bardic
  Inspiration, Vow of Enmity, the Channel Divinity turns and curses, Stone
  Rune, Favored Foe's mark, Quivering Palm) gives its action row the grouped
  target picker and reports the use as a `cast` stage with the condition name
  — the ability path (`ability-actions.tsx`) and the spell path converge
  before the wire, so offers and DM apply buttons need no second mechanism.
  And when the condition lands on a _hit_ rather than a use (Fire Rune's
  restrain, Eldritch Smite's prone), the `extraDamage` rider carries the
  `applies` and the dialog stamps it onto the damage report the extra rode.
  A save-the-room feature ("each fiend within 30 ft." — the Channel Divinity
  turns, Conquering Presence, Watcher's Will) sets `multi` on the grant: the
  row offers Fireball's checkbox set (`TargetMultiPicker`), the report
  carries `targetIds`, and the per-target offers/apply buttons need nothing
  new. A `multi` picker includes your own row (a room-wide effect routinely
  does — Watcher's Will names "you and they"); a single-target one never
  offers you. What happens next splits by who keeps the target: **your own
  row** prompts you locally, **another character** gets a `ConditionOffer`
  over the wire ("Ellora cast Bless on you — apply?") and applying is the
  bearer's own statusRev write, **a sheet-less row** gets neither — the DM
  applies from the exchange card's per-target button, disabled while the row
  already holds it. Offer ids are deterministic (exchange:stage:target), so a
  re-rolled report re-implying the same offers is an idempotent repeat. The
  receiving side resolves the _name_ against the bundled
  `CONDITION_MECHANICS` catalog (`play/condition-mechanics.ts`) — wired
  riders for buffs (Bless's d4 rides attacks and saves via the `bonusDice`
  rider, rolled at roll time), a summary line for everything else — which is what
  makes "fully wired conditions" safe: a rogue client can lie about which
  buff it cast, but cannot inject mechanics into a peer's rolls.
  **Marks are the mirror**: a condition's `against` riders apply to rolls
  aimed _at_ its bearer, read off the dialog's chosen target — Faerie Fire's
  advantage for anyone, and `casterOnly` ones (Hex's necrotic d6, Hunter's
  Mark, True Strike, Bestow Curse's d8) only for whoever placed it, which is
  why conditions carry provenance (`ActiveCondition.from`, stamped from the
  report/offer's `fromParticipantId`). Defensive wards with no wireable die
  (Blur, Sanctuary, Mirror Image, Fire Shield, Protection from Evil and Good)
  ride the same channel as advisory `advantage`-notes, so "your attack has
  disadvantage" appears on exactly the roll it concerns. The same target read surfaces
  `CONDITION_TARGET_EFFECTS` advisory notes — attacking someone Prone or
  Restrained is the advantage a table most often forgets. Marks live on
  encounter rows; at a table they arrive over the wire, and solo they can be
  placed by hand from the condition adder's "Spells & effects" group onto any
  local row (a hand-typed goblin bears a Hunter's Mark just fine).

**What deliberately does not cross the wire.** Two boundaries hold by design,
not omission — changing either is a product decision, not a gap fix:

- **Reports flow player→seat only.** `reportsEnabled` is false for the DM
  (and solo), and only the DM board renders the queue — so players never see
  each other's rolls, and the DM's own rolls are never broadcast ("the DM
  rolls in the open" tables aren't supported). Opening this up means both a
  wire change and a player-facing feed surface.
- **Resources stay private by construction.** Slots, pools, ammo, and
  everything else on the sheet never enter the participant projection —
  name/initiative/HP/AC/conditions is the whole of it. The privacy default
  holds because the data never travels, not because a flag hides it; widening
  the projection erodes that guarantee.
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

## Roll calls, rest calls, healing routing, and death saves

Four more loops on the same report-never-write pattern:

- **Ad-hoc checks and roll calls.** `src/lib/play/checks.ts` models any save /
  ability check / skill as data (`RollCallCheck`), with `checkModifier`
  mirroring the sheet's skill-column math (it lives beside `initiative.ts`
  because the bonus formulas need the engine, which `rules.ts` can't import).
  Player side: a `CheckLauncher` select in the play header opens the ordinary
  roll dialog — advantage, condition notes and real-dice mode included. DM
  side: the board's "Ask for a roll" form (`components/play/table-calls.tsx`,
  alongside the rest call — both are sentences said to the room rather than
  edits to the roster) sends `ROLL_CALL {check, toClientIds?}` — **an absent
  audience means the whole table**, which is the common case and so the cheap
  one to encode. Addressing is read through `rollCallReaches`, never by
  comparing a field inline. The list replaced a single `toClientId`, which is
  still _written_ (never read) when there's exactly one recipient, so a peer on
  the same protocol version but an older build addresses that call correctly
  instead of showing it to everybody; a multi-recipient ask degrades there to
  the whole table, a wider audience rather than a wrong one. Two form details
  are load-bearing: the check picker is a **closed typeahead** (thirty-one
  grouped options — "Perception" is four keystrokes, and a value only exists by
  being picked, so free text disables Ask rather than becoming an ask), and the
  audience is **chips, not a `<select multiple>`**, which needs a modifier key
  no phone has and hides the answer behind a scroll box. Chips prune against
  the live roster, because an ask aimed only at someone who left would reach
  nobody and read at the table as the app swallowing it.
  The prompt (`RollCallPrompt`) is one button that opens the
  ordinary roll dialog **aimed at the call's own exchange id**
  (`openRoller({id: callId, attemptBase})`), so the answer is a `check`-stage
  `RollReport` under the ask and carries everything the dialog knows — Bless's
  d4, a condition's note, advantage buttons, real-dice entry. (It used to roll
  inline, which silently skipped every rider: the same character answered
  "Roll a check…" with the d4 and the DM's call without it.) The prompt reads
  what it already sent from `sentChecks` in the table-talk layer — the broker
  drops self-echoes, so a sender's own rolls never come back through
  `reports` — and passes the last attempt as `attemptBase`, so a dialog
  re-opened onto the same call numbers its roll attempt 2 rather than posing
  as an innocent first. The prompt doesn't close on being answered — same
  bargain as the attack dialog: never block the re-roll, always show it. Any check rolled through the dialog
  while at a table reports itself the same way, which is what picking up a d20
  in front of your DM has always meant.
- **Rest calls open a panel, they don't take a rest.** The "Call a rest" form
  (its sibling in `table-calls.tsx`) sends `REST_CALL {callId, kind,
spansDawn?}` — never addressed,
  because a rest is something the whole party does, so there is nobody to
  address it to. It carries **exactly the two facts the table settles**: which
  rest, and whether it spanned daybreak. Both are the DM's to narrate and no
  sheet can work them out; everything else a rest involves (which hit dice to
  spend, what to re-prepare, which "at dawn" item to leave spent) stays with
  each player, which is why this is not a "rest the party" button. The prompt
  (`RestCallPrompt`) opens that player's own rest panel with those two
  answers filled in (`RestPreset`, passed through `openRest(preset)`), landing
  past the fork on the called rest's workspace — the fork's job is to ask the
  two questions the DM has already answered. "Back" still returns to it,
  because a player is entitled to disagree about what the table just did.
  Applying the rest from the wire was the tempting version and the wrong one:
  a long rest is a dozen fields, follow-ups the player drives, and one
  undoable `replace_character` — it would be the only remote action at this
  table that rewrites a sheet nobody touched.
- **Healing routes through the DM, then the recipient.** The roll dialog's
  healing result rides the same exchange with `stage: "healing"`. On the DM
  queue, approving splits by ownership: a
  hand-typed row applies directly (`applyHealing`); a character-backed row
  sends `HEAL {targetId, amount, fromName, label}` and the _recipient_ gets an
  "N healing incoming from A — Apply / Ignore" banner whose Apply is their
  own sheet write. Nobody ever writes a sheet that isn't theirs.
- **Death saves ride the projection** (`ParticipantVitals.deathSaves`,
  present only while down or mid-saves). The DM row always shows the "2✓ 1✗"
  chip; the party rail shows it by default behind
  `Encounter.hideDeathSaves` — table policy like the sharing level, set from
  the board's grouped visibility controls (`.dm-visibility`: the sharing
  select + the death-saves checkbox) and mirrored in Settings → Game. Never
  shown where the sharing level already hides vitals entirely.

## The way in

`src/routes/home.tsx` (the hub) + `src/routes/host-game.tsx` +
`src/routes/join-session.tsx` + `src/components/sessions/session-entry.tsx` +
`src/components/sessions/session-lobby.tsx`.

**The front door asks what you came to do.** It used to ask where your
characters live, and teleport anyone who had already answered into their sheet
list. That redirect was a good deal for exactly one person — someone who only
builds characters — and everyone else paid for it: a DM who doesn't play has no
answer to the storage question, and a player following an invite link shouldn't
be asked one. Worse, the answer to _their_ question lived behind a `FaUsers`
icon in the top-right that you had to already know about.

So home is the hub, in three bands:

1. **Pick up where you left off** — the games this browser has played at, and
   the sheet it had open. This is what the redirect was worth, paid back as an
   offer instead of a teleport, and it costs the character-builder one click.
2. **Been sent a code or a link?** — the arrival with the least context to spend
   on finding anything. One box, both kinds of code, and it accepts a pasted URL
   as readily as a bare uuid (`extractSessionCode`), because people forward the
   whole link.
3. **Run a game / My characters** — the two things you can start. Storage
   collapses from two cards to one door once it's been answered, and a _third_
   thing — co-editing one sheet — is a sentence rather than a card, because it
   can't be started before a character is open.

There is no Sessions button in the nav any more. A second icon landing where
Home already lands is the duplicate door this page was written to argue against.
`/sessions` redirects to `/` for anything still pointing at it.

### The lobby is a URL

`/host` starts a table; `/join/<code>` is the invite link and the destination of
the code box. Two things fall out of that which were awkward as router state:

- **The invite link is just a link.** A DM copies `…/join/<code>` from the
  session bar, pastes it into the group chat, and a player who has never opened
  the app clicks it and lands in the lobby for the right table having answered
  nothing. It resolves over a static bucket only because the CloudFront
  distribution already rewrites 403/404 to `/index.html`; no hosting change was
  needed.
- **The Drive round-trip is a `returnTo` path.** Picking Google Drive from
  inside the lobby used to have to ferry a half-answered lobby through an OAuth
  popup as router state. Now it's `state={{ returnTo: location.pathname }}`.

`session-entry.tsx` is the shared half — lobby, then connect, then
`/play/<code>` — and the routes differ only in which question the lobby leads
with.

### The table is in the URL: `/play/<code>`

The session's `/sheet/<uuid>`, and for a sharper reason. **A phone browser
evicts a background tab out of memory whenever something else wants it** — a
call, a camera, a map — and what comes back is a cold page load: React state
gone, socket gone, mid-fight. Everything needed to put it back was already in
the browser (the encounter in localStorage, the DM token, the per-code memory);
the one thing missing was _which table_. `/play` names a surface, not a game.

`play/rejoin.ts` is the pure decision and `hooks/use-auto-rejoin.tsx` the
wiring. Three answers:

- **Rejoin** — this browser knows the code (per-code memory, or it was
  `lastSession`), so reconnect without asking. Joins first whatever the seat is,
  because a DM's realm is usually still up and joining reclaims the seat from
  the `dmToken` anyway; only an `absent` realm falls back to `hostSession(code)`,
  which is the same reopen-this-code path the invite link uses.
- **Lobby** — a code this browser has never seen is an invitation, not a
  resumption, so it redirects to `/join/<code>` where the questions live (and
  where the probe can still discover it's a shared _sheet_).
- **Wait** — connected, or an attempt in flight.

Retries back off (`REJOIN_BACKOFF_MS`) and reset immediately on
`visibilitychange`, `online` and `pageshow` — `pageshow` being the Android
case specifically, since a _frozen_ tab was never hidden. `MAX_REJOIN_ATTEMPTS`
is where the surface stops _promising_ and offers a manual button, not where
trying stops: past it the retry holds at the 60s tail for as long as the tab is
on screen, because the two things that outlast the ladder — a sidecar redeploy
and a DM who stepped out — both end with someone reopening the realm minutes
later, and a table that heals itself beats one that needs every player told to
press a button. What the cap does end is retrying _out of sight_: a phone in a
pocket fires wake events all night, and `online`/`pageshow` past the cap no
longer restart the ladder. Someone actually looking at the tab still does.

Three things are easy to get wrong here and are each pinned by a comment:

- **The redirect guard is `atTable`, not `rejoining`.** Every attempt passes
  through `connecting`, and the play surface's "no character and no session →
  `/sheet`" redirect fires in that gap, navigating away from the one URL that
  knows the way back — and unmounting the retry loop with it.
- **The session actions are read through a ref.** The scheduled attempt runs
  half a second after the effect that scheduled it, and settings are read from
  localStorage in a _mount effect_ — so a closure captured on the first render
  of a cold load carries the built-in default host, which is the **cloud**
  sidecar. Observed: a local table reconnecting to production and failing with
  `no_such_realm`, which reads exactly like the table having closed.
- **Leaving clears the code from the URL**, because otherwise the rejoin puts
  you straight back into the seat you just stood up from.
- **The URL's code is only ever replaced by another code**, never dropped for a
  session that hasn't reported one (`shouldRestamp`). The connected code is
  read off the transport's own realm name (`sessionForRealm`) rather than kept
  in a second piece of state — a copy written after `connect` resolves gives a
  render where the status says connected and the code is still absent, which
  was enough to rewrite `/play/<code>` to a table-less `/play`. The tab stayed
  connected, so nothing looked wrong until the next reload had nothing to go
  back to. Pinned by `--only reload`, which reloads twice.

The sheet comes back too: the per-code memory records what this browser played
at that table (kept current as it changes, and never written as `undefined` —
entries merge, and the reconnect lands _before_ the character is reopened), so
a rejoin is the table and the character, not a seat with nobody in it. A DM's
memory deliberately records no sheet.

`session-smoke`'s `reload` scenario is the hand-check: a player's tab and then
the DM's are reloaded mid-table and nothing is clicked afterwards.
`tabledropout` is the other half — a real network drop via `context.setOffline`
— and asserts that a player who was away for the start of combat comes back
into round 1 without touching anything. `deploy` is the third: both tabs point
at a `/play/<code>` the sidecar has never heard of (what a restart leaves
behind), and the DM's reopens the realm on its own code with the player seated
behind it.

### Two tabs, one seat

`dmToken` is per browser and `clientId` is per tab, so a DM with the app open
twice has two clients that each recognise the seat as theirs, and neither can
tell the other from its own pre-refresh self. Left alone they take it back off
each other forever, every bump publishing — in the simulator this recurses
until the stack blows, which is what a realm full of seat swaps looks like from
the inside.

The fix is that the **automatic** reclaim is spent once per connection:
`receiveState` reports `reclaimedSeat`, and the provider stops offering its
token afterwards. Two bumps and it settles, whoever moved second holding the
seat. Every legitimate reason to reclaim — a refresh, a crash, a dropped socket
— starts a _new_ connection and so gets a fresh one, and taking the seat back
deliberately is still one click on the session bar. Pinned by "two tabs of one
browser at the same table" in `session-lifecycle.test.ts`.

### Three lobbies, not two

"Hosting" and "running the table" are different questions, and conflating them
was a bug waiting to happen:

- **Start a table** (`/host`) — multi-select the sheets to bring.
- **Rejoin the table you run** (`/join/<code>` where memory says `seat: "dm"`) —
  _asks nothing_. The room already holds everything that was brought, and
  `bringCharacters` calls `setVitals` from the sheet, so re-bringing mid-fight
  would re-snapshot three rounds of damage back to full health.
- **Join someone else's** — pick the sheet you're playing, or don't.

What each one leads with is the whole difference between the people who arrive.
A DM with no sheets gets "Start the game" as the primary button with storage
folded into a `<details>`; a player whose DM said not to worry about a character
sheet gets a name field and "Join the game", with storage in the same
disclosure. Neither meets a storage picker.

### What the browser remembers, and why it isn't on the character

`play/session-memory.ts` is a localStorage list keyed by code, holding the seat,
the sheet played, the sheets brought, and an optional local table name. It
duplicates `Character.playSessions` on purpose, because that one cannot answer:

- **A DM has no character.** The persona that most needs a rejoin shortcut has
  nothing to hang one on.
- **The hub renders before any datastore does.** Drive is an OAuth round-trip
  plus a list fetch; a resume strip that waits for that is one nobody sees.

Entries **merge** rather than replace, which is what lets the connect effect in
`use-encounter` record the code while the lobby records the seat, with neither
knowing about the other. The one ordering subtlety: child effects run before
parent ones, so the lobby's write lands first and the provider's read of
`seat === "dm"` sees it — which is how a DM's rejoin row avoids being labelled
"as Guard Captain" just because they had an NPC sheet open.

**Codes churn, so the prefill has a fallback.** A realm exists only while
somebody is connected, so unless the DM deliberately reopens it, next week's
code is new and per-code memory has nothing to say. `lastPlayedCharacter()`
answers the question that's still true — you played Brakka last game — and the
lobby preselects that.

### A durable invite link

`host()` used to always mint a fresh uuid, which meant the link a group pinned
in their chat was good for one evening. It now takes an optional code, and
`/join/<code>` offers **"Open this table again"** when the probe finds nothing
_and this browser remembers running that code_. A player following the same dead
link gets the ordinary "ask your DM" message — the offer is made only to the one
browser that can show it ran the table.

Realms outlive their occupants (nightlife-rabbit keeps one for the server's
lifetime), so in practice a code dies on a sidecar restart — every deploy. That
is exactly often enough for this to matter and too rare to reproduce in the
smoke harness by having everyone leave, which is why the `invite` scenario seeds
a never-opened code instead.

## Resolving a code

### One box for both kinds of code

Both codes are uuids, so shape can't tell them apart. What can is the
namespacing that keeps them from colliding: a gameplay realm is `sess<hex>` and
a character realm is bare hex, so `detectSessionKind` (`play/probe-realm.ts`)
opens a connection to each candidate in turn and sees which survives. There's no
"does this realm exist" endpoint — `openRealm` would _create_ one — so a probe
is the only way to ask. The ordering is pure and testable in `lib/session-codes.ts`;
the asking is not.

### What the lobby is for

The step between resolving a code and becoming a participant. It exists because
three questions have nowhere else to live, and all three are about the sheet
rather than the session — which of them it _leads with_ is "Three lobbies, not
two" above:

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

**Except for whoever holds the DM seat, for whom an open sheet is a document,
not a seat** (`holdsDmSeat` in `use-encounter.tsx`). A player's open sheet is
the character they are playing; a DM's is an NPC they are reading, a rule they
are checking, or a player's stats they are looking up — and a DM opens far more
sheets than they play. Four effects key off the open character and are all
wrong for that seat: the participant sync (which _seated_ every sheet the DM
opened, in everyone's initiative order, and took the row off a player whose
sheet the DM read), the vitals projection (which published the DM's copy of a
sheet over the row the player was keeping), the `playSessions` write (a game
recorded on a character that never played it — an edit, and an autosave, to
someone else's sheet), and `self`, which made a row the DM merely had open
disappear from their own attack targets. The DM seats combatants from the
board, which is where their creature-facing controls already are. Pinned by
`session-smoke --only dmsheet`, which walks the DM off the board to a sheet
and back.
