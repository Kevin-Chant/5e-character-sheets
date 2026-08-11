import { describe, expect, it } from "vitest";
import {
  CONDITION_NAMES,
  CONDITION_ROLL_EFFECTS,
  conditionRollNotes,
} from "src/lib/play/conditions";

describe("condition roll notes", () => {
  it("surfaces a note on the roll kind it applies to", () => {
    expect(conditionRollNotes(["Poisoned"], "attack")).toEqual([
      "Poisoned: Attack rolls and ability checks have disadvantage.",
    ]);
    expect(conditionRollNotes(["Poisoned"], "check")).toHaveLength(1);
  });

  it("says nothing on a roll kind it doesn't touch", () => {
    expect(conditionRollNotes(["Blinded"], "damage")).toEqual([]);
    expect(conditionRollNotes(["Blinded"], "check")).toEqual([]);
  });

  it("ignores a condition with no roll consequence", () => {
    expect(conditionRollNotes(["Deafened"], "attack")).toEqual([]);
  });

  it("ignores a homebrew condition it has never heard of", () => {
    expect(conditionRollNotes(["Waterlogged"], "attack")).toEqual([]);
  });

  it("collects every applicable note when several are held", () => {
    expect(conditionRollNotes(["Poisoned", "Prone"], "attack")).toHaveLength(2);
  });

  it("keys every effect to a real condition and ends each note as a sentence", () => {
    Object.entries(CONDITION_ROLL_EFFECTS).forEach(([name, effect]) => {
      expect(CONDITION_NAMES).toContain(name);
      expect(effect?.note.endsWith(".")).toBe(true);
      expect(effect?.appliesTo.length).toBeGreaterThan(0);
    });
  });
});
