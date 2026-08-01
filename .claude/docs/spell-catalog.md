# The spell catalog

Spells follow the same "official content is easy, homebrew is customizable"
principle as weapon attacks — but there are far too many spells to hand-author
like `WEAPON_PRESETS`. Instead the whole SRD catalog is **fetched at build time
and bundled**, so the app ships every SRD spell and makes _zero_ network
requests at runtime (works offline, no CORS/rate-limit/uptime exposure). This is
the spell analog of the weapon-preset flow in `src/lib/rules.ts`.

## The pipeline

```
scripts/generate-spells.mjs   ──(build time, rarely run)──▶  src/lib/data/srd-spells.json
   (D&D 5e API, SRD-only)                                         (committed snapshot)
                                                                        │
                             src/lib/spells/spell-catalog.ts  ◀────────────┘
                             (CatalogSpell type, search/lookup)
                                        │
                             src/lib/spells/spell-adapter.ts
                             (buildSpellFromCatalog → editable Spell)
                                        │
                             src/components/add-spell-from-catalog.tsx
                             (picker, opened from SpellList "Browse Spells")
```

### 1. Generation — `scripts/generate-spells.mjs` (`pnpm generate-spells`)

Walks every spell in the [D&D 5e API](https://www.dnd5eapi.co/) (SRD 5.1,
open-license) and flattens each into the compact `CatalogSpell` shape, writing
`src/lib/data/srd-spells.json` (~319 spells, committed). Re-run to refresh.

- **REST, not GraphQL, on purpose.** The GraphQL schema declares
  `damage_at_slot_level` non-nullable but returns `null` for cantrips, which
  intermittently 500s the whole batch. The REST detail endpoint returns the
  damage tables as plain nullable JSON, so per-spell fetches (bounded
  concurrency, a build-time step) are the reliable path.
- **Only display-oriented fields are kept** so the bundle stays small. Notably,
  the lowest entry of a spell's scaling table is stored as `baseDamage` (e.g.
  Fireball's `"8d6"`); higher-level scaling is left in the `higherLevel` prose.
  See [`spell-scaling.md`](./spell-scaling.md) for why we don't yet model the
  full scaling table structurally.

### 2. Lookup — `src/lib/spells/spell-catalog.ts`

Imports the JSON (typed as `CatalogSpell[]`), folds in the hand-authored
non-SRD spells as `ALL_SPELLS`, and exposes `getCatalogSpell(index)` and
`searchCatalogSpells(query, className?)` (prefix-ranked, optionally
class-filtered) over that combined list.

### 3. Adapter — `src/lib/spells/spell-adapter.ts`

`buildSpellFromCatalog(entry, spellcastingClass)` maps a `CatalogSpell` into an editable
`Spell`, mirroring `buildAttackFromPreset`. The one non-obvious piece:
`parseDamageRoll("8d6")` → a `DieExpression` `[8, d6, roll]` that fills a `{{}}`
slot in the spell's detail via `detailFormulas`, exactly like weapon damage —
so a looked-up spell shows a **live** base-damage roll that recomputes with the
character. Everything stays editable; homebrew is just a hand-edited `Spell`.

The **school** lands in the structured `Spell.school` field (`MagicSchool |
string`, so homebrew traditions fit) rather than the description prose, where it
used to be rendered as a `_Evocation_` line. `SpellList` shows it as a one- or
two-letter badge (Enchantment/Evocation share an initial, so both take two) with
the full name on hover. Spells saved before the field existed simply have no
school and no badge — it's optional, so nothing needed migrating.

### 4. Picker — `src/components/add-spell-from-catalog.tsx`

Routed like the weapon picker: `SpellList`'s "Browse Spells" button targets
`FIELD.spells` with sub-path `<levelKey>.new`; `charsheet.tsx` maps the `.new`
suffix on a `spell` field to the `selectSpell` modal type. The picker searches
the catalog filtered to that level, then appends the built spell and
`replaceTargetedField`s straight into its editor — so backing out without saving
discards it (same trick as `AddAttack`).

Results are also **restricted to spells one of the character's official
spellcasting classes can cast** (`officialSpellcastingClasses` ∩ the spell's
`classes`) — a pure Sorcerer won't see Cure Wounds. A character with only custom
(non-official) spellcasting classes isn't restricted, since their lists are
unknown. When multiclassing, a class dropdown narrows further to one class.

(Separately, the spell list only shows the "prepared" toggle for spells whose
class is a `isPreparedCaster` — prepared casters choose daily; known casters like
Sorcerer/Bard don't prepare.)

## Non-SRD spells (`src/lib/data/nonsrd-spells/`)

The catalog is no longer SRD-only. The ~165 official non-SRD spells
(PHB/XGE/TCE/…) are **hand-authored** in `src/lib/data/nonsrd-spells/part*.ts`
(one file per authoring partition, merged by `index.ts`), then folded into
`ALL_SPELLS` by `spell-catalog.ts` — so `getCatalogSpell` resolves them by index and
the picker lists them, exactly like SRD spells. Total catalog: ~483 spells.

**Why hand-authored, not generated:** the SRD is open-license, so `srd-spells.json`
can carry the API's verbatim `desc`. Non-SRD spell text is **copyrighted**, so
these files carry only **mechanical facts** (level, school, timing, range,
duration, components, save/attack, damage dice + type, area, class lists — all
uncopyrightable data) plus a `desc` that is an **original paraphrase written
from scratch**, never the published prose. Same rule as `nonsrd-races.ts` /
`subclasses.ts`, and the reason they live apart from the SRD JSON. Unearthed
Arcana (beta) is excluded. `nonsrd-spells.test.ts` guards index/slug, required
facts, and class names.

These carry **no structured `mechanics` block yet** (the roll-dialog scaling) —
a follow-up. `buildSpellFromCatalog` still turns their `baseDamage` into a live
base-damage formula, so a granted non-SRD damage spell shows its base roll.

## What this does _not_ cover

- **Structured rolling for non-SRD spells.** They surface with facts + a live
  base-damage roll, but not the `mechanics` scaling block the SRD spells carry.
- **Scaling in the _detail prose_.** The detail line still shows only the base
  roll as a live formula. The full slot/character scaling _is_ now modelled
  structurally in `mechanics` (populated by `buildMechanics`), but no UI consumes
  it yet — see [`spell-scaling.md`](./spell-scaling.md).
