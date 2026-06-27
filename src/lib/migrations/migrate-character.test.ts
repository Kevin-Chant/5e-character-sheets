import { describe, expect, it } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { validateCharacterData } from "src/lib/utils";
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from "./migrate-character";
import { hydrateCharacter } from "./hydrate-character";

describe("migrateCharacter", () => {
  it("upgrades a pre-versioning (v0) character to a schema-valid current one", () => {
    // A character from before schemaVersion existed: strip the field entirely.
    const { schemaVersion: _omit, ...v0 } = structuredClone(defaultCharacter);
    void _omit;

    const migrated = migrateCharacter(v0);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const [valid, errors] = validateCharacterData(migrated);
    expect(errors).toBeFalsy();
    expect(valid).toBe(true);
  });

  it("backfills missing required fields on a truncated but character-shaped save", () => {
    const truncated = {
      uuid: "11111111-1111-1111-1111-111111111111",
      name: "Truncated Tim",
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    };

    const [valid] = validateCharacterData(migrateCharacter(truncated));
    expect(valid).toBe(true);
  });

  it("is a no-op for a character already at the current version", () => {
    const current = structuredClone(defaultCharacter);
    expect(migrateCharacter(current)).toEqual(current);
  });
});

describe("hydrateCharacter", () => {
  it("accepts the default character without reporting a migration", () => {
    const result = hydrateCharacter(structuredClone(defaultCharacter));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(false);
  });

  it("reports migrated=true when an old character is upgraded", () => {
    const { schemaVersion: _omit, ...v0 } = structuredClone(defaultCharacter);
    void _omit;
    const result = hydrateCharacter(v0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(true);
  });

  it.each([null, undefined, 42, "nonsense", {}, { uuid: 123 }])(
    "returns ok:false (never throws) on garbage input %o",
    (garbage) => {
      const result = hydrateCharacter(garbage);
      expect(result.ok).toBe(false);
    },
  );
});
