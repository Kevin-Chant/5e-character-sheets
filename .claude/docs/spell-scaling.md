# Spell damage scaling

> Status: **implemented** (type model, expansion engine, SRD importer, tests),
> and now consumed by the play-mode roll dialog — which is where the "cast at
> level N" selector lives (see [`rolling.md`](./rolling.md)). The remaining gap is
> _editing_: no field editor exposes `mechanics` for hand-authoring yet; it's
> populated by the importer. This doc explains how 5e scaling works and how the
> model describes it.
>
> `mechanics` is an **optional** field on `Spell`, so no migration/version bump
> was needed (old data validates unchanged); the schema was regenerated so the
> new optional shape is allowed.

## The problem

Weapon damage is one static formula, so it maps cleanly onto a single
`CustomFormula`. Spell damage isn't: it **scales with the level the spell is cast
at**, and the formula engine has no conditionals or table lookups, so a scaling
spell can't be one live formula. Today the SRD importer surfaces only the _base_
roll as a live formula and leaves the scaling as prose (`higherLevel`).

## How 5e actually scales a spell

Two drivers, and three things that can grow:

| Driver        | Applies to     | "Level" that drives it                                    |
| ------------- | -------------- | --------------------------------------------------------- |
| **Slot**      | leveled spells | the slot level spent, measured from the spell's own level |
| **Character** | cantrips       | total character level, at the fixed tiers **5 / 11 / 17** |

What grows per step:

- **Damage/healing dice** — Fireball `+1d6` per slot above 3rd; Cure Wounds
  `+1d8` per slot above 1st; Fire Bolt `+1d10` at each cantrip tier.
- **Rolled instances** (targets/beams/rays) — Magic Missile `+1` dart per slot
  above 1st; Scorching Ray `+1` ray per slot above 2nd; Eldritch Blast `+1` beam
  at each cantrip tier.
- **A non-uniform step** — Spiritual Weapon `+1d8` per _two_ slot levels above
  2nd.

The unifying formula: `steps` increments are added to the base, where

```
slot driver:      steps = max(0, floor((castLevel - baseLevel) / perLevels))
character driver: steps = count of [5, 11, 17] that are <= characterLevel   // 0..3
```

## Where it lives

- **Types** — `SpellMod`, `SpellDamageComponent`, `SpellScaling`,
  `SpellResolution`, `SpellMechanics` in `src/lib/types.ts`; `mechanics?` on
  `Spell`.
- **Expansion** — `src/lib/spells/spell-scaling.ts`: `spellDamageAtLevel`,
  `spellInstancesAtLevel`, `scalingSteps`. Pure; no engine change.
- **`spellMod` leaf** — resolved in both engine passes in `src/lib/formula.ts`
  via `spellcastingAbilityFor` (`src/lib/rules.ts`).
- **Importer** — `scripts/generate-spells.mjs` `buildMechanics` infers a compact
  rule (or exact `damageTable`) from the SRD damage table; ~56 of 319 spells get
  mechanics (33 rule-based, the rest table/base-only). The rest have no
  structured damage and stay prose.
- **Tests** — `spell-scaling.test.ts` (expansion + `spellMod`) and an end-to-end
  case in `srd-spell-adapter.test.ts` (bundled Fireball → 10d6 at slot 5).

## Types (`src/lib/types.ts`)

A single optional `mechanics` block on `Spell`. Optional so the hand-typed,
text-only spells that dominate real use need nothing, and migration is a no-op
(absent = today's behavior).

```ts
export interface SpellDamageComponent {
  damageType: DamageType;
  formula: CustomFormula; // amount at the relevant level (reuses the engine)
}

export interface SpellScaling {
  driver: "slot" | "character";
  // Slot driver only: one increment per this many levels above base (1, or 2
  // for Spiritual Weapon). Ignored for the character driver (tiers are the
  // 5e-standard 5/11/17).
  perLevels?: number;
  damage?: SpellDamageComponent[]; // extra dice per step
  healing?: CustomFormula; // extra healing per step
  instances?: number; // extra rolled instances per step
}

export interface SpellMechanics {
  level: number; // base level; 0 = cantrip
  // How it resolves against a target — drives to-hit vs save DC display.
  resolution:
    | { kind: "attack"; range: "melee" | "ranged" }
    | { kind: "save"; ability: StatKey; halfOnSuccess?: boolean }
    | { kind: "auto" }; // Magic Missile, utility
  damage?: SpellDamageComponent[]; // base effect at `level`
  healing?: CustomFormula;
  instances?: number; // base count (Magic Missile = 3, Scorching Ray = 3)
  scaling?: SpellScaling;
}

export interface Spell {
  // …existing fields…
  mechanics?: SpellMechanics;
}
```

## The expansion function (keeps the engine untouched)

The point of storing the _rule_ as data is that we never teach the engine about
scaling. A pure helper expands the rule to an ordinary `CustomFormula` for a
chosen cast level, and the existing `calculate*`/`format*` take it from there:

```ts
// src/lib/spells/spell-scaling.ts
function spellDamageAtLevel(
  m: SpellMechanics,
  castLevel: number, // slot level, or character level for cantrips
): CustomFormulaWithDamage;
```

For each damage component it builds `base + steps * increment`. When base and
increment are the same die `[c, die, op]` this collapses to `[c + steps*inc, die,
op]` (a clean count bump); mixed dice fall back to an `addition` node. Either way
the result is a plain `CustomFormula` the engine already evaluates and formats.

The spell editor then offers a "cast at level N" control (or a compact
level→damage table), and the sheet can show `base (+Xd_ per slot)`.

## What this covers — and what it deliberately doesn't

**Covers** essentially all official _linear_ scaling: dice, healing, and
instance growth on both drivers, including non-uniform `perLevels`, plus the
attack-vs-save distinction.

**Escape hatches / out of scope** (leave as prose, or a later addition):

- **Conditional dice** — Toll the Dead (1d8 vs 1d12 by target HP). Needs a
  condition the engine can't express.
- **Table / non-linear scaling** — Summon spells and the like. If needed, add an
  explicit `damageTable?: Record<number, SpellDamageComponent[]>` override that
  `spellDamageAtLevel` prefers over the computed rule; the SRD importer already
  has the exact table to populate it.
- **Non-damage growth** — duration/range/area increases on upcast.

## Decisions taken

1. **Compact rule primary, `damageTable` as escape hatch.** Authoring stays easy
   and the importer emits the exact table only for the rare non-linear spell.
2. **A `spellMod` `AtomicVariable` leaf** (over resolving the `StatKey` at
   expansion time), so `1d8 + spellMod` tracks a later ability-override edit —
   the same "reuse `CustomFormula`" principle as the rest of the sheet. The leaf
   is a tagged object (`{ spellMod: ClassName }`), not a string, because
   `isClassName` accepts any string and would misread a sentinel as a class.

## Healing

Healing is populated by the importer too, and it's cleaner than damage: SRD's
`heal_at_slot_level` encodes the caster modifier as an explicit `MOD` token
(`"1d8 + MOD"`), so no prose-parsing is needed. `buildMechanics` parses dice
(+ optional mod) or a flat amount (Heal: `"70"`), emitting `mechanics.healing`
plus a per-slot `scaling.healing` increment. `spellHealingAtLevel` expands it the
same way damage does; the roll dialog shows a "Roll Healing" button and an HP
result.

The `MOD` becomes a `spellMod` leaf, but the caster's class isn't known at import
time — so the generator writes a `{ spellMod: "@caster" }` placeholder and
`buildSpellFromSrd` **stamps** it with the real spellcasting class when the spell
is added (`stampCaster`).

> One correctness note: `combine` scales a dice increment by its **count**
> (`steps × N` dice), never `steps × oneRoll`. This matters once a real roll is
> involved — Cure Wounds upcast to 3rd rolls three separate d8s, not one d8
> doubled. Same-die scaling still collapses to a single count bump.

## Not yet done

- **Editing UI.** The roll dialog _reads_ `mechanics` (with a cast-level
  selector), but no field editor lets you author or tweak it by hand — the SRD
  importer is the only writer today.
- **Instances from the importer.** Dart/ray/beam counts aren't in the SRD damage
  tables, so `instances` is modelled and tested but not auto-populated.
