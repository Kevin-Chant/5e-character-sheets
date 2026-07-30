# Ability mechanics: riders and effects (`src/lib/mechanics/`)

The serializable layer that describes what abilities _do_ at the table, built
on the same design rule as `CustomFormula`: a **closed set of interpretable
kinds, an open set of data compositions**. No functions are ever stored —
mechanics are plain data, so they survive Drive persistence, live-sync replay,
and undo, and homebrew can eventually author them like catalog content.

## The files

| File            | Role                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`      | Re-exports the data model + `ACTION_COST_LABELS`. **The types themselves live in `src/lib/types.ts`** — the character model embeds them (`LimitedUseAbility.mechanics`), and types.ts can't import from here |
| `riders.ts`     | Roll-time interpreter: `ridersFor` collects, `adjustDieRoll`/`applyTotalRiders` apply                                                                                                                        |
| `conditions.ts` | Which riders apply to _this_ attack: `attackContext` reads the weapon, `applicableRiders` filters, `needsOptIn` decides prompt-vs-automatic                                                                  |
| `resolve.ts`    | Write-side interpreter: `actionBlocked` gates, `resolveEffects` emits reducer updates                                                                                                                        |
| `catalog.ts`    | Bundled mechanics for well-known features, keyed by normalized title (plus `RACE_MECHANICS`); `mechanicsForAbility` resolves ability → mechanics                                                             |
| `authoring.ts`  | Homebrew editor helpers: the `SimpleAmount` codec, `deriveChoose`, effect factories                                                                                                                          |

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

**A group belongs to a class _or_ to a race**, never both. `race` (Simic
Hybrid's Animal Enhancement) reads its `known` thresholds as **total character
levels** rather than class levels — which is why race picks go through their own
`newRaceOptionPicksAt` / `applyRaceOptions` rather than riding on
`applyClassLevel`: folding them in would re-award the pick on every multiclass
dip. `raceOptionFeaturesFor` puts each pick's summary in the features list, so a
racial adaptation reads as the feature it is. A two-tier racial choice is **two
groups with different lists**, not one group with a growing count — that's what
Simic's 1st- and 5th-level menus actually are.

**Fighting styles and eldritch invocations deliberately stay in `features`.**
Rider matching keys off feature titles, so moving them would silently unhook
Great Weapon Fighting, Archery, and Dueling. `ridersFor` _does_ also scan chosen
options by name against the same title-keyed catalog, so an option that later
gains mechanics works without being moved — and the field isn't inert.

Licensing note: Metamagic and Pact Boon are SRD (base-class features); the Battle
Master is **not**, so its maneuver summaries are original paraphrases of
mechanical facts only, per the rule in `nonsrd-classes.ts`.

Both wizards prompt for them, through one shared `ChosenOptionPicker`
(`builder-pickers.tsx`) that offers only what's _new_ — options already known
from an earlier level are filtered out, and the boxes lock once the level's
allowance is spent:

- **Level-up** — folded into the "Level choices" step, alongside fighting styles
  and invocations. `newOptionPicksAt(className, level, subclass)` gives the delta
  for the level. The subclass is read from the _pending_ choice first, so a
  fighter taking Battle Master at 3rd is offered their first three maneuvers in
  the same pass. Race groups are appended from `grants.raceOptionPicks`.
- **Creation** — class groups on the class step, race groups on the race step.
  In practice only the ranger's two lists and Simic's first enhancement ever
  appear, since every other group starts at class level 3; `buildCharacter`
  re-filters through `newOptionPicksAt(className, 1, …)` so a pick left behind by
  switching class mid-wizard can't leak onto the sheet.

**`tagged` makes a level's picks cover several kinds.** A Kensei's 3rd-level
pair is one melee weapon and one ranged one, not any two — so each `OptionDef`
carries a `tag`, and the group names the level whose picks must cover each tag
once. The picker then renders one labelled single-choice per tag instead of a
capped checkbox list, which enforces the split by construction rather than by
validating after the fact. The constraint belongs to a _level_: the Kensei's
extra weapons at 6th/11th/17th are unrestricted, and go through the plain
picker.

`applyLevelUp` de-duplicates against what the character already knows, so
re-running a level-up can't double an entry.

**A sub-choice can gate content, not just record a pick.** Two `OptionGroup`
fields turn a pick into grants: `resistances` (Draconic Ancestry → a damage
resistance) and, on each `OptionDef`, `spellIndices` — `always` spells granted
the moment it's picked, `byLevel` ones unlocking as the owning class levels.
This is what makes a **nested subclass sub-choice** drive spells: a Land druid's
`landTerrain` pick sets its circle spells (two at each of 3rd/5th/7th/9th).
`optionSpellIndicesAt` returns what a character's picks are due at a class level
(only picks whose group belongs to that class, so a druid's terrain isn't read
while leveling a warlock dip); step 9b of `applyClassLevel` grants them through
the idempotent `addSrdSpellOnce`, so re-running a level can't stack duplicates.
Spells absent from the bundled SRD are skipped, exactly as `grants.spellIndices`
does — the prose feature still names them.

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

### Weapon conditions: `requires` and the three-valued answer

Every rider may carry `requires: RiderCondition` — the weapon shape it applies
to, in terms of `AttackTag`s (`melee`, `ranged`, `thrown`, `finesse`, `heavy`,
`two-handed`, …) and the ability the to-hit roll uses. `Attack.tags` supplies the
weapon half; `buildAttackFromPreset` seeds it from the SRD catalog (melee/ranged
from the weapon's group, `thrown` from a melee weapon having a range, `finesse`
from its ability, `two-handed` from the versatile _(2H)_ variant), a v11
migration backfills existing sheets by weapon name, and the attack editor offers
the tags as chips for hand-authored entries.

`conditionEligibility` answers **`yes` / `no` / `unknown`**, and the third value
is the whole design:

- **`no`** — the rider is dropped entirely (`applicableRiders`). A longbow's roll
  dialog shouldn't mention Rage; a greatsword's shouldn't mention Sneak Attack.
- **`yes`** — the sheet can see the condition holds, so it applies _silently_.
  This is what turned Archery from a checkbox you ticked on every bow shot into
  a +2 that's simply there.
- **`unknown`** — the attack carries no tags (every hand-authored one, and
  everything predating the field), so the rider falls back to an opt-in
  checkbox. **Absent tags mean "unknown", never "none"**, which is what makes
  this backwards-compatible by construction: an untagged attack behaves exactly
  as the sheet did before conditions existed.

A decidable `no` beats any number of unknowns, so a rider is still hidden when
one clause is settled against it and another is ambiguous.

`optional` now means something narrower and orthogonal: **a condition that isn't
about the weapon at all**, and so can never become decidable — "while raging",
"against a favored enemy", "with no other weapon held". `needsOptIn` is the
union of the two: an explicit `optional`, or an `unknown` weapon condition.

Rage is the clearest case of the split. Its weapon half (`melee`, Strength) is
`requires`, so it never appears on a bow; _whether you are raging_ is `optional`,
because active conditions are deliberately not modelled (see the
non-goals in the project notes) — the sheet tracks Rage's uses, not its state.
Reckless Attack keeps its advisory `advantage` note for the same reason, but the
note now only shows up on attacks it could actually apply to.

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

| Style   | Modelled as                            | Why                                                                                     |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| Archery | `bonus` + `requires: {tags:[ranged]}`  | It's a to-hit bonus, and the weapon's tags settle it                                    |
| Dueling | `extraDamage`, `optional` + `requires` | It's damage; a flat amount stays flat on a crit, and "no other weapon held" stays yours |

Archery is the case that motivated `requires`: it _was_ opt-in only because the
sheet couldn't tell a ranged weapon from a thrown melee one, and now it can.
Dueling keeps its tick because tags rule out the two-handed case but not the
"no other weapon held" one. (Defense folds +1 into `acFormula` at grant time;
Great Weapon Fighting is a reroll rider now gated on a two-handed melee weapon
rather than applying to every damage roll.)

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

**Fire Rune — the pool-powered variant.** `slot`'s sibling: a `uses: {pool}`
block means the extra damage costs a use of a named limited-use ability. It's the
answer to a whole family of features whose trigger _is_ the hit — a Rune Knight's
Fire Rune, a ranger's Favored Foe, a Whispers bard's Psychic Blades — which were
all modelled as `spendRollRemind` actions at first and so made you roll their
dice in the abilities panel, next to a button, disconnected from the attack that
caused them. As a rider the dice come out with the weapon's, and the use is spent
by an **explicit button** for the same reason the smite's slot is: rolling stays
re-rollable, and a feature whose use survives the hit (Favored Foe's mark lasts a
minute) simply isn't charged again on later turns. Two consequences worth knowing:
a `uses` rider is **always** `optIn`, whatever the weapon's tags settle — spending
a resource is the player's word, never the sheet's — and it's disabled with the
pool at zero rather than hidden, so the reason it's unavailable stays visible.
`pool` is matched the way `spendUses`' is, so it can name a **different** ability
(Psychic Blades drains Bardic Inspiration), and `usesPoolState` returns
`undefined` for a pool that isn't on the sheet rather than a silent 0.

Which shape a pool-backed feature wants:

| The feature…                        | Home                                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| happens on your turn (Second Wind)  | an `AbilityAction` on its pool                                    |
| happens on _your_ weapon hit        | an `extraDamage` rider with `uses`                                |
| is triggered by someone else's roll | an action — there's no dialog of yours to ride (Deflect Missiles) |

A rider that scales with level still needs baking from an integer: a pool's own
`mechanics(klass)` does it when the pool owns the feature (Fire Rune, Favored
Foe), and `classDamageRiders` does it when nothing owns it — Psychic Blades lives
there because it holds no charges of its own and is gated on a _subclass_, the
same reason Divine Strike does (and because the Soulknife rogue has a feature by
the same name that works nothing like it, so the title-keyed map is out).

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

### Cross-pool spend: `spendUses`/`restoreUses` with a `pool`

`spendUses`/`restoreUses` default to the owning ability's pool, but an optional
`pool?: string` names a **different** ability by title to drain — a Lore bard's
Cutting Words spends Bardic Inspiration, a monk discipline spends Ki. The host
feature owns no charges of its own: it's a `maxUses: 0` limited-use ability, an
_action host_, which `limited-use-abilities-display` renders as its action(s)
alone (no counter, recharge label, or reset). `spendsSharedPool` (catalog)
builds one; the builder grants it as a `SUBCLASS_POOLS` entry with
`maxUses: () => 0` and prunes the feature's prose row so it isn't shown twice.
`resolveEffects` tracks `expended` per pool index, so one action touching two
pools composes; a `pool` that isn't on the sheet is reported by name, not
silently drained. `class-pools.test.ts` asserts every `maxUses: 0` host's action
really does name a pool to spend.

## Spell-damage riders (`spellDamage`)

The mirror of `extraDamage` for the spell side. `extraDamage` is gated to weapon
attacks by design, and `RollKind` can't tell a cantrip from a leveled spell from
healing — so a plain `bonus` would wrongly buff Cure Wounds. `spellDamage`
carries a flat `value`, a `scope` (`cantrip` / `leveled` / `any`) the roll
dialog matches to the actual cast, and an `optional` flag for what the sheet
can't see (a spell's school, its damage type, once-per-turn). Its own collector
`spellDamageRiders` keeps it strictly apart from `extraDamageRiders`, so a spell
bonus never touches a weapon and vice versa; `spellExtrasForCast` re-expresses
each as an on-hit `extraDamage` entry so it renders and resolves through the
identical path (a checkbox for opt-in, a "+N — source" result line). A flat
value has no dice, so it doesn't inflate on a crit. Catalog entries by title:
Potent Spellcasting (+WIS cantrips, auto), Empowered Evocation (+INT, opt-in),
Radiant Soul, Elemental Affinity, Alchemical Savant, Arcane Firearm (+1d8, dice).

## Subclasses grant through two shapes

A subclass confers content two ways, and the difference is purely _when_:

- **`grants`** (`data/subclasses.ts`) fires **once**, at the level the subclass
  is chosen — the builder at level 1 for cleric/sorcerer/warlock, the level-up
  wizard at 2 for druid/wizard and 3 for everyone else. It is the only shape
  that can grant proficiencies and always-prepared `spellIndices`.
- **`levelFeatures`** (`SrdSubclass.levelFeatures`, class level → features)
  fires at **each** level the subclass gives something. Prose only.

`levelFeatures` exists because `grants` firing once was a real hole, not a
stylistic one: a Berserker got Frenzy at 3rd and then nothing at 6th, 10th or
14th, and there was nowhere to put those features at all. Step 2a of
`applyClassLevel` applies the level's entry, de-duplicated by title against
what the character already has — which is what lets a choice-level feature
live in either shape without appearing twice.

The tables live in **`src/lib/data/subclass-features/`, one file per class**
(they dwarf the catalog entries), merged by `index.ts` and attached in
`forClass`. Prefer `levelFeatures` for any feature prose, including at the
choice level: it keeps a subclass's whole progression in one place.

`builder/subclass-features.test.ts` guards the join — the tables are keyed by
subclass _name_, so a typo grants nothing and fails silently. It asserts every
key resolves to a real subclass, that each table reaches the catalog, and that
no title is already granted by `CLASS_FEATURES`, a pool, or that subclass's own
`grants` (the de-dup net exists, but the data shouldn't need it).

**Prose is not automation, and that's deliberate.** A feature the engine can't
model still gets a row stating its real numbers — the player sees it, the sheet
just doesn't roll it. That trade is why the catalog can be complete long before
the mechanics layer is.

## The builder grants the features

Beyond pools, the wizards grant: per-level class-feature prose
(`builder/class-features.ts` `CLASS_FEATURES` — Extra Attack, Divine Smite,
Aura of Protection, …; pool-backed features stay out to avoid doubling),
per-level **subclass** prose (see below),
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
attached block wins over the catalog fallback.
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
