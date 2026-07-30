// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { UUID } from "crypto";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import CharacterPicker from "src/components/character-picker";
import { defaultCharacter } from "src/lib/data/default-data";
import { DatastoreContext } from "src/lib/hooks/use-datastore";
import { Character } from "src/lib/types";

function makeCharacter(uuid: string, name: string): Character {
  return { ...structuredClone(defaultCharacter), uuid: uuid as UUID, name };
}

// The picker is a plain consumer of the datastore context; the other contexts
// it touches (character, sharing sessions, builder) all have benign defaults.
function renderPicker({
  characters,
  unsynced = new Set<UUID>(),
  characterLoading = false,
}: {
  characters: Character[];
  unsynced?: Set<UUID>;
  characterLoading?: boolean;
}) {
  render(
    <DatastoreContext.Provider
      value={
        {
          characters,
          unsynced,
          characterLoading,
          save: vi.fn(),
        } as never
      }
    >
      <CharacterPicker />
    </DatastoreContext.Provider>,
  );
}

describe("CharacterPicker", () => {
  it("marks an unsynced entry, and only that entry", () => {
    const saved = makeCharacter("1-1-1-1-1", "Saved");
    const staged = makeCharacter("2-2-2-2-2", "Staged");
    renderPicker({
      characters: [saved, staged],
      unsynced: new Set([staged.uuid]),
    });

    // Both cards render — a staged character is fully usable — but only the
    // staged one carries the "still saving" badge.
    expect(screen.getByText("Saved")).toBeTruthy();
    const badges = screen.getAllByTitle(
      "Still saving to storage — the sheet is safe to open",
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("button")?.textContent).toContain("Staged");
  });

  it("shows no badge when everything is synced", () => {
    renderPicker({ characters: [makeCharacter("1-1-1-1-1", "Saved")] });
    expect(
      screen.queryByTitle(
        "Still saving to storage — the sheet is safe to open",
      ),
    ).toBeNull();
  });
});
