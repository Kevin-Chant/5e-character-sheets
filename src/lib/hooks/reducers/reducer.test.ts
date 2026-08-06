import { describe, expect, it } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import reducer from "./reducer";
import { loadPersistedCharacter, replaceCharacter } from "./actions";

describe("reducer", () => {
  // Loads and replaces must deep-copy: the payload is routinely an entry in a
  // datastore cache, and sharing nested objects with it means a later in-place
  // mutation of the open character would corrupt the cached copy.
  it("load_character deep-copies the payload", () => {
    const payload = structuredClone(defaultCharacter) as Character;
    const loaded = reducer(undefined, loadPersistedCharacter(payload))!;
    expect(loaded).toEqual(payload);
    expect(loaded).not.toBe(payload);
    expect(loaded.stats).not.toBe(payload.stats);
    expect(loaded.attacks).not.toBe(payload.attacks);
    loaded.stats.str = 20;
    expect(payload.stats.str).not.toBe(20);
  });

  it("replace_character deep-copies the payload", () => {
    const payload = structuredClone(defaultCharacter) as Character;
    const replaced = reducer(payload, replaceCharacter(payload))!;
    expect(replaced).toEqual(payload);
    expect(replaced.spells).not.toBe(payload.spells);
  });
});
