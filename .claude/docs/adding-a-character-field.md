# Checklist: adding a field to the `Character` model

The `Character` type touches several coupled systems. Miss one of these and you
get a type error, a failed schema check, an unmigrated old save, or a field that
can't be edited. Do them together.

1. **Type** — add the property to `Character` in `src/lib/types.ts`. Define any
   new sub-types/interfaces there too, and a `is*` typeguard alongside the others
   if other code needs to validate the shape at runtime.

2. **Domain enums** — new closed value sets (e.g. `RestType`) go in
   `src/lib/data/data-definitions.ts`, not `types.ts` (which imports from it).
   For "preset values but allow custom", mirror `ClassName = OfficialClass |
string` — a `Enum | string` union gives autocomplete while accepting anything.

3. **`FIELD` enum** (`data-definitions.ts`) — add the key if it's a top-level,
   editable field.

4. **Editor wiring** (only if the field is user-editable) — see
   `editable-fields-and-modals.md`: add `STANDARD_EDITABLE_FIELD_TYPES[field]`,
   extend `FieldTypeNode` for a new editor kind, and add the `useEffect` branch +
   `switch` case in `charsheet.tsx`. Mount a display component (usually in
   `character-info-panel.tsx` / `defence-and-equipment-panel.tsx` / `spellcasting.tsx`).

5. **Default data** (`src/lib/data/default-data.ts`) — give `defaultCharacter` a
   value (required fields must be present). Export a `new*()` factory if the UI
   adds blank list entries.

6. **Schema** — run `pnpm generate-schema` (regenerates `src/schema.json` from
   the type via `typescript-json-schema … --required`, so **every field is
   required**). `pnpm run schema:check` fails CI if it's stale. The schema is what
   `validateCharacterData` (`src/lib/fields.ts`) checks loaded characters against.

7. **Migration** (`src/lib/migrations/`) — because the schema makes the new field
   required, **old saved characters will fail validation without a migration.**
   - Append a new entry to `migrations` in `migrate-character.ts` (migrations are
     **pure and append-only — never edit a shipped one**) that backfills the field
     when absent and stamps the new `schemaVersion`.
   - Bump `CURRENT_SCHEMA_VERSION` in `migrations/version.ts` by one.
   - `migrate-character.test.ts` round-trips the default character and a truncated
     save through `validateCharacterData`; it'll catch a missed migration.

8. **Fixtures** (optional) — `src/lib/fixtures/*.json` are old-shaped saves run
   through `hydrateCharacter` by `fixtures.test.ts`; the migration keeps them
   valid. Add the field to a fixture only if you want it exercised in a
   `pnpm screenshot --fixture …` view.

Verify with `pnpm run ci` (lint + type-check + test). For UI, see the
`ui-iteration-loop` note in the agent memory.
