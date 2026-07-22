# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (pinned via `packageManager`). Node 22+.

- `pnpm dev` — Vite dev server on http://localhost:3000.
- `pnpm server` — live-edit WAMP sidecar (default port 9000; override with `PORT`). Only needed for real-time sharing; local/Drive storage work without it.
- `pnpm build` — runs `generate-schema` + `type-check` + `vite build` (output `dist/`).
- `pnpm type-check` — `tsc --noEmit`.
- `pnpm lint` (auto-fix) / `pnpm lint:ci` (check only, `--max-warnings 0`). `pnpm lint` accepts optional path args to lint a subset — e.g. `pnpm lint src/lib/rules.ts src/components/build-custom-formula` — defaulting to the whole repo when given none.
- `pnpm pretty` — Prettier write.
- `pnpm test` — Vitest run. Single file: `pnpm test src/lib/utils.test.ts`. By name: `pnpm exec vitest run -t "ordinal"`.
- `pnpm run ci` — lint + type-check + test (what GitHub Actions runs). **Note:** must be `pnpm run ci`; bare `pnpm ci` hits a reserved pnpm command and fails.
- `pnpm generate-schema` — regenerates `src/schema.json` from the `Character` type. Run after changing the character model (also runs in `build`).
- `pnpm screenshot` — render a route/fixture to a PNG for visual iteration. **Invoke via `pnpm screenshot` (not `node scripts/...`) and always pass `--out` to your scratchpad** to avoid permission prompts and stray repo PNGs — see [`.claude/docs/screenshotting.md`](.claude/docs/screenshotting.md) (covers the fixtures, flags, and the `#detail`-scroll gotcha).

Full local dev is two processes: `pnpm dev` + `pnpm server`.

## Architecture

A **client-side React 18 + TypeScript SPA** (Vite). There is **no backend database and no accounts** — character data lives only in the browser, the user's Google Drive, or a peer's live session. The Node sidecar (`server/server.js`) is a stateless WAMP message broker, not a data store.

### Storage: the `Datastore` abstraction (`src/datastores/`, interface in `src/lib/types.ts`)

Pluggable backends implementing `Datastore`:

- `local-datastore` — browser `localStorage`.
- `google-drive-datastore` — private chars in Drive `appDataFolder` (filename = uuid) **plus** promoted first-class `*.5echar` docs in My Drive (tagged with `appProperties` markers, see `SHARED_*` in `src/lib/google-drive.ts`). Supports optional `promoteCharacter`/`shareCharacter`/`isShared`.

The active backend is held in `DatastoreSelectorContext` and can be `undefined` (e.g. when joining a remote session — joiners have no local store). `google-drive.ts` holds the raw gapi/REST primitives; the datastore orchestrates caching and promotion.

**Consuming datastores in the UI** — go through the `useDatastore()` hook (`src/lib/hooks/use-datastore.tsx`), not the raw `Datastore` object: it exposes a _reactive_ `characters` list, `characterLoading`, and wrappers like `createCharacter()`/`save()`/`deleteCharacter()` that keep that list in sync. Calling `datastore.listEntriesInDatastore()` directly gives a one-shot snapshot that won't update on create/delete. Two distinct "new character" paths exist: `createCharacter()` **persists** immediately (preferred), while `loadFullCharacter(defaultCharacter)` only loads an unsaved in-memory default. `characterLoading` wraps both the create flow and the initial async list fetch, so guard empty states on it to avoid flashing "no characters" while a backend (e.g. Drive) loads.

**Storage selection is two surfaces, both auto-skippable**: the home page (`src/routes/home.tsx`) picks the _backend_, the character picker (`src/components/character-picker.tsx`, rendered by `sheet-container.tsx` when a datastore is selected but no character is open) picks the _character_. The last-used backend is persisted via `src/lib/last-datastore.ts` so `home.tsx` auto-redirects returning users straight to their sheets — pass `location.state.picker` (the nav Home button does) to force the picker instead.

### Live editing: a sync _overlay_, not a datastore (`src/lib/hooks/use-sharing-session.tsx`)

Real-time co-editing runs over WAMP (autobahn-browser client ↔ nightlife-rabbit broker). It is independent of where the character is persisted. Key design points that are easy to get wrong:

- **Connections are kept in refs, not React state**, so they can be read synchronously right after creation. `SharingSessionsContext` also holds a uuid→`{connection, role}` map.
- **Broadcasting is centralized** in `SharingSessionsContext.broadcast(uuid, …)`, keyed by character uuid, so both host and joiner publish over the same connection (bidirectional editing). `CharacterContext` calls it from `dispatchAndBroadcast`.
- **Self-echo is filtered by a per-tab `clientId`** stamped on every message — nightlife-rabbit does **not** honor WAMP `exclude_me`, so publishers receive their own events. Incoming edits are applied with `suppressBroadcast` to avoid loops.
- **Roles**: `host` opens the realm + registers the `FULL_SYNC` RPC (backed by a ref so it always serves the _current_ character); `remote` (joiner) calls `FULL_SYNC` and uses `connection.onclose` as the reliable teardown signal. A `remote` character is **not persisted locally** (the host owns it) — see the role check in `CharacterContext`'s lazy-save.

[`.claude/docs/live-editing-and-presence.md`](.claude/docs/live-editing-and-presence.md) is the deep dive: the two message layers (edit `DISPATCH` sync + best-effort `PRESENCE`/`LEAVE` roster with heartbeats and per-user field highlights) and the role-asymmetric teardown.

### Character model (`src/lib/types.ts`, `src/lib/data/`)

The `Character` type plus 5e data definitions and a recursive **formula engine** for computed fields (AC, HP, attacks). The former grab-bag `src/lib/utils.ts` is split by concern: `src/lib/formula.ts` (the `calculate*`/`format*` engine + `OPERATORS`), `src/lib/rules.ts` (5e domain tables — stat mods, PB, hit dice, spell slots, spellcasting), `src/lib/fields.ts` (dot-path `traverse`/`get`/`setFieldValue` + schema validation), and `src/lib/browser.ts` (secure-context polyfills); `utils.ts` now holds only `ordinal`/`formatClass`. The `is*` type guards live in `src/lib/types.ts`. These pure functions are the main unit-tested surface; Drive/WAMP code is gapi/network-bound and verified manually in-browser (or with throwaway node scripts against a local nightlife-rabbit server).

**Adding or editing a field on the `Character` model** touches several coupled systems (type, `FIELD`/editor registries, default data, generated schema, migration). Two deep-dive docs cover the non-obvious wiring — read them before such changes:

- [`.claude/docs/adding-a-character-field.md`](.claude/docs/adding-a-character-field.md) — the end-to-end checklist (type → schema → migration → UI).
- [`.claude/docs/editable-fields-and-modals.md`](.claude/docs/editable-fields-and-modals.md) — how the targeted-field stack + `ModalContainer` draft buffer turn a field into an editable modal.

The computed-field system has its own deep dive: [`.claude/docs/formula-engine.md`](.claude/docs/formula-engine.md) — the recursive `CustomFormula` model and the two passes (`calculate*` folds to a number, `format*` renders prose), read it before touching `formula.ts` or adding a computed value.

**Spells** get their official content the same way weapons do, but bundled rather than hand-authored: the full SRD catalog is fetched at build time (`pnpm generate-spells`) into `src/lib/data/srd-spells.json` and surfaced through a "Browse SRD" picker — see [`.claude/docs/srd-spell-catalog.md`](.claude/docs/srd-spell-catalog.md). Structural spell **damage scaling** (upcast/cantrip tiers) is modelled by an optional `Spell.mechanics` block plus a pure `spellDamageAtLevel` expander that keeps the formula engine untouched — see [`.claude/docs/spell-scaling.md`](.claude/docs/spell-scaling.md). The one engine addition is the `spellMod` `AtomicVariable` leaf (a class's live spellcasting modifier).

**Rolling dice in play** goes through a reusable `RollButton` + a roll dialog that is deliberately _separate_ from the edit modal (rolling is play-mode and read-only) — and a random `src/lib/roll.ts` evaluator kept apart from the deterministic engine. See [`.claude/docs/rolling.md`](.claude/docs/rolling.md).

**Ability mechanics** — what features _do_ at the table — are serializable data in `src/lib/mechanics/`: roll **riders** (Durable's minimum, rerolls, crit range) and resource **actions** with action-economy costs (Second Wind, Font of Magic, Lay on Hands), interpreted into ordinary reducer updates so they sync/undo like edits. Adding mechanics for a known feature is a `catalog.ts` entry, not a component. See [`.claude/docs/ability-mechanics.md`](.claude/docs/ability-mechanics.md).

**Races / classes / subclasses** for the guided builder are bundled catalog data under `src/lib/data/`, consumed via `src/lib/builder/srd-races.ts` / `srd-classes.ts` / `subclasses.ts`:

- `srd-races.json` + `srd-classes.json` are **frozen** snapshots of the open-license 2014 SRD — edit the JSON directly (the old `generate-races`/`generate-classes` scripts were retired; only `generate-spells` remains, since the 319-spell set still benefits from regeneration).
- Official content beyond the SRD is **hand-authored** in `nonsrd-races.ts`, `phb-subraces.ts` (extra subraces), `nonsrd-classes.ts` (Artificer), and `subclasses.ts`, then merged into the SRD lists at load time. Keep these files separate from the SRD JSON: SRD prose may be verbatim (open license) but **non-SRD content must store only mechanical facts with original paraphrased summaries** — never published prose. Subclass `grants` apply when the subclass is _chosen_ — at level 1 for cleric/sorcerer/warlock, at the choice level (druid/wizard 2, the rest 3) via the level-up wizard for everyone else. Subclass _pools_ (superiority dice, Healing Light) live in `builder/class-pools.ts` `SUBCLASS_POOLS` instead, so sizes re-derive each level.

### State management

React Context + reducers (no Redux). Providers are **deeply nested in `src/index.tsx` and the order matters** — `SharingSessions` sits above `Datastore`/`Character` so broadcast/role state is reachable. Main contexts: `Settings`, `SharingSessions`, `GoogleOauth`, `DatastoreSelector`, `Datastore`, `Character`.

All character edits funnel through one reducer + the `dispatchAndBroadcast` wrapper. [`.claude/docs/character-state-and-edits.md`](.claude/docs/character-state-and-edits.md) explains the write-path: why `update_*` actions carry a field's _whole_ value (which is what makes undo/redo and live-sync replay fall out for free) and the flags that keep local edits, replays, and remote echoes from looping.

## Configuration

All config is optional with built-in defaults. Browser-exposed values use the `VITE_` prefix (required by Vite to reach client code; these ship to the browser and are not secrets):

- `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_API_KEY` — Google OAuth client + API key (scopes: `drive.appdata` + `drive.file`).
- `VITE_LIVE_EDIT_HOST` — default sidecar URL.
- `PORT` — sidecar port (Node-side, no prefix).

The in-app Settings page persists overrides (e.g. `liveEditHost`) to `localStorage`, and **stored settings take precedence over env/code defaults** — a stale stored host can make the app talk to the wrong sidecar even after changing `.env`.

## Conventions

- Absolute imports use the `src/*` alias (configured in `vite.config.ts` and `tsconfig.json`).
- ESLint 9 flat config (`eslint.config.mjs`) + Prettier; husky + lint-staged run on commit. `react-hooks/exhaustive-deps` is off.
- `autobahn-browser` ships no types — import with `// @ts-expect-error` and treat connections as the local `Connection = any` alias.
- Changing the `Character` type requires regenerating `src/schema.json` (`pnpm generate-schema`).
