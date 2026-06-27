import { beforeEach, describe, expect, it } from "vitest";
import type { UUID } from "crypto";
import LocalDatastore from "./local-datastore";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";

// The datastore migrates/validates on read, so tests use full valid characters.
function makeCharacter(uuid: string, name: string): Character {
  return { ...structuredClone(defaultCharacter), uuid: uuid as UUID, name };
}

describe("LocalDatastore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a character through save and load", async () => {
    const character = makeCharacter(
      "11111111-1111-1111-1111-111111111111",
      "Gandalf",
    );
    await LocalDatastore.saveToDatastore(character);

    const loaded = await LocalDatastore.loadFromDatastore(character.uuid);
    expect(loaded).toEqual(character);
  });

  it("returns undefined for an unknown uuid", async () => {
    const loaded = await LocalDatastore.loadFromDatastore(
      "99999999-9999-9999-9999-999999999999" as UUID,
    );
    expect(loaded).toBeUndefined();
  });

  it("lists all saved characters", async () => {
    await LocalDatastore.saveToDatastore(
      makeCharacter("11111111-1111-1111-1111-111111111111", "Gandalf"),
    );
    await LocalDatastore.saveToDatastore(
      makeCharacter("22222222-2222-2222-2222-222222222222", "Frodo"),
    );

    const names = LocalDatastore.listEntriesInDatastore()
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(["Frodo", "Gandalf"]);
  });

  it("deletes a character", async () => {
    const character = makeCharacter(
      "11111111-1111-1111-1111-111111111111",
      "Gandalf",
    );
    await LocalDatastore.saveToDatastore(character);

    LocalDatastore.deleteFromDatastore(character.uuid);

    expect(LocalDatastore.listEntriesInDatastore()).toHaveLength(0);
    expect(
      await LocalDatastore.loadFromDatastore(character.uuid),
    ).toBeUndefined();
  });
});
