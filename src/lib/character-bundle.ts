import { hydrateCharacter } from "src/lib/migrations/hydrate-character";
import { Character } from "src/lib/types";

// A backup of more than one character.
//
// The app's export has always been one character to one `.5echarsheet` file,
// which is the right shape for handing a sheet to a friend and the wrong one
// for "back up my account before I try something". Rather than invent a second
// import path for it, the bundle is a superset the *existing* file import
// understands: `parseCharacterFile` takes either shape, so a backup restores
// through the same dialog a single sheet does.
//
// `kind` and `version` are here so a future format change can be detected
// rather than guessed at from the shape — the one thing the single-character
// format's lack of a header has always made awkward.

export const BUNDLE_KIND = "5e-character-bundle";
export const BUNDLE_VERSION = 1;

export interface CharacterBundle {
  kind: typeof BUNDLE_KIND;
  version: number;
  exportedAt: string;
  characters: Character[];
}

export function buildCharacterBundle(
  characters: Character[],
  exportedAt: string,
): CharacterBundle {
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt,
    characters,
  };
}

function isBundle(raw: unknown): raw is { characters: unknown[] } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { kind?: unknown }).kind === BUNDLE_KIND &&
    Array.isArray((raw as { characters?: unknown }).characters)
  );
}

export interface ParsedCharacterFile {
  characters: Character[];
  // Per-character failures, by position. A bundle where one sheet is corrupt
  // should still restore the other nineteen, and say which one it dropped —
  // an all-or-nothing import of a backup is the least useful moment to be
  // strict.
  errors: string[];
}

// Reads either a single exported character or a bundle of them.
export function parseCharacterFile(raw: unknown): ParsedCharacterFile {
  const entries = isBundle(raw) ? raw.characters : [raw];
  const characters: Character[] = [];
  const errors: string[] = [];
  entries.forEach((entry, index) => {
    const result = hydrateCharacter(entry);
    if (result.ok) {
      characters.push(result.character);
    } else {
      const name = (entry as { name?: unknown })?.name;
      const detail =
        result.errors
          ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
          .join("; ") ?? "not a valid character sheet";
      errors.push(
        `${typeof name === "string" && name ? name : `Entry ${index + 1}`}: ${detail}`,
      );
    }
  });
  return { characters, errors };
}

export function bundleFileName(exportedAt: string): string {
  // Date only: a backup taken twice in one day is a rare enough collision that
  // a timestamp in the filename costs more legibility than it buys.
  return `5e-characters-${exportedAt.slice(0, 10)}.5echarbundle`;
}

export function downloadCharacterBundle(
  characters: Character[],
  exportedAt: string,
) {
  const bundle = buildCharacterBundle(characters, exportedAt);
  const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.download = bundleFileName(exportedAt);
  anchor.href = window.URL.createObjectURL(blob);
  anchor.click();
  anchor.remove();
}
