import { describe, expect, it } from "vitest";
import martialFighter from "src/lib/fixtures/martial-fighter.json";
import { Character } from "src/lib/types";
import { FIELD } from "src/lib/data/data-definitions";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import reducer from "./reducer";
import {
  invertAction,
  isNavigationAction,
  loadPersistedCharacter,
  replaceCharacter,
  resetCharacter,
  updateData,
} from "./actions";

// Applying an edit then its inverse should leave the character untouched —
// the guarantee undo/redo relies on.
describe("invertAction round-trips through the reducer", () => {
  const original = () =>
    JSON.parse(JSON.stringify(martialFighter)) as Character;

  const cases: { name: string; action: ReturnType<typeof updateData> }[] = [
    {
      name: "scalar field",
      action: updateData(FIELD.name, { value: "Renamed" }),
    },
    {
      name: "nested array leaf via subField",
      action: updateData(FIELD.attacks, { value: "Longsword" }, "0.name"),
    },
    {
      name: "whole-array replacement",
      action: updateData(FIELD.attacks, { value: [] }),
    },
    {
      name: "nested object leaf via subField",
      action: updateData(
        FIELD.proficiencies,
        { value: true },
        "skills.Acrobatics",
      ),
    },
  ];

  for (const { name, action } of cases) {
    it(name, () => {
      const start = original();
      const inverse = invertAction(start, action);
      const edited = reducer(start, action);
      expect(edited).not.toEqual(start);
      const restored = reducer(edited, inverse);
      expect(restored).toEqual(original());
    });
  }
});

describe("replace_character round-trips (level-up undo)", () => {
  it("one inverse replace restores the pre-level-up character", () => {
    const start = JSON.parse(JSON.stringify(martialFighter)) as Character;
    const leveled = applyLevelUp(start, {
      ...defaultLevelUpState(start),
      className: "Fighter",
    });

    const forward = replaceCharacter(leveled);
    const inverse = replaceCharacter(start);

    const edited = reducer(start, forward);
    expect(edited).not.toEqual(start);
    expect(edited).toEqual(leveled);

    const restored = reducer(edited, inverse);
    expect(restored).toEqual(start);
  });
});

// Navigation actions stay off the sync transports; real edits (including a
// whole-character replace_character from a rest/level-up) still travel.
describe("isNavigationAction", () => {
  it("excludes the two actions that change which character is open", () => {
    expect(isNavigationAction(loadPersistedCharacter({} as Character))).toBe(
      true,
    );
    expect(isNavigationAction(resetCharacter())).toBe(true);
  });

  it("lets real edits through", () => {
    expect(isNavigationAction(updateData(FIELD.name, { value: "Vex" }))).toBe(
      false,
    );
    expect(isNavigationAction(replaceCharacter({} as Character))).toBe(false);
  });
});
