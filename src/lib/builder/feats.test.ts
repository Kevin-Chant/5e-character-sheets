import { describe, expect, it } from "vitest";
import { OfficialClass, StatKey } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { calculateCustomFormula } from "src/lib/formula";
import { getHpFormula } from "src/lib/rules";
import { applyFeat, FEATS, getFeat } from "src/lib/builder/feats";

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

describe("Tough", () => {
  it("raises max HP by 2 per level, and keeps doing so as you level", () => {
    const c = structuredClone(defaultCharacter);
    const id = randomUUID();
    c.class = [{ id, name: OfficialClass.Fighter, level: 5 }];
    c.features = [];
    c.stats.con = 10;
    const before = calculateCustomFormula(getHpFormula(c), c);

    applyFeat(c, getFeat("tough")!, {
      featSkillChoices: [],
      featExpertiseChoices: [],
      featWeaponChoices: [],
      featLanguageChoices: [],
      featSpellChoices: {},
    });

    expect(calculateCustomFormula(getHpFormula(c), c)).toBe(before + 10);
    c.class[0].level = 6;
    expect(calculateCustomFormula(getHpFormula(c), c)).toBe(before + 12 + 6);
  });
});

describe("Linguist", () => {
  it("adds the three chosen languages without disturbing the ones you had", () => {
    const c = structuredClone(defaultCharacter);
    c.otherProficiencies.languages = ["Common", "Elvish"];

    applyFeat(c, getFeat("linguist")!, {
      featSkillChoices: [],
      featExpertiseChoices: [],
      featWeaponChoices: [],
      featLanguageChoices: ["Draconic", "Elvish", "Infernal"],
      featSpellChoices: {},
    });

    // Elvish was already known — added once, not twice.
    expect(c.otherProficiencies.languages).toEqual([
      "Common",
      "Elvish",
      "Draconic",
      "Infernal",
    ]);
    expect(getFeat("linguist")?.grants?.chooseLanguages).toBe(3);
  });
});
