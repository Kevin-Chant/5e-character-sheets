# Ability mechanics: riders and effects (`src/lib/mechanics/`)

The serializable layer that describes what abilities _do_ at the table, built
on the same design rule as `CustomFormula`: a **closed set of interpretable
kinds, an open set of data compositions**. No functions are ever stored —
mechanics are plain data, so they survive Drive persistence, live-sync replay,
and undo, and homebrew can eventually author them like catalog content.

## The files

| File           | Role                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`     | Re-exports the data model + `ACTION_COST_LABELS`. **The types themselves live in `src/lib/types.ts`** — the character model embeds them (`LimitedUseAbility.mechanics`), and types.ts can't import from here |
| `riders.ts`    | Roll-time interpreter: `ridersFor` collects, `adjustDieRoll`/`applyTotalRiders` apply                                                                                                                        |
| `resolve.ts`   | Write-side interpreter: `actionBlocked` gates, `resolveEffects` emits reducer updates                                                                                                                        |
| `catalog.ts`   | Bundled mechanics for well-known features, keyed by normalized title (plus `RACE_MECHANICS`); `mechanicsForAbility` resolves ability → mechanics                                                             |
| `authoring.ts` | Homebrew editor helpers: the `SimpleAmount` codec, `deriveChoose`, effect factories                                                                                                                          |

## Homebrew: the `mechanics` field

`LimitedUseAbility.mechanics?: FeatureMechanics` is the authored override:
`mechanicsForAbility` prefers it, falling back to the catalog title lookup —
so homebrew attaches actions without a well-known name, and a mechanics field
on a _known_ name replaces (not merges with) the built-in entry. It's optional
in the schema, so no migration was needed.

The editor (`edit-ability-mechanics.tsx`, inside the limited-use ability
modal) composes actions from the same closed effect set the catalog uses.
Authors never manage `choose` by hand — `deriveChoose` recomputes it from the
effects on every edit. Amounts round-trip through the `SimpleAmount` codec
(number / N dM + K / player-picks); catalog-only shapes (chosen slot level,
per-level tables, `plusLevelOf`) render read-only as "(formula)" rather than
being mangled. Rider authoring is data-only for now (no UI).

## Riders (the roll side)

A `RollRider` modifies matching rolls: `minimumTotal` (Durable), `minimumDie`
(Reliable Talent), `rerollBelow` (Great Weapon Fighting, Halfling Luck),
`bonus`, `critRange` (Improved/Superior Critical), `advantage` (advisory note
only — advantage is situational). Each is granted with `appliesTo: RollKind[]`
tags; `RollModal` calls `ridersFor(character, kind)` and passes the result to
`rollFormula`/`rollDamage`/`rollD20Check`, which apply die-level riders as
each die is rolled (the pushed breakdown die is the one that counted).
Total-level riders are folded by `applyTotalRiders` — note it floors at 0, so
it's for damage/healing/hit-die totals, never d20 checks.

Rider sources: feature titles, limited-use ability titles, and the race name
(substring keys in `RACE_MECHANICS`, for traits like the halfling's "Lucky"
whose title would collide with the Lucky feat). Title matching is the identity
bridge — the same one Durable detection and the builder already use — and can
be replaced by a structured field on the character later without touching the
interpreters.

### `extraDamage`: the one contextual rider

`extraDamage` (Sneak Attack, Rage damage, and later Divine Smite/Divine Strike)
is the exception to "a rider is a silent fold." It carries a whole damage
expression (`amount: CustomFormula` + optional `damageType` — omit to mean "the
weapon's type", shown as its own untyped line), and its application depends on
context the fold helpers don't have, so the **roll dialog interprets it
directly** rather than `applyTotalRiders`. Three fields drive that:

- **`declareAt`** (`before-attack` | `on-hit` | `after-damage`) — the step at
  which the player commits. It's a field of its own, not folded into the
  condition, because it drives dialog sequencing (and, later, crit doubling:
  `on-hit` dice double on a crit, a `before-attack` flat bonus does not) while
  the condition is advisory prose the sheet can't verify. Today all catalog
  entries are `on-hit`, rendered in the damage section; `before-attack` ones are
  excluded there (none exist yet) for a future to-hit-side prompt.
- **`optional`** — opt-in (Sneak Attack: a checkbox, off by default) vs
  always-on (Rage damage: applied on every qualifying hit). "Automatic" is this
  flag, not a fourth `declareAt` value.
- **`oncePerTurn`** / **`note`** — advisory only (the sheet can't see turns or
  eligibility), surfaced as a reminder and a condition summary.

Collection is separate too: `extraDamageRiders(character)` (not `ridersFor`)
gathers authored `extraDamage` riders **plus** the level-scaled class ones from
`classDamageRiders` in `catalog.ts` — Sneak Attack `ceil(rogue/2)` d6, Rage
damage +2/+3/+4 — baked from class level at collection time (the die _count_ is
a literal a formula can't scale, and the collector runs at roll time with the
character in hand, so no storage is needed). Keeping it out of `ridersFor`
guarantees it never leaks into spell damage or standalone rolls; the roll modal
gates it to weapon attacks (a fixed `damage` map, no `spell`).

**Divine Smite — the slot-powered variant.** An `extraDamage` rider whose
`slot` block ({`minLevel`, `die`, `diceAtMin`, `maxDice`, optional situational
`bonus`}) is present is Divine Smite's shape: it's _both_ extra damage and a
spell-slot spend. The modal renders a slot-level `<select>` (only levels the
character has unspent, `minLevel`+), bakes the dice from the chosen level
(`diceAtMin` + one per level above, capped at `maxDice`, +`bonus.dice` when its
toggle is on), rolls them as display dice with the rest of the damage, and — the
key separation — expends the slot with an **explicit button**, not the
re-rollable damage roll. That mirrors the hit-die spend: rolling stays pure and
re-rollable, one button commits the state via `resolveEffects([{expendSlot}],
{chosenLevel})` so it syncs/undoes like any edit. `amount` on a `slot` rider is
just a pre-choice placeholder; the modal always recomputes from the slot.

## Effects and actions (the write side)

An `Effect` is one described state change: `heal`, `gainTempHp`, `spendUses` /
`restoreUses` (the owning pool), `expendSlot` / `restoreSlot`, `spendHitDie`,
`roll` (display-only, e.g. Stone's Endurance), `remind` (a table prompt — the
deliberate boundary where automation stops). An `AbilityAction` bundles
effects with an **action-economy cost** (`action` / `bonusAction` / `reaction`
/ `free` / `special` + `costNote`, rendered as a badge) and optional choices
(a slot level, or a free amount capped at remaining uses — Lay on Hands).

Two-pass contract in `resolve.ts`, and the reason for it:

- **`actionBlocked` runs at render time and never rolls dice.** `fixed`
  amounts may contain dice (Second Wind's 1d10); blocked-checks consult only
  pool/slot/HP state. An action is enabled iff _every_ effect is payable and
  meaningful (converting a slot into a full point pool is blocked, not a
  no-op).
- **`resolveEffects` runs on click**: rolls what needs rolling (reported back
  as display rolls), and emits ordinary whole-value `UpdateAction`s the caller
  dispatches — so every mechanic syncs and undoes exactly like a manual edit.
  Effects in one action compose against each other (Font of Magic's
  expend+restore touch the same pool coherently).

`AmountExpr` covers the shapes 5e actually uses: `fixed` formula (+
`plusLevelOf`/`levelMultiplier` for class-level references, since catalog data
can't know the sheet's per-class UUIDs), `chosenAmount`, `chosenAmountDice`
("spend N, roll N d6" — Healing Light), `chosenLevel`, `byChosenLevel` tables.

## The builder grants the features

Beyond pools, the wizards grant: per-level class-feature prose
(`builder/class-features.ts` `CLASS_FEATURES` — Extra Attack, Divine Smite,
Aura of Protection, …; pool-backed features stay out to avoid doubling),
**fighting styles** (fighter 1 in the guided builder, paladin/ranger 2 in
level-up — bare style names so catalog riders match, Defense folds +1 into the
AC formula), and **eldritch invocations** (whenever the warlock's known count
grows). Level-up spell pickers gate on `maxSpellLevelForClass` (rules.ts): the
leveled class's own single-classed progression at its new level — the RAW
spells-known rule — not the pooled multiclass slots.

## The builder grants the pools

`src/lib/builder/class-pools.ts` maps each class to its limited-use pools
(Rage, Ki, Channel Divinity, …) with level-scaled sizes and recharges;
`syncClassPools` runs at creation and on every level-up (covering multiclass
dips and threshold bumps like Rage counts — note it's authoritative, so a
hand-edited maximum on a _class_ pool is re-derived on the next level-up of
that class). `SUBCLASS_POOLS` (same file, keyed by subclass name) does the same for
subclass pools — Battle Master superiority dice (4→5→6), Samurai Fighting
Spirit, Land druid Natural Recovery, Celestial Healing Light — synced whenever
the owning class levels. A pool def can also carry a level-computed
`mechanics(klass)` that is attached to the granted ability and re-derived like
`maxUses` — this is how anything that **scales with level** (a growing die or
amount the static title-keyed catalog can't see) is handled: Bardic Inspiration
d6→d12, Battle Master superiority die d8→d12, Samurai Fighting Spirit temp HP
5→15. Because `mechanicsForAbility` prefers the ability's own `mechanics`, the
attached block wins over the catalog fallback. Subclass feature/spell `grants` in
`data/subclasses.ts` apply once at the choice level via the level-up wizard
(druid/wizard 2, most classes 3, cleric/sorcerer/warlock 1 in the builder).
`syncRacePools` creates trait-keyed racial pools (Breath Weapon,
Relentless Endurance, Stone's Endurance) at build. Racial features scale on
**total character level** rather than a class level, so their `mechanics` is a
function of that total (Breath Weapon 2d6→5d6); the use count is still created
once, but `syncRacePools` re-derives the `mechanics` block, and the level-up
wizard calls it (with the sheet's existing pool titles, which refresh without
creating anything new) so the dice stay current. Pool titles deliberately
match the catalog keys, so granted pools arrive with their actions attached —
`class-pools.test.ts` asserts every granted title resolves to catalog
mechanics.

Why level-baked and not a formula: the engine's `DieExpression` is
`[number, DieDefinition, DieOperation]` — the dice _count_ is a literal, so a
`CustomFormula` can scale a modifier but never a dice count. Structural scaling
(count, die size, tiers) must be baked from an integer level here; a `+CON`
kind of modifier stays a formula resolved against the character at roll time.

## The UI is generic

`AbilityActions` (`src/components/display/ability-actions.tsx`) renders
whatever actions the catalog attaches to a limited-use ability's title:
picker(s) → button → cost badge → outcome line (display rolls + reminders).
The hit-die spend in `RollModal` goes through the same `resolveEffects` path.
**Adding mechanics for a new ability is a catalog entry, not a component.**

## Fidelity gaps are commented, not hidden

Where a RAW condition isn't visible to the sheet, the catalog approximates and
says so in a comment (GWF applies to all damage rolls, Reliable Talent to all
non-attack d20s, Arcane Recovery restores one slot per use). Keep that
convention: a visible approximation beats silent absence, and the comment
marks where to improve when the model grows.

Catalog content rules follow `nonsrd-races.ts`: mechanical facts and original
paraphrased summaries only — never published prose.
