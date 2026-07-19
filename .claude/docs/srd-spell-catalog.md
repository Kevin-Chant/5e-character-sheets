# The SRD spell catalog

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
                             src/lib/spells/srd-spells.ts  ◀────────────┘
                             (SrdSpell type, search/lookup)
                                        │
                             src/lib/spells/srd-spell-adapter.ts
                             (buildSpellFromSrd → editable Spell)
                                        │
                             src/components/add-spell-from-srd.tsx
                             (picker, opened from SpellList "Browse SRD")
```

### 1. Generation — `scripts/generate-spells.mjs` (`pnpm generate-spells`)

Walks every spell in the [D&D 5e API](https://www.dnd5eapi.co/) (SRD 5.1,
open-license) and flattens each into the compact `SrdSpell` shape, writing
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

### 2. Lookup — `src/lib/spells/srd-spells.ts`

Imports the JSON (typed as `SrdSpell[]`), exposes `getSrdSpell(index)`,
`searchSrdSpells(query, className?)` (prefix-ranked, optionally class-filtered),
and `spellSubFieldForLevel(level)` mapping a numeric level to the
`character.spells` sub-path (`"cantrips"` / a `SpellLevel`).

### 3. Adapter — `src/lib/spells/srd-spell-adapter.ts`

`buildSpellFromSrd(srd, spellcastingClass)` maps an `SrdSpell` into an editable
`Spell`, mirroring `buildAttackFromPreset`. The one non-obvious piece:
`parseDamageRoll("8d6")` → a `DieExpression` `[8, d6, roll]` that fills a `{{}}`
slot in the spell's detail via `detailFormulas`, exactly like weapon damage —
so a looked-up spell shows a **live** base-damage roll that recomputes with the
character. Everything stays editable; homebrew is just a hand-edited `Spell`.

### 4. Picker — `src/components/add-spell-from-srd.tsx`

Routed like the weapon picker: `SpellList`'s "Browse SRD" button targets
`FIELD.spells` with sub-path `<levelKey>.new`; `charsheet.tsx` maps the `.new`
suffix on a `spell` field to the `selectSpell` modal type. The picker searches
the catalog filtered to that level, then appends the built spell and
`replaceTargetedField`s straight into its editor — so backing out without saving
discards it (same trick as `AddAttack`).

Results are also **restricted to spells one of the character's official
spellcasting classes can cast** (`officialSpellcastingClasses` ∩ the SRD spell's
`classes`) — a pure Sorcerer won't see Cure Wounds. A character with only custom
(non-official) spellcasting classes isn't restricted, since their lists are
unknown. When multiclassing, a class dropdown narrows further to one class.

(Separately, the spell list only shows the "prepared" toggle for spells whose
class is a `isPreparedCaster` — prepared casters choose daily; known casters like
Sorcerer/Bard don't prepare.)

## What this does _not_ cover

- **Non-SRD spells.** SRD 5.1 only (~319). That's a licensing feature, not just
  a limit — everything bundled is safe to redistribute. Broader coverage would
  mean a different source (e.g. Open5e) with per-document license filtering.
- **Scaling in the _detail prose_.** The detail line still shows only the base
  roll as a live formula. The full slot/character scaling _is_ now modelled
  structurally in `mechanics` (populated by `buildMechanics`), but no UI consumes
  it yet — see [`spell-scaling.md`](./spell-scaling.md).
