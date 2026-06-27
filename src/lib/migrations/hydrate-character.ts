import { Character } from "src/lib/types";
import { validateCharacterData } from "src/lib/fields";
import { migrateCharacter } from "./migrate-character";

export type HydrateResult =
  | { ok: true; character: Character; migrated: boolean }
  | { ok: false; errors: ReturnType<typeof validateCharacterData>[1] };

// The single entry point for turning untrusted/stored JSON into a usable
// Character: migrate to the current schema version, then validate. Never throws
// — callers branch on `ok`. `migrated` reports whether the version changed, so
// owned datastores can persist the upgrade back (write-on-read).
export function hydrateCharacter(raw: unknown): HydrateResult {
  const before =
    typeof (raw as any)?.schemaVersion === "number"
      ? (raw as any).schemaVersion
      : 0;
  const character = migrateCharacter(raw);
  const [valid, errors] = validateCharacterData(character);
  if (!valid) return { ok: false, errors };
  return {
    ok: true,
    character: character as Character,
    migrated: character.schemaVersion !== before,
  };
}
