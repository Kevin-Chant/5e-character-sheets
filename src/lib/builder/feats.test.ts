import { describe, expect, it } from "vitest";
import { StatKey } from "src/lib/data/data-definitions";
import { FEATS, getFeat } from "src/lib/builder/feats";

const STATS = new Set(Object.values(StatKey));

describe("feat catalog", () => {
  it("looks feats up by index", () => {
    expect(getFeat("lucky")?.name).toBe("Lucky");
    expect(getFeat("resilient")?.abilityIncrease?.by).toBe(1);
    expect(getFeat("nope")).toBeUndefined();
  });

  it("has unique indices", () => {
    const indices = FEATS.map((f) => f.index);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("every ability-increase targets real, non-empty stats", () => {
    for (const feat of FEATS) {
      if (!feat.abilityIncrease) continue;
      expect(feat.abilityIncrease.from.length, feat.name).toBeGreaterThan(0);
      for (const stat of feat.abilityIncrease.from)
        expect(STATS, `${feat.name} / ${stat}`).toContain(stat);
    }
  });
});
