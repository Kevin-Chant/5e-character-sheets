import { describe, expect, it } from "vitest";
import {
  BUNDLE_KIND,
  buildCharacterBundle,
  bundleFileName,
  parseCharacterFile,
} from "src/lib/character-bundle";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";

const character = (name: string): Character => ({
  ...structuredClone(defaultCharacter),
  name,
});

describe("parseCharacterFile", () => {
  it("reads a single exported character, the shape that predates bundles", () => {
    const { characters, errors } = parseCharacterFile(character("Ari"));
    expect(errors).toEqual([]);
    expect(characters.map((c) => c.name)).toEqual(["Ari"]);
  });

  it("reads a bundle of several", () => {
    const bundle = buildCharacterBundle(
      [character("Ari"), character("Ellora")],
      "2026-08-04T10:00:00.000Z",
    );
    const { characters, errors } = parseCharacterFile(bundle);
    expect(errors).toEqual([]);
    expect(characters.map((c) => c.name)).toEqual(["Ari", "Ellora"]);
  });

  it("round-trips through JSON, which is how it actually travels", () => {
    const bundle = buildCharacterBundle(
      [character("Ari")],
      "2026-08-04T10:00:00.000Z",
    );
    const { characters } = parseCharacterFile(
      JSON.parse(JSON.stringify(bundle)),
    );
    expect(characters[0].name).toBe("Ari");
  });

  it("keeps the readable characters when one entry is corrupt", () => {
    const bundle = {
      kind: BUNDLE_KIND,
      version: 1,
      exportedAt: "2026-08-04T10:00:00.000Z",
      characters: [character("Ari"), { name: "Broken", nonsense: true }],
    };
    const { characters, errors } = parseCharacterFile(bundle);
    expect(characters.map((c) => c.name)).toEqual(["Ari"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Broken");
  });

  it("reports nothing readable rather than throwing on junk", () => {
    const { characters, errors } = parseCharacterFile({ hello: "world" });
    expect(characters).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("treats an array without the bundle header as a single (invalid) entry", () => {
    const { characters } = parseCharacterFile([character("Ari")]);
    expect(characters).toEqual([]);
  });
});

describe("bundleFileName", () => {
  it("names the file for the day it was taken", () => {
    expect(bundleFileName("2026-08-04T10:00:00.000Z")).toBe(
      "5e-characters-2026-08-04.5echarbundle",
    );
  });
});
