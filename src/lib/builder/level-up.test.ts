import { describe, expect, it } from "vitest";
import {
  ArmorType,
  DamageType,
  OfficialClass,
  RestType,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { defaultBuilderState } from "src/lib/builder/types";
import {
  additionalMagicalSecretsAt,
  applyLevelUp,
  classHasCantrips,
  defaultLevelUpState,
  isCasterClass,
  spellListFilterFor,
  summarizeLevelUp,
  targetClassLevel,
} from "src/lib/builder/level-up";
import { isAsiLevel, subclassDueAt } from "src/lib/builder/class-features";
import {
  chosenIn,
  newOptionPicksAt,
  resistancesFromOptions,
} from "src/lib/builder/chosen-options";
import { expertiseDueAt } from "src/lib/builder/class-features";
import { getPB, hpAdjustmentOf, statCapFor } from "src/lib/rules";
import { ridersFor } from "src/lib/mechanics/riders";
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

describe("applyLevelUp — grants from the wikidot verification pass", () => {
  it("Illusion wizard learns Minor Illusion when choosing the school at 2nd", () => {
    const char = level1("wizard");
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Wizard",
      subclass: "Illusion",
    });
    expect(leveled.spells[0]?.map((s) => s.info.title)).toContain(
      "Minor Illusion",
    );
  });

  it("Necromancy's Animate Dead lands at 6th, long after the choice level", () => {
    const char = level1("wizard");
    char.class[0].level = 5;
    char.class[0].subclass = "Necromancy";
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Wizard",
    });
    expect(leveled.spells[3]?.map((s) => s.info.title)).toContain(
      "Animate Dead",
    );
  });

  it("Scout's Survivalist grants both skills with expertise, no choice", () => {
    const char = level1("rogue");
    char.class[0].level = 2;
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Rogue",
      subclass: "Scout",
    });
    expect(leveled.proficiencies.skills[SkillName.Nature]).toBe(true);
    expect(leveled.proficiencies.expertise[SkillName.Nature]).toBe(true);
    expect(leveled.proficiencies.expertise[SkillName.Survival]).toBe(true);
  });

  it("Banneret's Royal Envoy grants Persuasion at 7th via levelEffects", () => {
    const char = level1("fighter");
    char.class[0].level = 6;
    char.class[0].subclass = "Banneret";
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Fighter",
    });
    expect(leveled.proficiencies.skills[SkillName.Persuasion]).toBe(true);
  });

  it("College of Swords grants medium armor and offers its fighting style", () => {
    const char = level1("bard");
    char.class[0].level = 2;
    const leveled = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Bard",
      subclass: "Swords",
      fightingStyle: "Dueling",
    });
    expect(leveled.otherProficiencies.armor[ArmorType.Medium]).toBe(true);
    expect(leveled.features.map((f) => f.title)).toContain("Dueling");
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

  it("seeds Aura of Protection's save bonus at paladin 6, not before", () => {
    let pal = level1("paladin");
    const up = () =>
      (pal = applyLevelUp(pal, {
        ...defaultLevelUpState(pal),
        className: "Paladin",
      }));
    up(); // 2
    up(); // 3
    up(); // 4
    up(); // 5
    expect(pal.savingThrowBonus).toBeUndefined();
    up(); // 6
    expect(pal.savingThrowBonus).toBeDefined();
    // CHA 8 → mod -1 → max(1, -1) = +1 to every save.
    expect(calculateCustomFormula(pal.savingThrowBonus!, pal)).toBe(1);
  });

  it("lets a Champion pick a second fighting style at 10th", () => {
    let f = level1("fighter", { fightingStyle: "Defense" });
    for (let lvl = 2; lvl <= 10; lvl++) {
      f = applyLevelUp(f, {
        ...defaultLevelUpState(f),
        className: "Fighter",
        ...(lvl === 3 ? { subclass: "Champion" } : {}),
        ...(lvl === 10 ? { fightingStyle: "Dueling" } : {}),
      });
    }
    const styles = f.features.map((x) => x.title);
    expect(styles).toContain("Defense");
    expect(styles).toContain("Dueling");
  });

  it("gives Blind Fighting its blindsight without lowering racial darkvision", () => {
    const f = level1("fighter", {
      raceIndex: "dwarf",
      fightingStyle: "Blind Fighting",
    });
    expect(f.senses.blindsight).toBe(10);
    expect(f.senses.darkvision).toBe(60);
  });

  it("gives Superior Technique a superiority die and one maneuver, subclass or not", () => {
    // The maneuver group is offered only to the fighter who took the style…
    expect(
      newOptionPicksAt("Fighter", 1, {
        fightingStyle: "Superior Technique",
      }),
    ).toEqual([
      expect.objectContaining({
        count: 1,
        group: expect.objectContaining({ category: "superiorTechnique" }),
      }),
    ]);
    expect(
      newOptionPicksAt("Fighter", 1, { fightingStyle: "Defense" }),
    ).toEqual([]);

    const f = level1("fighter", {
      fightingStyle: "Superior Technique",
      chosenOptions: { superiorTechnique: ["Riposte"] },
    });
    expect(f.features.map((x) => x.title)).toContain("Superior Technique");
    const die = f.limitedUseAbilities.find(
      (a) => a.info.title === "Superiority Die",
    )!;
    expect(die.maxUses).toBe(1);
    expect(die.recharge).toBe(RestType.shortRest);
    expect(chosenIn(f, "superiorTechnique").map((o) => o.name)).toEqual([
      "Riposte",
    ]);
  });

  it("swaps a ranger's 2014 features for the Tasha's ones", () => {
    const r = level1("ranger", {
      optionalFeatures: ["Favored Foe", "Deft Explorer"],
      classSkillChoices: [SkillName.Survival, SkillName.Stealth],
      expertiseChoices: [SkillName.Survival],
      // A pick the ranger is no longer owed — it must not land anyway.
      chosenOptions: { favoredEnemy: ["Dragons"], naturalExplorer: ["Forest"] },
    });
    const titles = r.features.map((f) => f.title);
    expect(titles).toContain("Favored Foe");
    expect(titles).toContain("Deft Explorer");
    expect(titles.some((t) => t.startsWith("Favored Enemy"))).toBe(false);
    expect(titles.some((t) => t.startsWith("Natural Explorer"))).toBe(false);
    expect(chosenIn(r, "favoredEnemy")).toEqual([]);
    expect(chosenIn(r, "naturalExplorer")).toEqual([]);
    // Canny is an expertise pick; Favored Foe is a pool with PB uses.
    expect(r.proficiencies.expertise.Survival).toBe(true);
    const foe = r.limitedUseAbilities.find(
      (a) => a.info.title === "Favored Foe",
    )!;
    expect(calculateCustomFormula(foe.maxUses, r)).toBe(getPB(r));
    // …and none of it reaches a ranger who left the swaps off.
    const raw = level1("ranger", {
      chosenOptions: { favoredEnemy: ["Dragons"] },
    });
    expect(raw.features.map((f) => f.title).join()).toContain("Favored Enemy");
    expect(raw.limitedUseAbilities).toEqual([]);
  });

  it("carries a ranger's swaps forward to the levels they pay off at", () => {
    let r = level1("ranger", {
      optionalFeatures: ["Favored Foe", "Deft Explorer"],
    });
    const walk = r.speeds.walk;
    for (let lvl = 2; lvl <= 10; lvl++)
      r = applyLevelUp(r, {
        ...defaultLevelUpState(r),
        className: "Ranger",
        ...(lvl === 3 ? { optionalFeatures: ["Primal Awareness"] } : {}),
        ...(lvl === 10 ? { optionalFeatures: ["Nature's Veil"] } : {}),
      });
    const titles = r.features.map((f) => f.title);
    // Deft Explorer's later halves arrive on their own levels…
    expect(titles).toContain("Roving");
    expect(r.speeds.walk).toBe(walk + 5);
    expect(r.speeds.climb).toBe(walk + 5);
    expect(r.speeds.swim).toBe(walk + 5);
    // …and the two later swaps replaced their 2014 counterparts.
    expect(titles).toContain("Primal Awareness");
    expect(titles).not.toContain("Primeval Awareness");
    expect(titles).toContain("Nature's Veil");
    expect(titles).not.toContain("Hide in Plain Sight");
    const pools = r.limitedUseAbilities.map((a) => a.info.title);
    expect(pools).toContain("Tireless");
    expect(pools).toContain("Nature's Veil");
    // Favored Foe's die grew d4 → d6 at 6th.
    const foe = r.limitedUseAbilities.find(
      (a) => a.info.title === "Favored Foe",
    )!;
    expect(JSON.stringify(foe.mechanics)).toContain("d6");
    // The ranger is never asked for a favored enemy at 6th or 14th.
    expect(
      newOptionPicksAt("Ranger", 6, {
        optionalFeatures: ["Favored Foe", "Deft Explorer"],
      }),
    ).toEqual([]);
  });

  it("grants a Divination wizard the Portent pool, not a duplicate prose row", () => {
    let w = level1("wizard");
    w = applyLevelUp(w, {
      ...defaultLevelUpState(w),
      className: "Wizard",
      subclass: "Divination",
    }); // 2 — wizard picks subclass at 2
    expect(w.limitedUseAbilities.map((a) => a.info.title)).toContain("Portent");
    expect(w.features.map((f) => f.title)).not.toContain("Portent");
  });

  it("applies a Lore bard's three chosen skills at 3rd", () => {
    let b = level1("bard");
    b = applyLevelUp(b, { ...defaultLevelUpState(b), className: "Bard" }); // 2
    b = applyLevelUp(b, {
      ...defaultLevelUpState(b),
      className: "Bard",
      subclass: "Lore",
      subclassSkillChoices: [
        SkillName.Arcana,
        SkillName.History,
        SkillName.Nature,
      ],
    }); // 3
    expect(b.proficiencies.skills.Arcana).toBe(true);
    expect(b.proficiencies.skills.History).toBe(true);
    expect(b.proficiencies.skills.Nature).toBe(true);
  });

  it("records a warlock's Mystic Arcanum choice on its pool at 11th", () => {
    let w = level1("warlock");
    for (let lvl = 2; lvl <= 11; lvl++) {
      w = applyLevelUp(w, {
        ...defaultLevelUpState(w),
        className: "Warlock",
        ...(lvl === 11 ? { mysticArcanum: "eyebite" } : {}),
      });
    }
    const pool = w.limitedUseAbilities.find(
      (a) => a.info.title === "Mystic Arcanum (6th Level)",
    );
    expect(pool).toBeDefined();
    expect("detail" in pool!.info ? pool!.info.detail : "").toContain(
      "Eyebite",
    );
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
    expect(
      newOptionPicksAt("Fighter", 3, { subclass: "Battle Master" }),
    ).toEqual([expect.objectContaining({ count: 3 })]);
    // Without the subclass, nothing — a Champion gets no maneuvers.
    expect(newOptionPicksAt("Fighter", 3, { subclass: "Champion" })).toEqual(
      [],
    );
  });

  it("writes the picks onto the character, with their summaries", () => {
    const char = toBattleMaster();
    const picks = chosenIn(char, "maneuvers");
    // A name not in the catalog is rejected.
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
    expect(
      newOptionPicksAt("Fighter", 7, { subclass: "Battle Master" }),
    ).toEqual([expect.objectContaining({ count: 2 })]);
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

  it("a draconic ancestry confers its resistance only from 6th level (Elemental Affinity)", () => {
    const char = level1("fighter");
    const at1 = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Sorcerer",
      isNewMulticlass: true,
      subclass: "Draconic Bloodline",
      chosenOptions: { draconicAncestry: ["White (cold)"] },
    });
    // Dragon Ancestor at 1st only grants the RP/language benefit — no resistance.
    expect(at1.damageModifiers.resistances).not.toContain(DamageType.Cold);
    // Elemental Affinity's resistance lands once the sorcerer reaches 6th level.
    const sorc6 = {
      ...at1,
      class: at1.class.map((k) =>
        k.name === "Sorcerer" ? { ...k, level: 6 } : k,
      ),
    };
    expect(resistancesFromOptions(sorc6.chosenOptions ?? [], sorc6)).toContain(
      DamageType.Cold,
    );
  });
});

describe("summarizeLevelUp", () => {
  // The review step's "You gain" list.
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

describe("applyLevelUp — ability scores a class feature grants", () => {
  it("applies Primal Champion's +4 and lets it exceed 20", () => {
    let char = level1("barbarian");
    char.stats.str = 18;
    char.stats.con = 20;
    // Advance to barbarian 20, where Primal Champion lands.
    while ((char.class[0]?.level ?? 0) < 20)
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Barbarian",
        advancement: "asi",
        asi: {},
      });
    expect(char.features.map((f) => f.title)).toContain("Primal Champion");
    // 18 + 4 = 22, and 20 + 4 clipped at the feature's own raised ceiling.
    expect(char.stats.str).toBe(22);
    expect(char.stats.con).toBe(24);
  });

  it("leaves other classes' scores alone at 20", () => {
    let char = level1("fighter");
    const startingStr = char.stats.str;
    while ((char.class[0]?.level ?? 0) < 20)
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Fighter",
        advancement: "asi",
        asi: {},
      });
    expect(char.stats.str).toBe(startingStr);
  });
});

// level-effects.test.ts covers the applier; this checks the wiring.
describe("applyLevelUp — level effects", () => {
  // Advance a fresh level-1 character to `to`, keeping the subclass set.
  const levelTo = (classIndex: string, subclass: string, to: number) => {
    let char = level1(classIndex);
    for (let next = 2; next <= to; next++)
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: char.class[0].name,
        subclass,
      });
    return char;
  };

  it("gives a Storm Sorcerer its resistances at 6th, not before", () => {
    const at5 = levelTo("sorcerer", "Storm Sorcery", 5);
    expect(at5.damageModifiers.resistances).not.toContain(DamageType.Lightning);
    const at6 = levelTo("sorcerer", "Storm Sorcery", 6);
    expect(at6.damageModifiers.resistances).toEqual(
      expect.arrayContaining([DamageType.Lightning, DamageType.Thunder]),
    );
  });

  it("adds a Gloom Stalker's Wisdom to initiative exactly once", () => {
    const at5 = levelTo("ranger", "Gloom Stalker", 5);
    // Levels 4 and 5 re-run the subclass's effects; the modifier must not stack.
    expect(
      JSON.stringify(at5.initiativeFormula).split(StatKey.wis).length - 1,
    ).toBe(1);
  });

  it("leaves a subclass with no effects entirely alone", () => {
    const hunter = levelTo("ranger", "Hunter", 5);
    expect(hunter.initiativeFormula).toBeUndefined();
  });

  it("grants a monk every saving throw at 14th", () => {
    const at13 = levelTo("monk", "Open Hand", 13);
    expect(at13.proficiencies.savingThrows[StatKey.cha]).toBeFalsy();
    const at14 = levelTo("monk", "Open Hand", 14);
    for (const stat of Object.values(StatKey))
      expect(at14.proficiencies.savingThrows[stat]).toBe(true);
  });
});

// A picked option that spends a resource becomes a `maxUses: 0` action host,
// so it reaches the play-mode sheet with no new UI (see `syncOptionHosts`).
describe("applyLevelUp — option action hosts", () => {
  const sorcererWith = (...metamagic: string[]) => {
    let char = level1("sorcerer");
    for (let next = 2; next <= 3; next++)
      char = applyLevelUp(char, {
        ...defaultLevelUpState(char),
        className: "Sorcerer",
        chosenOptions: next === 3 ? { metamagic } : {},
      });
    return char;
  };

  it("hosts a picked metamagic as an action that drains Sorcery Points", () => {
    const char = sorcererWith("Quickened Spell");
    const host = char.limitedUseAbilities.find(
      (a) => a.info.title === "Quickened Spell",
    );
    expect(host).toBeDefined();
    expect(calculateCustomFormula(host!.maxUses, char)).toBe(0);
    const spend = host!.mechanics?.actions?.[0].effects.find(
      (e) => e.effect === "spendUses",
    );
    expect(spend && "pool" in spend && spend.pool).toBe("Sorcery Points");
    // 2 points for Quickened, per the PHB.
    expect(spend && "amount" in spend && spend.amount).toEqual({ fixed: 2 });
  });

  it("offers a free-typed amount for Twinned Spell", () => {
    const char = sorcererWith("Twinned Spell");
    const host = char.limitedUseAbilities.find(
      (a) => a.info.title === "Twinned Spell",
    );
    expect(host!.mechanics?.actions?.[0].choose?.amount).toBe("uses");
  });

  it("creates no host for an option that spends nothing", () => {
    const char = level1("druid");
    expect(
      char.limitedUseAbilities.some((a) => a.info.title === "Arctic"),
    ).toBe(false);
  });

  it("does not duplicate a host when a level is re-applied", () => {
    let char = sorcererWith("Subtle Spell");
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: "Sorcerer",
    });
    expect(
      char.limitedUseAbilities.filter((a) => a.info.title === "Subtle Spell"),
    ).toHaveLength(1);
  });
});

describe("Lore Bard's Additional Magical Secrets", () => {
  const bardTo = (level: number, subclass?: string) => {
    let out = level1("bard");
    while ((out.class[0]?.level ?? 0) < level)
      out = applyLevelUp(out, {
        ...defaultLevelUpState(out),
        className: OfficialClass.Bard,
        // The subclass is due at bard 3.
        ...(out.class[0].level === 2 ? { subclass } : {}),
      });
    return out;
  };

  it("is owed only by a Lore bard, and only at 6th", () => {
    expect(additionalMagicalSecretsAt("Bard", 6, "Lore")).toBe(2);
    expect(additionalMagicalSecretsAt("Bard", 6, "Valor")).toBe(0);
    expect(additionalMagicalSecretsAt("Bard", 5, "Lore")).toBe(0);
    expect(additionalMagicalSecretsAt("Bard", 10, "Lore")).toBe(0);
    expect(additionalMagicalSecretsAt("Wizard", 6, "Lore")).toBe(0);
  });

  it("learns two off-list spells on top of the level's own allowance", () => {
    const bard5 = bardTo(5, "Lore");
    const before = Object.values(bard5.spells).flat().length;
    const bard6 = applyLevelUp(bard5, {
      ...defaultLevelUpState(bard5),
      className: OfficialClass.Bard,
      // The bard-list spell this level grants…
      newSpells: { 3: ["hypnotic-pattern"] },
      // …plus two the bard list doesn't contain at all.
      secretSpells: ["fireball", "counterspell"],
    });
    const names = Object.values(bard6.spells)
      .flat()
      .map((s) => s.info.title);
    expect(names).toContain("Hypnotic Pattern");
    expect(names).toContain("Fireball");
    expect(names).toContain("Counterspell");
    expect(names.length).toBe(before + 3);
  });

  it("records them as bard spells, castable with the bard's slots", () => {
    const bard5 = bardTo(5, "Lore");
    const bard6 = applyLevelUp(bard5, {
      ...defaultLevelUpState(bard5),
      className: OfficialClass.Bard,
      secretSpells: ["fireball"],
    });
    const fireball = Object.values(bard6.spells)
      .flat()
      .find((s) => s.info.title === "Fireball");
    expect(fireball?.spellcastingClass).toBe(bard6.class[0].id);
  });

  it("ignores picks a bard isn't owed", () => {
    const valor5 = bardTo(5, "Valor");
    const valor6 = applyLevelUp(valor5, {
      ...defaultLevelUpState(valor5),
      className: OfficialClass.Bard,
      secretSpells: ["fireball"],
    });
    expect(
      Object.values(valor6.spells)
        .flat()
        .map((s) => s.info.title),
    ).not.toContain("Fireball");
  });
});

describe("Simic Hybrid's second Animal Enhancement", () => {
  const simic4 = () => {
    let out = level1("fighter", { raceIndex: "simic-hybrid" });
    while (out.class[0].level < 4)
      out = applyLevelUp(out, {
        ...defaultLevelUpState(out),
        className: OfficialClass.Fighter,
      });
    return out;
  };

  it("lands at 5th level and adds its feature", () => {
    const before = simic4();
    expect(chosenIn(before, "simicEnhancement5")).toEqual([]);
    const after = applyLevelUp(before, {
      ...defaultLevelUpState(before),
      className: OfficialClass.Fighter,
      chosenOptions: { simicEnhancement5: ["Acid Spit"] },
    });
    expect(chosenIn(after, "simicEnhancement5").map((o) => o.name)).toEqual([
      "Acid Spit",
    ]);
    expect(after.features.map((f) => f.title)).toContain("Acid Spit");
  });

  it("isn't offered again on a later level", () => {
    let char = simic4();
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: OfficialClass.Fighter,
      chosenOptions: { simicEnhancement5: ["Carapace"] },
    });
    const sixth = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: OfficialClass.Fighter,
      chosenOptions: { simicEnhancement5: ["Acid Spit"] },
    });
    expect(chosenIn(sixth, "simicEnhancement5").map((o) => o.name)).toEqual([
      "Carapace",
    ]);
  });
});

describe("Rune Knight runes", () => {
  const toRuneKnight = () => {
    let char = level1("fighter");
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: OfficialClass.Fighter,
    }); // level 2
    return applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: OfficialClass.Fighter,
      subclass: "Rune Knight",
      chosenOptions: { rune: ["Cloud Rune", "Frost Rune"] },
    }); // level 3
  };

  it("grants Giant's Might plus an invocation pool for each chosen rune", () => {
    const char = toRuneKnight();
    const abilities = char.limitedUseAbilities.map((a) => a.info.title);
    expect(abilities).toContain("Giant's Might");
    expect(abilities).toContain("Cloud Rune");
    expect(abilities).toContain("Frost Rune");
    // A rune you did not choose gets no pool.
    expect(abilities).not.toContain("Stone Rune");
    // The chosen rune also lands as the feature the pool gates on.
    expect(char.features.map((f) => f.title)).toContain("Cloud Rune");
  });

  it("surfaces each chosen rune's passive advantage as a check reminder", () => {
    const notes = ridersFor(toRuneKnight(), "check")
      .filter((r) => r.rider.rider === "advantage")
      .map((r) => (r.rider as { note: string }).note);
    expect(notes.some((n) => n.includes("Sleight of Hand"))).toBe(true); // Cloud
    expect(notes.some((n) => n.includes("Animal Handling"))).toBe(true); // Frost
  });
});
