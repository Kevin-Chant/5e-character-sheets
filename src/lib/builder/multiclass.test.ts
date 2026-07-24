import { describe, expect, it } from "vitest";
import { OfficialClass, SkillName } from "src/lib/data/data-definitions";
import {
  multiclassProficienciesFor,
  multiclassSkillOptions,
  multiclassToolOptions,
} from "src/lib/builder/multiclass";

describe("multiclass proficiency table", () => {
  it("grants nothing for the two classes that grant nothing", () => {
    for (const c of [OfficialClass.Sorcerer, OfficialClass.Wizard]) {
      const g = multiclassProficienciesFor(c);
      expect(g).toEqual({
        armor: [],
        weapons: [],
        tools: [],
        chooseSkills: 0,
        chooseTools: 0,
      });
    }
  });

  it("never grants heavy armor — no class does when multiclassed into", () => {
    for (const c of Object.values(OfficialClass))
      expect(multiclassProficienciesFor(c).armor).not.toContain("Heavy Armor");
  });

  it("gives the barbarian shields and weapons but no armor training", () => {
    const g = multiclassProficienciesFor(OfficialClass.Barbarian);
    expect(g.armor).toEqual(["Shields"]);
    expect(g.weapons).toEqual(["Simple Weapons", "Martial Weapons"]);
  });

  it("treats a homebrew class as granting nothing rather than guessing", () => {
    expect(multiclassProficienciesFor("Blood Hunter").chooseSkills).toBe(0);
    expect(multiclassProficienciesFor("Blood Hunter").armor).toEqual([]);
  });

  describe("skill choices", () => {
    it("offers every skill to a bard ('one skill of your choice')", () => {
      const options = multiclassSkillOptions(OfficialClass.Bard);
      expect(options).toContain(SkillName.Arcana);
      expect(options).toContain(SkillName.Medicine);
      // The Thieves' Tools pseudo-skill is not a skill you can pick here.
      expect(options).not.toContain(SkillName["Thieves Tools"]);
    });

    it("limits rogue and ranger to their own class skill lists", () => {
      const rogue = multiclassSkillOptions(OfficialClass.Rogue);
      expect(rogue).toContain(SkillName.Stealth);
      expect(rogue).not.toContain(SkillName.Arcana); // not on the rogue list
      expect(multiclassSkillOptions(OfficialClass.Ranger)).toContain(
        SkillName.Survival,
      );
    });

    it("offers no skills for classes whose grant includes none", () => {
      expect(multiclassSkillOptions(OfficialClass.Fighter)).toEqual([]);
      expect(multiclassSkillOptions(OfficialClass.Wizard)).toEqual([]);
    });
  });

  describe("tool choices", () => {
    it("offers the bard one instrument, drawn from the class list", () => {
      expect(multiclassProficienciesFor(OfficialClass.Bard).chooseTools).toBe(
        1,
      );
      expect(multiclassToolOptions(OfficialClass.Bard)).toContain("Lute");
    });

    it("offers no tool choice to classes that get tools outright", () => {
      // The rogue's Thieves' Tools are granted, not chosen.
      expect(multiclassToolOptions(OfficialClass.Rogue)).toEqual([]);
      expect(multiclassProficienciesFor(OfficialClass.Rogue).tools).toEqual([
        "Thieves' Tools",
      ]);
      expect(multiclassToolOptions(OfficialClass.Monk)).toEqual([]);
    });
  });
});
