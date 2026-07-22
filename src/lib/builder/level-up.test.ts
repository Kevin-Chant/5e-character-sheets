import { describe, expect, it } from "vitest";
import {
  ArmorType,
  OfficialClass,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { defaultBuilderState } from "src/lib/builder/types";
import {
  applyLevelUp,
  classHasCantrips,
  defaultLevelUpState,
  isAsiLevel,
  isCasterClass,
  spellListFilterFor,
  subclassDueAt,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { getPB } from "src/lib/rules";
import { calculateCustomFormula } from "src/lib/formula";
import { PB } from "src/lib/data/data-definitions";

const level1 = (classIndex: string, extra = {}) =>
  buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    classIndex,
    scoreMethod: "manual",
    baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    ...extra,
  });

describe("level-up progression tables", () => {
  it("knows when a subclass is due", () => {
    expect(subclassDueAt("Cleric", 1)).toBe(true);
    expect(subclassDueAt("Wizard", 2)).toBe(true);
    expect(subclassDueAt("Fighter", 3)).toBe(true);
    expect(subclassDueAt("Fighter", 1)).toBe(false);
  });

  it("knows ASI levels, including class extras", () => {
    expect(isAsiLevel("Wizard", 4)).toBe(true);
    expect(isAsiLevel("Fighter", 6)).toBe(true); // fighter extra
    expect(isAsiLevel("Rogue", 10)).toBe(true); // rogue extra
    expect(isAsiLevel("Wizard", 6)).toBe(false);
  });

  it("identifies caster classes", () => {
    expect(isCasterClass("Wizard")).toBe(true);
    expect(isCasterClass("Barbarian")).toBe(false);
  });

  it("only filters the spell list for classes the SRD catalog tags", () => {
    // Wizard is tagged → filter by it; Artificer isn't → show everything.
    expect(spellListFilterFor("Wizard")).toBe("Wizard");
    expect(spellListFilterFor("Artificer")).toBeUndefined();
  });

  it("hides cantrips for half-casters that don't learn them", () => {
    expect(classHasCantrips("Wizard")).toBe(true);
    expect(classHasCantrips("Artificer")).toBe(true);
    expect(classHasCantrips("Ranger")).toBe(false);
    expect(classHasCantrips("Paladin")).toBe(false);
    expect(classHasCantrips("Barbarian")).toBe(false);
  });
});

describe("applyLevelUp — advancing a single class", () => {
  const char = level1("fighter");
  const state = { ...defaultLevelUpState(char), className: "Fighter" };
  const leveled = applyLevelUp(char, state);

  it("bumps the class level and recomputes hit dice + PB", () => {
    expect(targetClassLevel(char, state)).toBe(2);
    expect(leveled.class).toEqual([
      expect.objectContaining({ name: "Fighter", level: 2 }),
    ]);
    expect(leveled.totalHitDice).toEqual({ d10: 2 });
    expect(getPB(leveled)).toBe(2); // still 2 at level 2
  });

  it("raises current HP by the level's average gain", () => {
    // d10 average (rounded up) 6 + CON mod 2 = 8.
    expect(leveled.currHp).toBe(char.currHp + 8);
  });

  it("does not mutate the source character", () => {
    expect(char.class).toEqual([
      expect.objectContaining({ name: "Fighter", level: 1 }),
    ]);
  });
});

describe("applyLevelUp — subclass choice with grants", () => {
  it("applies a Cleric domain's grant when the domain is chosen at level up", () => {
    // A cleric that skipped its domain at creation picks it on level-up.
    const char = level1("cleric");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Cleric",
      subclass: "Life",
    });
    expect(leveled.class[0].subclass).toBe("Life");
    expect(leveled.otherProficiencies.armor[ArmorType.Heavy]).toBe(true);
    const first = leveled.spells[1]?.map((s) => s.info.title) ?? [];
    expect(first).toEqual(expect.arrayContaining(["Bless", "Cure Wounds"]));
    expect(leveled.features.map((f) => f.title)).toContain("Disciple of Life");
  });
});

describe("applyLevelUp — multiclassing", () => {
  it("adds a new class entry and registers spellcasting", () => {
    const char = level1("fighter");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Wizard",
      isNewMulticlass: true,
    });
    expect(
      leveled.class.map((c) => ({ name: c.name, level: c.level })),
    ).toEqual([
      expect.objectContaining({ name: "Fighter", level: 1 }),
      expect.objectContaining({ name: "Wizard", level: 1 }),
    ]);
    const wizardId = leveled.class.find((c) => c.name === "Wizard")!.id;
    expect(leveled.spellcastingClasses.map((c) => c.classId)).toContain(
      wizardId,
    );
    // Multiclass hit dice: one d10 + one d6.
    expect(leveled.totalHitDice).toEqual({ d10: 1, d6: 1 });
  });
});

describe("applyLevelUp — ASI and feats", () => {
  it("applies an ability score improvement", () => {
    const char = level1("fighter");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      advancement: "asi",
      asi: { [StatKey.str]: 2 },
    });
    expect(leveled.stats.str).toBe(char.stats.str + 2);
  });

  it("applies a half-feat's ability increase and adds its feature", () => {
    const char = level1("fighter");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      advancement: "feat",
      featIndex: "resilient",
      featAbilityChoice: StatKey.con,
    });
    expect(leveled.stats.con).toBe(char.stats.con + 1);
    expect(leveled.features.map((f) => f.title)).toContain("Resilient");
    // Resilient grants save proficiency in the raised ability.
    expect(leveled.proficiencies.savingThrows.con).toBe(true);
  });
});

describe("applyLevelUp — feat grants", () => {
  const withFeat = (featIndex: string, extra = {}) =>
    applyLevelUp(level1("fighter"), {
      ...defaultLevelUpState(level1("fighter")),
      className: "Fighter",
      advancement: "feat",
      featIndex,
      ...extra,
    });

  it("Heavily Armored grants heavy armor proficiency", () => {
    expect(
      withFeat("heavily-armored").otherProficiencies.armor[ArmorType.Heavy],
    ).toBe(true);
  });

  it("Mobile increases walking speed by 10", () => {
    const base = level1("fighter").speeds.walk;
    expect(withFeat("mobile").speeds.walk).toBe(base + 10);
  });

  it("Alert adds a +5 initiative formula", () => {
    expect(withFeat("alert").initiativeFormula).toEqual({
      operation: "addition",
      operands: ["dex", 5],
    });
  });

  it("Lucky adds a tracked Luck Points pool", () => {
    const lucky = withFeat("lucky").limitedUseAbilities.find(
      (a) => a.info.title === "Luck Points",
    );
    expect(lucky?.maxUses).toBe(3);
    expect(lucky?.recharge).toBe("Long Rest");
  });

  it("Chef's treats pool scales off proficiency bonus", () => {
    const leveled = withFeat("chef");
    const treats = leveled.limitedUseAbilities.find(
      (a) => a.info.title === "Chef's Treats",
    );
    // The pool is a formula (proficiency bonus), not a constant, and evaluates
    // to the character's current PB.
    expect(treats?.maxUses).toBe(PB);
    expect(calculateCustomFormula(treats!.maxUses, leveled)).toBe(
      getPB(leveled),
    );
  });

  it("Telekinetic grants the Mage Hand cantrip", () => {
    expect(
      withFeat("telekinetic").spells[0]?.map((s) => s.info.title),
    ).toContain("Mage Hand");
  });

  it("Fey Touched grants Misty Step plus a chosen 1st-level spell", () => {
    const leveled = withFeat("fey-touched", {
      featSpellChoices: { 1: ["bless"] },
    });
    expect(leveled.spells[2]?.map((s) => s.info.title)).toContain("Misty Step");
    expect(leveled.spells[1]?.map((s) => s.info.title)).toContain("Bless");
  });

  it("Skill Expert applies chosen proficiency and expertise", () => {
    const leveled = withFeat("skill-expert", {
      featSkillChoices: [SkillName.Perception],
      featExpertiseChoices: [SkillName.Stealth],
    });
    expect(leveled.proficiencies.skills.Perception).toBe(true);
    expect(leveled.proficiencies.expertise.Stealth).toBe(true);
  });

  it("Weapon Master applies chosen weapon proficiencies", () => {
    const leveled = withFeat("weapon-master", {
      featWeaponChoices: ["Rapier", "Longbow"],
    });
    expect(leveled.otherProficiencies.weapons).toEqual(
      expect.arrayContaining(["Rapier", "Longbow"]),
    );
  });
});

describe("defaultLevelUpState", () => {
  it("targets the character's primary class", () => {
    const char = level1("rogue");
    expect(defaultLevelUpState(char).className).toBe(OfficialClass.Rogue);
  });
});
