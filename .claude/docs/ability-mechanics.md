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

## Chosen options (`ChosenOption`)

`Character.chosenOptions?: ChosenOption[]` (`{category, name, detail?}`) holds
picks from a class's **closed** option lists — Metamagic, Battle Master
maneuvers, Pact Boon. What makes these their own model rather than `features` is
the pairing of a closed list with a **known count**, which is what lets the sheet
show "3 / 5 known" and offer only the unpicked rest. The catalog lives in
`src/lib/builder/chosen-options.ts`; `availableOptionGroups(character)` returns
the groups a character qualifies for (class, subclass, and level threshold all
gate it) with their current allowance.

**Fighting styles and eldritch invocations deliberately stay in `features`.**
Rider matching keys off feature titles, so moving them would silently unhook
Great Weapon Fighting, Archery, and Dueling. `ridersFor` _does_ also scan chosen
options by name against the same title-keyed catalog, so an option that later
gains mechanics works without being moved — and the field isn't inert.

Licensing note: Metamagic and Pact Boon are SRD (base-class features); the Battle
Master is **not**, so its maneuver summaries are original paraphrases of
mechanical facts only, per the rule in `nonsrd-classes.ts`.

Both wizards prompt for them, through one shared `ChosenOptionPicker`
(`builder-common.tsx`) that offers only what's _new_ — options already known
from an earlier level are filtered out, and the boxes lock once the level's
allowance is spent:

- **Level-up** — folded into the existing "Class features" step, alongside
  fighting styles and invocations. `newOptionPicksAt(className, level, subclass)`
  gives the delta for the level. The subclass is read from the _pending_ choice
  first, so a fighter taking Battle Master at 3rd is offered their first three
  maneuvers in the same pass.
- **Creation** — on the class step. In practice only the ranger's two lists ever
  appear, since every other group starts at class level 3; `buildCharacter`
  re-filters through `newOptionPicksAt(className, 1, …)` so a pick left behind by
  switching class mid-wizard can't leak onto the sheet.

`applyLevelUp` de-duplicates against what the character already knows, so
re-running a level-up can't double an entry.

## Save DCs (`SaveEffect`)

Non-spell DCs live in one shared shape, `SaveEffect` in `src/lib/types.ts`,
hung off two places: `LimitedUseAbility.save?` (a monk's Ki DC, a Battle
Master's maneuver DC) and `Attack.save?` (a save-based attack — see below).
Both are optional, so no migration was needed.

- **`dc` is a `CustomFormula`, never a number** — so it re-derives on a
  level-up or an ASI instead of going stale. `saveDcFormula(stat)` in
  `rules.ts` builds the 5e 8 + PB + ability, and accepts a _list_ of abilities
  for the "your choice of STR or DEX" rules (it takes the best). Spellcasting's
  seeded `saveDcOverride` now goes through the same builder.
- **`stat` (the ability the target rolls) is separate from the DC's source
  ability, and optional.** A monk's Ki DC comes off WIS while Stunning Strike
  calls for a CON save; one pool backs several features with different saves,
  so "varies" is a real state, rendered as a bare "DC 15".
- `formatSaveEffect` / `describeSaveEffect` (in `formula.ts`, not `rules.ts` —
  which can't import it without a cycle) are the two render forms: the table
  chip and the prose sentence.

The builder grants DCs alongside pools: `ClassPoolDef.save` / `RACE_POOLS[].save`
in `class-pools.ts` cover **Ki**, **Superiority Dice** (maneuver DC), and the
draconic **Breath Weapon**. Unlike `maxUses` these need no re-derivation (the
formula does that), so sync only _backfills_ a DC onto a pool that predates
them — a hand-edited one is left alone.

### Save-based attacks

`Attack.bonus` is now optional: an attack resolves either as a to-hit roll or as
a save, and the editor's "Resolved by" select clears the other side when you
switch. The sheet **never rolls the save** — that's the DM's roll on the other
side of the table. It shows the DC, and the damage result reports both outcomes
("Failed save: 12 — Successful save: 6") so the halving isn't done by hand. See
[`rolling.md`](./rolling.md) for the dialog.

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

### Flat `bonus` riders and the two conditional shapes

A `bonus` rider is a flat addition. Where it lands depends on the roll kind, and
the split matters:

- **d20 rolls fold it into the _modifier_, not the total.** `applyTotalRiders`
  floors at 0 (correct for damage/healing/hit dice), which would be wrong for a
  check — so `CheckControls` adds the bonus to the modifier before rolling, and
  the displayed `d20 +N` reflects it.
- **Damage/healing totals** go through `applyTotalRiders`, which folds only the
  **unconditional** bonuses. An `optional` one needs the player to say yes,
  which is a dialog decision, so it's excluded from the silent fold —
  `flatBonusRiders` splits them for exactly this.

The two numeric fighting styles show the two shapes a conditional bonus takes,
and which to reach for:

| Style   | Modelled as               | Why                                                                                     |
| ------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Archery | `bonus`, `optional`       | It's a to-hit bonus, and the sheet can't tell a ranged weapon from a thrown melee one   |
| Dueling | `extraDamage`, `optional` | It's damage; that section already offers opt-in, and a flat amount stays flat on a crit |

Both are opt-in rather than always-on for the same reason Sneak Attack is: the
eligibility is a weapon property the sheet doesn't model. (Defense and Great
Weapon Fighting stay auto-applied — the former folds +1 into `acFormula` at
grant time, the latter is an unconditional reroll rider.)

### `extraDamage`: the one contextual rider

`extraDamage` (Sneak Attack, Rage damage, Divine Smite, Divine Strike, Dueling,
Foe Slayer) is the exception to "a rider is a silent fold." It carries a whole damage
expression (`amount: CustomFormula` + optional `damageType` — omit to mean "the
weapon's type", shown as its own untyped line), and its application depends on
context the fold helpers don't have, so the **roll dialog interprets it
directly** rather than `applyTotalRiders`. Three fields drive that:

- **`declareAt`** (`before-attack` | `on-hit` | `after-damage`) — the step at
  which the player commits. It's a field of its own, not folded into the
  condition, because it drives dialog sequencing and crit inflation (`on-hit`
  dice ride along with the crit, a `before-attack` flat bonus would not) while
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
damage +2/+3/+4, Divine Strike 1d8/2d8 — baked from class level at collection
time (the die _count_ is
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

**Divine Strike — subclass-dependent damage type.** The only rider whose data
depends on the _subclass_: a cleric's domain sets the type (Life radiant,
Tempest thunder, …), so `DIVINE_STRIKE_TYPES` in `catalog.ts` maps domain →
type. Two domains map to `type: null`, meaning "leave it untyped" — War matches
the weapon's own type, Nature is a per-attack player choice — which is exactly
what omitting `damageType` already does. Domains that get Potent Spellcasting
instead (Knowledge, Light, Grave, Peace, Arcana) are simply absent from the map,
so nothing is offered.

**Foe Slayer — the same bonus on either side of the attack.** Ranger 20 adds WIS
to _either_ the attack roll or the damage roll. It's the one feature that grants
two riders for one choice: an opt-in `bonus` on `attack` and an opt-in
`extraDamage` on `damage`. Both are opt-in and the note says "not both" — the
sheet can't tell which one the player is spending.

### Why Martial Arts _isn't_ a rider

The monk's Martial Arts die **substitutes** the damage die of unarmed strikes
and monk weapons rather than adding to it. Every rider kind adds a second
expression; a "replace the weapon's die" kind would mean the roll dialog
rewriting an attack's stored formula, which nothing else does.

What a monk actually lacked was the attack itself — the sheet carried the prose
but no Unarmed Strike to roll. So `syncMartialArts` (`class-features.ts`) grants
one and re-derives its die (d4 → d6 at 5th → d8 at 11th → d10 at 17th) on every
level-up, the same shape as `syncClassPools` and with the same trade-off: **the
table is authoritative**, so a hand-edited Unarmed Strike is overwritten next
level. Its ability is `max(STR, DEX)`, which is what "you may use DEX" always
resolves to in practice.

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
