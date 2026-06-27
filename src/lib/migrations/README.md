# Character schema migrations

Character JSON lives in the user's browser, Google Drive, or a peer's live
session — there is no backend to run a one-shot migration. Instead every path
that loads stored/untrusted JSON funnels through `hydrateCharacter`, which
migrates the object up to the current schema version and then validates it.

## How to evolve the `Character` type

1. Make the change to `Character` in `src/lib/types.ts` and update
   `default-data.ts` if needed.
2. Bump `CURRENT_SCHEMA_VERSION` in `version.ts` by one.
3. Add **one** new entry to the `migrations` array in `migrate-character.ts`
   with `to` set to the new version and a pure `(character) => character`
   transform that upgrades the previous shape to the new one.
4. Run `pnpm generate-schema` to refresh `src/schema.json`, then `pnpm test`.

## Rules

- Migrations are **append-only and pure**. Never edit or reorder a shipped
  migration — old data in the wild was written against it. Only add the next.
- Characters predating versioning have no `schemaVersion`; they are treated as
  version `0`.
- A migration must produce an object that passes the current schema validation.
  The test suite enforces this against fixtures.
