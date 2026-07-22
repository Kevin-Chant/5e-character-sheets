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
the owning class levels. Subclass feature/spell `grants` in
`data/subclasses.ts` apply once at the choice level via the level-up wizard
(druid/wizard 2, most classes 3, cleric/sorcerer/warlock 1 in the builder).
`syncRacePools` creates trait-keyed racial pools (Breath Weapon,
Relentless Endurance, Stone's Endurance) at build. Pool titles deliberately
match the catalog keys, so granted pools arrive with their actions attached —
`class-pools.test.ts` asserts every granted title resolves to catalog
mechanics.

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
