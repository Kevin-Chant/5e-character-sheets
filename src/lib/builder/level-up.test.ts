import { describe, expect, it } from "vitest";
import {
  ArmorType,
  DamageType,
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
  isCasterClass,
  spellListFilterFor,
  summarizeLevelUp,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { isAsiLevel, subclassDueAt } from "src/lib/builder/class-features";
import { chosenIn, newOptionPicksAt } from "src/lib/builder/chosen-options";
import { expertiseDueAt } from "src/lib/builder/class-features";
import { getPB, hpAdjustmentOf, statCapFor } from "src/lib/rules";
import { FEATS } from "src/lib/builder/feats";
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

  // PHB p.163: joining a class grants a defined subset of its proficiencies,
  // never the full level-1 list.
  describe("proficiencies", () => {
    const multiclassInto = (
      from: string,
      className: string,
      extra: Record<string, unknown> = {},
    ) => {
      const char = level1(from);
      return applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className,
        isNewMulticlass: true,
        ...extra,
      });
    };

    it("grants the multiclass armor subset, not the class's full list", () => {
      const leveled = multiclassInto("wizard", "Fighter");
      expect(leveled.otherProficiencies.armor).toMatchObject({
        [ArmorType.Light]: true,
        [ArmorType.Medium]: true,
        [ArmorType.Shields]: true,
        // A fighter starting at level 1 gets heavy armor; multiclassing doesn't.
        [ArmorType.Heavy]: false,
      });
      expect(leveled.otherProficiencies.weapons).toEqual(
        expect.arrayContaining(["Simple Weapons", "Martial Weapons"]),
      );
    });

    it("grants nothing at all for wizard and sorcerer", () => {
      const char = level1("fighter");
      const leveled = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Wizard",
        isNewMulticlass: true,
      });
      expect(leveled.otherProficiencies.armor).toEqual(
        char.otherProficiencies.armor,
      );
      expect(leveled.otherProficiencies.weapons).toEqual(
        char.otherProficiencies.weapons,
      );
    });

    it("grants the rogue's tools and one chosen skill from its list", () => {
      const leveled = multiclassInto("wizard", "Rogue", {
        multiclassSkills: [SkillName.Stealth],
      });
      expect(leveled.proficiencies.skills[SkillName.Stealth]).toBe(true);
      expect(
        leveled.otherProficiencies.toolsAndOther.map((t) => t.title),
      ).toContain("Thieves' Tools");
      expect(leveled.otherProficiencies.armor[ArmorType.Medium]).toBe(false);
    });

    it("ignores skill picks the class's list doesn't offer, and over-picks", () => {
      const leveled = multiclassInto("wizard", "Rogue", {
        // Arcana isn't on the rogue list; two picks where one is allowed.
        multiclassSkills: [
          SkillName.Arcana,
          SkillName.Stealth,
          SkillName.Acrobatics,
        ],
      });
      // Unpicked skills are simply absent from the map, not stored as false.
      expect(leveled.proficiencies.skills[SkillName.Arcana]).toBeFalsy();
      expect(leveled.proficiencies.skills[SkillName.Stealth]).toBe(true);
      expect(leveled.proficiencies.skills[SkillName.Acrobatics]).toBeFalsy();
    });

    it("caps a multiclass bard at one instrument, not the class's three", () => {
      const leveled = multiclassInto("fighter", "Bard", {
        toolChoices: ["Lute", "Drum", "Flute"],
      });
      const tools = leveled.otherProficiencies.toolsAndOther.map(
        (t) => t.title,
      );
      expect(tools).toContain("Lute");
      expect(tools).not.toContain("Drum");
      expect(tools).not.toContain("Flute");
    });

    it("leaves creation's full level-1 grant alone", () => {
      // The same fighter built as a *first* class keeps heavy armor.
      expect(level1("fighter").otherProficiencies.armor[ArmorType.Heavy]).toBe(
        true,
      );
    });
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

describe("applyLevelUp — chosen options", () => {
  // A fighter climbing to 3rd and taking Battle Master: the subclass is chosen
  // in the same level-up, so its maneuvers must be offered and applied now.
  const toBattleMaster = () => {
    let char = level1("fighter");
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
    });
    return applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      subclass: "Battle Master",
      chosenOptions: {
        maneuvers: ["Riposte", "Not A Real Maneuver", "Precision Attack"],
      },
    });
  };

  it("offers a subclass's picks at the level the subclass is chosen", () => {
    expect(newOptionPicksAt("Fighter", 3, "Battle Master")).toEqual([
      expect.objectContaining({ count: 3 }),
    ]);
    // Without the subclass, nothing — a Champion gets no maneuvers.
    expect(newOptionPicksAt("Fighter", 3, "Champion")).toEqual([]);
  });

  it("writes the picks onto the character, with their summaries", () => {
    const char = toBattleMaster();
    const picks = chosenIn(char, "maneuvers");
    // A name that isn't in the catalog is rejected — the grant path validates
    // picks against the group it's applying, so a hand-edited or stale state
    // can't put junk on the sheet.
    expect(picks.map((o) => o.name)).toEqual(["Riposte", "Precision Attack"]);
    expect(picks.find((o) => o.name === "Riposte")?.detail).toContain(
      "reaction",
    );
  });

  it("appends later picks without disturbing or duplicating earlier ones", () => {
    let char = toBattleMaster();
    // 4th is an ASI level and grants no maneuvers; 7th grants two more.
    for (const level of [4, 5, 6]) {
      void level;
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Fighter",
      });
    }
    expect(newOptionPicksAt("Fighter", 7, "Battle Master")).toEqual([
      expect.objectContaining({ count: 2 }),
    ]);
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      // Re-picking one already known must not duplicate it.
      chosenOptions: { maneuvers: ["Riposte", "Parry", "Rally"] },
    });
    const names = chosenIn(char, "maneuvers").map((o) => o.name);
    expect(names.filter((n) => n === "Riposte")).toHaveLength(1);
    expect(names).toContain("Parry");
    expect(names).toContain("Rally");
  });

  it("ignores picks for a category the catalog doesn't know", () => {
    const char = level1("fighter");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      chosenOptions: { notARealCategory: ["Whatever"] },
    });
    expect(leveled.chosenOptions ?? []).toEqual([]);
  });
});

describe("level-up choices added by the coverage audit", () => {
  it("grants expertise at the levels the class allows, and only then", () => {
    expect(expertiseDueAt("Rogue", 1)).toBe(2);
    expect(expertiseDueAt("Rogue", 6)).toBe(2);
    expect(expertiseDueAt("Bard", 3)).toBe(2);
    expect(expertiseDueAt("Rogue", 2)).toBe(0);
    expect(expertiseDueAt("Fighter", 6)).toBe(0);

    let char = level1("rogue", {
      classSkillChoices: [SkillName.Stealth, SkillName.Perception],
    });
    // Expertise can only double a proficiency you have, so pick one the rogue
    // actually took above.
    const pick = [SkillName.Perception];
    // 1st → 6th; only the 6th-level step should take the picks.
    for (const _ of [2, 3, 4, 5]) {
      void _;
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Rogue",
        expertiseChoices: pick,
      });
      expect(char.proficiencies.expertise[SkillName.Perception]).toBeFalsy();
    }
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Rogue",
      expertiseChoices: pick,
    });
    expect(char.proficiencies.expertise[SkillName.Perception]).toBe(true);
  });

  it("swaps out a known spell, leaving the rest in place", () => {
    const char = level1("bard", {
      levelOneSpellIndices: ["cure-wounds", "healing-word"],
    });
    const before = (char.spells[1] ?? []).map((s) => s.info.title);
    expect(before.length).toBeGreaterThan(1);
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Bard",
      swapSpell: "1.0",
    });
    const after = (leveled.spells[1] ?? []).map((s) => s.info.title);
    expect(after).not.toContain(before[0]);
    expect(after).toContain(before[1]);
    expect(after).toHaveLength(before.length - 1);
  });

  it("a draconic ancestry picked at level-up confers its resistance", () => {
    const char = level1("fighter");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Sorcerer",
      isNewMulticlass: true,
      subclass: "Draconic Bloodline",
      chosenOptions: { draconicAncestry: ["White (cold)"] },
    });
    expect(leveled.damageModifiers.resistances).toContain(DamageType.Cold);
  });
});

describe("summarizeLevelUp", () => {
  // The review step's "You gain" list. It's a diff of the applied character
  // rather than a second reading of the grant tables, so these assert the shape
  // of what a player is told, not which table it came from.
  const levelTo = (
    char: Parameters<typeof applyLevelUp>[0],
    className: string,
  ) => applyLevelUp(char, { ...defaultLevelUpState(char), className });

  it("reports the hit points the level added", () => {
    const before = level1("fighter");
    const after = levelTo(before, "Fighter");
    expect(summarizeLevelUp(before, after).hp).toBe(
      after.currHp - before.currHp,
    );
    expect(summarizeLevelUp(before, after).hp).toBeGreaterThan(0);
  });

  it("names the features a level grants, and nothing already on the sheet", () => {
    const before = level1("fighter");
    // Fighter 2 grants Action Surge — a pool, so it lands in `abilities`.
    const after = levelTo(before, "Fighter");
    const summary = summarizeLevelUp(before, after);
    const named = [...summary.features, ...summary.abilities];
    expect(named.length).toBeGreaterThan(0);
    // Level-1 features (Second Wind, Fighting Style) were already there.
    expect(named).not.toContain("Second Wind");
  });

  it("reports a pool that grew rather than listing it as new", () => {
    const l1 = level1("barbarian");
    // Barbarian 3 → Rage count is unchanged; 6 bumps it. Walk up to a level
    // where the pool re-derives and check it reads as changed, not new.
    let char = l1;
    for (let i = 0; i < 5; i++) char = levelTo(char, "Barbarian");
    const summary = summarizeLevelUp(l1, char);
    expect(summary.abilities).not.toContain("Rage");
    expect(summary.changedAbilities).toContain("Rage");
  });

  it("is empty-ish for a level that grants nothing but hit points", () => {
    // Fighter 5 → 6 is an ASI level with no new feature prose of its own.
    let char = level1("fighter");
    for (let i = 0; i < 4; i++) char = levelTo(char, "Fighter");
    const summary = summarizeLevelUp(char, levelTo(char, "Fighter"));
    expect(summary.hp).toBeGreaterThan(0);
    expect(summary.spells).toEqual([]);
  });

  it("lists newly learned spells by name", () => {
    const before = level1("wizard");
    const after = applyLevelUp(before, {
      ...defaultLevelUpState(before),
      className: "Wizard",
      newSpells: { 1: ["magic-missile"] },
    });
    expect(summarizeLevelUp(before, after).spells).toContain("Magic Missile");
  });
});

describe("applyLevelUp — the 20 cap on ability scores", () => {
  const at = (str: number) => {
    const char = level1("fighter");
    char.stats.str = str;
    return char;
  };

  it("won't take a score past 20", () => {
    const char = at(19);
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      advancement: "asi",
      asi: { [StatKey.str]: 2 },
    });
    expect(leveled.stats.str).toBe(20);
  });

  it("honors a feature that raises the ceiling", () => {
    const char = at(22);
    // A barbarian 20's Primal Champion puts STR and CON's maximum at 24.
    char.features.push({ title: "Primal Champion", titleFormulas: [] });
    expect(statCapFor(char, StatKey.str)).toBe(24);
    expect(statCapFor(char, StatKey.dex)).toBe(20);
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      advancement: "asi",
      asi: { [StatKey.str]: 2 },
    });
    expect(leveled.stats.str).toBe(24);
  });

  it("caps a half-feat's increase too", () => {
    const char = at(20);
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      advancement: "feat",
      // Athlete is a half-feat offering +1 STR.
      featIndex: FEATS.find((f) => f.name === "Athlete")?.index,
      featAbilityChoice: StatKey.str,
    });
    expect(leveled.stats.str).toBe(20);
  });
});

describe("applyLevelUp — rolled hit points", () => {
  // The fixture rolls CON 14 (+2) and levels a d10 fighter, average 6.
  const fighter = () => level1("fighter");

  it("uses the fixed average by default", () => {
    const char = fighter();
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
    });
    expect(leveled.currHp).toBe(char.currHp + 8); // 6 average + 2 CON
    expect(hpAdjustmentOf(leveled.maxHp)).toBe(0);
  });

  it("uses the rolled value and carries the difference on max HP", () => {
    const char = fighter();
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      hpMethod: "roll",
      hpRoll: 9,
    });
    expect(leveled.currHp).toBe(char.currHp + 11); // 9 rolled + 2 CON
    // Max HP is average-derived, so the +3 over average rides on top.
    expect(hpAdjustmentOf(leveled.maxHp)).toBe(3);
  });

  it("accumulates adjustments across levels instead of wiping them", () => {
    const char = fighter();
    const once = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      hpMethod: "roll",
      hpRoll: 10,
    });
    const twice = applyLevelUp(once, {
      ...defaultLevelUpState(once),
      className: "Fighter",
      hpMethod: "roll",
      hpRoll: 1,
    });
    // +4 over average, then -5 under it.
    expect(hpAdjustmentOf(once.maxHp)).toBe(4);
    expect(hpAdjustmentOf(twice.maxHp)).toBe(-1);
  });

  it("clamps a roll to the hit die's faces", () => {
    const char = fighter();
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      hpMethod: "roll",
      hpRoll: 40, // a typo, not a house rule — a d10 caps at 10
    });
    expect(leveled.currHp).toBe(char.currHp + 12);
  });

  it("never gains less than 1 HP, even on a bad roll with a CON penalty", () => {
    const char = fighter();
    char.stats.con = 6; // -2
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
      hpMethod: "roll",
      hpRoll: 1,
    });
    expect(leveled.currHp).toBe(char.currHp + 1);
  });
});
