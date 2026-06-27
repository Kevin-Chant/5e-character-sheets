import { describe, expect, it } from "vitest";
import martialFighter from "src/lib/fixtures/martial-fighter.json";
import { Character } from "src/lib/types";
import { FIELD } from "src/lib/data/data-definitions";
import reducer from "./reducer";
import { invertAction, updateData } from "./actions";

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
