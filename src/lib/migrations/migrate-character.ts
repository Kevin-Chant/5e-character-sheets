import { defaultCharacter } from "src/lib/data/default-data";
import { CURRENT_SCHEMA_VERSION } from "./version";

// A migration upgrades a plain character object from version `to - 1` to `to`.
// Migrations are PURE and APPEND-ONLY: never edit a shipped migration, only add
// the next one. Characters predating versioning have no `schemaVersion` and are
// treated as version 0.
interface Migration {
  to: number;
  migrate: (character: any) => any;
}

const migrations: Migration[] = [
  {
    // Baseline: stamp the version and backfill any top-level field that the
    // current code assumes exists but very old / truncated saves may lack.
    // Only fills keys that are absent (existing values, including falsy ones
    // like currHp: 0, are preserved), and only for objects that actually look
    // like a character — so a wrong/garbage file isn't silently turned into a
    // default character but is left to fail validation instead.
    to: 1,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled: any = { ...character };
      const looksLikeCharacter =
        typeof filled.uuid === "string" && typeof filled.name === "string";
      if (looksLikeCharacter) {
        for (const [key, value] of Object.entries(defaultCharacter)) {
          if (filled[key] === undefined) filled[key] = value;
        }
      }
      filled.schemaVersion = 1;
      return filled;
    },
  },
  {
    // Limited-use abilities (Sorcery Points, racial once-per-rest features, …)
    // are now a first-class list. Characters from before this didn't track them,
    // so start them with an empty list.
    to: 2,
    migrate: (character) => {
      if (!character || typeof character !== "object") return character;
      const filled = { ...character };
      if (filled.limitedUseAbilities === undefined)
        filled.limitedUseAbilities = [];
      filled.schemaVersion = 2;
      return filled;
    },
  },
];

// Sorted, append-only safety: ensures we apply migrations in ascending order
// regardless of array order.
const orderedMigrations = [...migrations].sort((a, b) => a.to - b.to);

export function migrateCharacter(raw: any): any {
  const fromVersion =
    typeof raw?.schemaVersion === "number" ? raw.schemaVersion : 0;
  let character = raw;
  for (const { to, migrate } of orderedMigrations) {
    if (to > fromVersion) character = migrate(character);
  }
  return character;
}

export { CURRENT_SCHEMA_VERSION };
