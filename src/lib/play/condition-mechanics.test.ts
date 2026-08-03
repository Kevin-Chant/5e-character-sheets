import { describe, expect, it } from "vitest";
import {
  conditionRiders,
  conditionSummary,
} from "src/lib/play/condition-mechanics";

describe("condition mechanics", () => {
  it("gives Bless's d4 to attacks and checks, as an opt-in", () => {
    for (const kind of ["attack", "check"] as const) {
      const [bless] = conditionRiders(["Bless"], kind);
      expect(bless.source).toBe("Bless");
      expect(bless.rider).toMatchObject({
        rider: "bonusDice",
        count: 1,
        die: "d4",
        optional: true,
      });
    }
  });

  it("keeps Guidance off attack rolls", () => {
    expect(conditionRiders(["Guidance"], "check")).toHaveLength(1);
    expect(conditionRiders(["Guidance"], "attack")).toHaveLength(0);
  });

  it("knows nothing it wasn't taught — unknown and advisory-only names", () => {
    expect(conditionRiders(["Poisoned", "Homebrew Hex"], "check")).toEqual([]);
    // Advisory-only entries still carry a summary for banners.
    expect(conditionSummary("Hideous Laughter")).toMatch(/prone/i);
  });
});
