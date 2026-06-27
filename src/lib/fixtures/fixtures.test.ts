import { describe, expect, it } from "vitest";
import { hydrateCharacter } from "src/lib/migrations/hydrate-character";

// Every fixture must survive the real load path (migrate + schema validation),
// so a change to the Character model can't silently leave a fixture broken.
const fixtures = import.meta.glob("./*.json", { eager: true });

describe("character fixtures", () => {
  it("finds the committed fixtures", () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });

  for (const [path, mod] of Object.entries(fixtures)) {
    const name = path.replace(/^\.\/|\.json$/g, "");
    it(`${name} hydrates cleanly`, () => {
      const result = hydrateCharacter((mod as { default: unknown }).default);
      if (!result.ok) {
        throw new Error(
          `${name} failed validation:\n` +
            JSON.stringify(result.errors, null, 2),
        );
      }
      expect(result.ok).toBe(true);
    });
  }
});
