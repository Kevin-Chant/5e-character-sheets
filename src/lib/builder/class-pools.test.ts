import { describe, expect, it } from "vitest";
import { OfficialClass, RestType } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { buildCharacter } from "src/lib/builder/build-character";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import { defaultBuilderState } from "src/lib/builder/types";
import { mechanicsForAbility } from "src/lib/mechanics/catalog";
import { critThreshold, ridersFor } from "src/lib/mechanics/riders";
import { randomUUID } from "src/lib/browser";
import { Character, IClass, LimitedUseAbility } from "src/lib/types";
import { syncClassPools, syncRacePools } from "./class-pools";

const blank = (): Character => {
  const c = structuredClone(defaultCharacter);
  c.limitedUseAbilities = [];
  return c;
};

const klass = (name: OfficialClass, level: number): IClass => ({
  id: randomUUID(),
  name,
  level,
});

const titles = (c: Character) => c.limitedUseAbilities.map((a) => a.info.title);
const pool = (c: Character, title: string): LimitedUseAbility =>
  c.limitedUseAbilities.find((a) => a.info.title === title)!;

describe("syncClassPools", () => {
  it("grants only the pools the class level has reached", () => {
    const c = blank();
    syncClassPools(c, klass(OfficialClass.Fighter, 1));
    expect(titles(c)).toEqual(["Second Wind"]);
    syncClassPools(c, klass(OfficialClass.Fighter, 9));
    expect(titles(c)).toEqual(["Second Wind", "Action Surge", "Indomitable"]);
  });

  it("re-derives pool sizes at threshold levels, keeping expenditure", () => {
    const c = blank();
    const barb = klass(OfficialClass.Barbarian, 1);
    syncClassPools(c, barb);
    expect(pool(c, "Rage").maxUses).toBe(2);
    pool(c, "Rage").expended = 2;
    syncClassPools(c, { ...barb, level: 6 });
    expect(pool(c, "Rage").maxUses).toBe(4);
    expect(pool(c, "Rage").expended).toBe(2);
    syncClassPools(c, { ...barb, level: 17 });
    expect(pool(c, "Rage").maxUses).toBe(6);
  });

  it("scaling pools reference the class level as a formula leaf", () => {
    const c = blank();
    const monk = klass(OfficialClass.Monk, 2);
    syncClassPools(c, monk);
    expect(pool(c, "Ki").maxUses).toEqual({ classLevel: monk.id });
    expect(pool(c, "Ki").recharge).toBe(RestType.shortRest);
    // Paladin's pool is 5 × level.
    const pal = klass(OfficialClass.Paladin, 1);
    syncClassPools(c, pal);
    expect(pool(c, "Lay on Hands").maxUses).toEqual({
      operation: "multiplication",
      operands: [5, { classLevel: pal.id }],
    });
  });

  it("Bardic Inspiration refreshes on short rests from bard 5", () => {
    const c = blank();
    const bard = klass(OfficialClass.Bard, 1);
    syncClassPools(c, bard);
    expect(pool(c, "Bardic Inspiration").recharge).toBe(RestType.longRest);
    syncClassPools(c, { ...bard, level: 5 });
    expect(pool(c, "Bardic Inspiration").recharge).toBe(RestType.shortRest);
  });

  it("every granted pool title resolves to catalog mechanics", () => {
    const c = blank();
    for (const [name, level] of [
      [OfficialClass.Barbarian, 20],
      [OfficialClass.Bard, 20],
      [OfficialClass.Cleric, 20],
      [OfficialClass.Druid, 20],
      [OfficialClass.Fighter, 20],
      [OfficialClass.Monk, 20],
      [OfficialClass.Paladin, 20],
      [OfficialClass.Sorcerer, 20],
      [OfficialClass.Wizard, 20],
    ] as const)
      syncClassPools(c, klass(name, level));
    expect(c.limitedUseAbilities.length).toBeGreaterThanOrEqual(12);
    for (const ability of c.limitedUseAbilities)
      expect(mechanicsForAbility(ability), ability.info.title).toBeDefined();
  });
});

describe("syncRacePools", () => {
  it("creates racial pools once, by trait title", () => {
    const c = blank();
    syncRacePools(c, ["Breath Weapon", "Darkvision"]);
    expect(titles(c)).toEqual(["Breath Weapon"]);
    expect(pool(c, "Breath Weapon").recharge).toBe(RestType.shortRest);
    syncRacePools(c, ["Breath Weapon"]); // idempotent
    expect(c.limitedUseAbilities).toHaveLength(1);
  });
});

describe("builder integration", () => {
  const level1 = (classIndex: string, extra = {}) =>
    buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex,
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
      ...extra,
    });

  it("a built fighter starts with a Second Wind pool", () => {
    const c = level1("fighter");
    expect(titles(c)).toContain("Second Wind");
    expect(mechanicsForAbility(pool(c, "Second Wind"))).toBeDefined();
  });

  it("a built dragonborn gets a Breath Weapon pool", () => {
    const c = level1("fighter", { raceIndex: "dragonborn" });
    expect(titles(c)).toContain("Breath Weapon");
  });

  it("leveling a fighter to 2 grants Action Surge", () => {
    const c = level1("fighter");
    const leveled = applyLevelUp(c, defaultLevelUpState(c));
    expect(titles(leveled)).toContain("Action Surge");
  });

  it("wizard subclass at level 2 applies its grants (Evocation)", () => {
    const c = level1("wizard");
    const leveled = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Wizard as string,
      subclass: "Evocation",
    });
    expect(leveled.class[0].subclass).toBe("Evocation");
    expect(leveled.features.map((f) => f.title)).toContain("Sculpt Spells");
  });

  it("druid subclass at level 2 grants the Natural Recovery pool (Land)", () => {
    const c = level1("druid");
    const leveled = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Druid as string,
      subclass: "Land",
    });
    expect(titles(leveled)).toContain("Natural Recovery");
    expect(
      mechanicsForAbility(pool(leveled, "Natural Recovery")),
    ).toBeDefined();
    expect(leveled.features.map((f) => f.title)).toContain("Circle Spells");
  });

  it("fighter subclass at level 3 applies riders (Champion) ", () => {
    let c = level1("fighter");
    for (const subclass of [undefined, "Champion"]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Fighter as string,
        subclass,
      });
    }
    expect(c.class[0].level).toBe(3);
    expect(c.features.map((f) => f.title)).toContain("Improved Critical");
    expect(critThreshold(ridersFor(c, "attack"))).toBe(19);
  });

  it("Battle Master gets scaling superiority dice", () => {
    let c = level1("fighter");
    for (const subclass of [undefined, "Battle Master"]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Fighter as string,
        subclass,
      });
    }
    const dice = pool(c, "Superiority Dice");
    expect(dice.maxUses).toBe(4);
    expect(dice.recharge).toBe(RestType.shortRest);
    expect(mechanicsForAbility(dice)).toBeDefined();
    // Re-derives at the 7th-level threshold.
    syncClassPools(c, { ...c.class[0], level: 7 });
    expect(pool(c, "Superiority Dice").maxUses).toBe(5);
  });

  it("paladin Devotion at level 3 adds oath spells and features", () => {
    let c = level1("paladin");
    for (const subclass of [undefined, "Devotion"]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Paladin as string,
        subclass,
      });
    }
    expect(c.features.map((f) => f.title)).toContain(
      "Sacred Weapon (Channel Divinity)",
    );
    expect((c.spells[1] ?? []).map((s) => s.info.title)).toContain("Sanctuary");
  });

  it("a level-1 Celestial warlock gets the scaling Healing Light pool", () => {
    const c = level1("warlock", { subclass: "Celestial" });
    const light = pool(c, "Healing Light");
    expect(light.maxUses).toEqual({
      operation: "addition",
      operands: [1, { classLevel: c.class[0].id }],
    });
    expect(mechanicsForAbility(light)).toBeDefined();
  });

  it("a multiclass dip picks up subclass grants at its own level 3", () => {
    let c = level1("wizard");
    c = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Fighter as string,
      isNewMulticlass: true,
    });
    for (const subclass of [undefined, "Champion"]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Fighter as string,
        subclass,
      });
    }
    const fighter = c.class.find((k) => k.name === OfficialClass.Fighter)!;
    expect(fighter.level).toBe(3);
    expect(fighter.subclass).toBe("Champion");
    expect(critThreshold(ridersFor(c, "attack"))).toBe(19);
  });

  it("paladin 2 gains Divine Smite prose and an applied fighting style", () => {
    const c = level1("paladin");
    const leveled = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Paladin as string,
      fightingStyle: "Defense",
    });
    const titles = leveled.features.map((f) => f.title);
    expect(titles).toContain("Divine Smite");
    expect(titles).toContain("Defense");
    // Defense wraps the AC formula with +1.
    expect(leveled.acFormula).toEqual({
      operation: "addition",
      operands: [c.acFormula, 1],
    });
  });

  it("Great Weapon Fighting via level-up activates its damage rider", () => {
    const c = level1("paladin");
    const leveled = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Paladin as string,
      fightingStyle: "Great Weapon Fighting",
    });
    expect(ridersFor(leveled, "damage").map((r) => r.rider.rider)).toContain(
      "rerollBelow",
    );
  });

  it("warlock 2 invocations land as features", () => {
    const c = level1("warlock", { subclass: "Fiend" });
    const leveled = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Warlock as string,
      invocations: ["Agonizing Blast", "Devil's Sight"],
    });
    const titles = leveled.features.map((f) => f.title);
    expect(titles).toContain("Agonizing Blast");
    expect(titles).toContain("Devil's Sight");
  });

  it("a built fighter can take a level-1 fighting style", () => {
    const c = level1("fighter", { fightingStyle: "Great Weapon Fighting" });
    expect(c.features.map((f) => f.title)).toContain("Great Weapon Fighting");
    expect(ridersFor(c, "damage")).toHaveLength(1);
  });

  it("a built tiefling gets structured fire resistance", () => {
    const c = level1("fighter", { raceIndex: "tiefling" });
    expect(c.damageModifiers.resistances).toEqual(["Fire"]);
  });

  it("a built Hexblade gets the Hexblade's Curse pool with its action", () => {
    const c = level1("warlock", { subclass: "Hexblade" });
    const curse = pool(c, "Hexblade's Curse");
    expect(curse.maxUses).toBe(1);
    expect(curse.recharge).toBe(RestType.shortRest);
    expect(mechanicsForAbility(curse)?.actions).toBeDefined();
  });

  it("paladin Vengeance at 3 grants oath features and spells", () => {
    let c = level1("paladin");
    for (const subclass of [undefined, "Vengeance"]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Paladin as string,
        subclass,
      });
    }
    expect(c.features.map((f) => f.title)).toContain(
      "Vow of Enmity (Channel Divinity)",
    );
    expect((c.spells[1] ?? []).map((s) => s.info.title)).toContain("Bane");
  });

  it("a sorcerer multiclass dip grants Sorcery Points at its level 2", () => {
    const c = level1("fighter");
    const state = {
      ...defaultLevelUpState(c),
      className: OfficialClass.Sorcerer as string,
      isNewMulticlass: true,
    };
    const dip1 = applyLevelUp(c, state);
    expect(titles(dip1)).not.toContain("Sorcery Points");
    const dip2 = applyLevelUp(dip1, {
      ...defaultLevelUpState(dip1),
      className: OfficialClass.Sorcerer as string,
      isNewMulticlass: false,
    });
    expect(titles(dip2)).toContain("Sorcery Points");
    const sorc = dip2.class.find((k) => k.name === OfficialClass.Sorcerer)!;
    expect(pool(dip2, "Sorcery Points").maxUses).toEqual({
      classLevel: sorc.id,
    });
  });
});
