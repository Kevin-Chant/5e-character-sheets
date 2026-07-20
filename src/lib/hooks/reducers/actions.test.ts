import { describe, expect, it } from "vitest";
import martialFighter from "src/lib/fixtures/martial-fighter.json";
import { Character } from "src/lib/types";
import { FIELD } from "src/lib/data/data-definitions";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import reducer from "./reducer";
import { invertAction, replaceCharacter, updateData } from "./actions";

// Applying an edit then its inverse should leave the character untouched.
// This is the guarantee undo/redo relies on.
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

// A level-up is applied as a single recorded `replace_character` edit; its
// inverse (built in the dispatch wrapper) is a `replace_character` carrying the
// pre-level-up character. One undo must restore the sheet exactly.
describe("replace_character round-trips (level-up undo)", () => {
  it("one inverse replace restores the pre-level-up character", () => {
    const start = JSON.parse(JSON.stringify(martialFighter)) as Character;
    const leveled = applyLevelUp(start, {
      ...defaultLevelUpState(start),
      className: "Fighter",
    });

    // Forward: apply the level-up. Inverse: replace with the prior character,
    // exactly as the hook records it from the live character ref.
    const forward = replaceCharacter(leveled);
    const inverse = replaceCharacter(start);

    const edited = reducer(start, forward);
    expect(edited).not.toEqual(start);
    expect(edited).toEqual(leveled);

    const restored = reducer(edited, inverse);
    expect(restored).toEqual(start);
  });
});
