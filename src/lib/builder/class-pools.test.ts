import { describe, expect, it } from "vitest";
import {
  OfficialClass,
  RestType,
  StandardDie,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { buildCharacter } from "src/lib/builder/build-character";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import { defaultBuilderState } from "src/lib/builder/types";
import { mechanicsForAbility } from "src/lib/mechanics/catalog";
import { critThreshold, ridersFor } from "src/lib/mechanics/riders";
import { calculateCustomFormula } from "src/lib/formula";
import { randomUUID } from "src/lib/browser";
import { Character, IClass, LimitedUseAbility } from "src/lib/types";
import { syncClassPools, syncRacePools } from "./class-pools";
import {
  martialArtsDie,
  syncMartialArts,
} from "src/lib/builder/class-features";

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

  it("grants a save DC on the pools whose features impose one", () => {
    const c = blank();
    c.stats.wis = 16; // +3
    const monk = klass(OfficialClass.Monk, 5); // PB +3
    c.class = [monk];
    syncClassPools(c, monk);
    const ki = pool(c, "Ki").save!;
    // 8 + PB + WIS, live rather than baked — and no fixed ability, since each
    // ki feature names its own save.
    expect(calculateCustomFormula(ki.dc, c)).toBe(14);
    expect(ki.stat).toBeUndefined();

    // Pools with no save at all stay clean.
    syncClassPools(c, klass(OfficialClass.Fighter, 1));
    expect(pool(c, "Second Wind").save).toBeUndefined();
  });

  it("a maneuver DC takes the better of STR and DEX", () => {
    const c = blank();
    c.stats.str = 12; // +1
    c.stats.dex = 18; // +4
    const fighter = {
      ...klass(OfficialClass.Fighter, 5),
      subclass: "Battle Master",
    }; // PB +3
    c.class = [fighter];
    syncClassPools(c, fighter);
    expect(
      calculateCustomFormula(pool(c, "Superiority Dice").save!.dc, c),
    ).toBe(15);
  });

  it("backfills a save DC onto a pool granted before DCs existed", () => {
    const c = blank();
    const monk = klass(OfficialClass.Monk, 5);
    c.class = [monk];
    syncClassPools(c, monk);
    // Simulate an older save: the pool exists, but carries no DC.
    delete pool(c, "Ki").save;
    syncClassPools(c, monk);
    expect(pool(c, "Ki").save).toBeDefined();
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
      [OfficialClass.Rogue, 20],
      [OfficialClass.Sorcerer, 20],
      [OfficialClass.Warlock, 20],
      [OfficialClass.Wizard, 20],
    ] as const)
      syncClassPools(c, klass(name, level));
    expect(c.limitedUseAbilities.length).toBeGreaterThanOrEqual(12);
    for (const ability of c.limitedUseAbilities)
      expect(mechanicsForAbility(ability), ability.info.title).toBeDefined();
  });

  // The die lives at index 1 of a `fixed` [count, die, roll] tuple.
  const scalingDie = (ability: LimitedUseAbility): StandardDie => {
    const roll = mechanicsForAbility(ability)?.actions?.[0].effects.find(
      (e) => e.effect === "roll",
    );
    return (roll as unknown as { amount: { fixed: [number, StandardDie] } })
      .amount.fixed[1];
  };

  it("Bardic Inspiration's die scales d6 → d12 with bard level", () => {
    const dieOf = (level: number) => {
      const c = blank();
      syncClassPools(c, klass(OfficialClass.Bard, level));
      return scalingDie(pool(c, "Bardic Inspiration"));
    };
    expect([dieOf(1), dieOf(5), dieOf(10), dieOf(15)]).toEqual([
      StandardDie.d6,
      StandardDie.d8,
      StandardDie.d10,
      StandardDie.d12,
    ]);
  });

  it("Superiority Dice scale d8 → d12 with fighter level", () => {
    const dieOf = (level: number) => {
      const c = blank();
      syncClassPools(c, {
        ...klass(OfficialClass.Fighter, level),
        subclass: "Battle Master",
      });
      return scalingDie(pool(c, "Superiority Dice"));
    };
    expect([dieOf(3), dieOf(10), dieOf(18)]).toEqual([
      StandardDie.d8,
      StandardDie.d10,
      StandardDie.d12,
    ]);
  });

  it("Fighting Spirit temp HP scales 5 → 15 with samurai level", () => {
    const tempHpOf = (level: number) => {
      const c = blank();
      syncClassPools(c, {
        ...klass(OfficialClass.Fighter, level),
        subclass: "Samurai",
      });
      const temp = mechanicsForAbility(
        pool(c, "Fighting Spirit"),
      )?.actions?.[0].effects.find((e) => e.effect === "gainTempHp");
      return (temp as { amount: { fixed: number } }).amount.fixed;
    };
    expect([tempHpOf(3), tempHpOf(10), tempHpOf(15)]).toEqual([5, 10, 15]);
  });

  it("a rogue reaching 20 gets a Stroke of Luck pool with an action", () => {
    const c = blank();
    syncClassPools(c, klass(OfficialClass.Rogue, 19));
    expect(titles(c)).not.toContain("Stroke of Luck");
    syncClassPools(c, klass(OfficialClass.Rogue, 20));
    expect(
      mechanicsForAbility(pool(c, "Stroke of Luck"))?.actions,
    ).toHaveLength(1);
  });

  it("a warlock gets a Mystic Arcanum pool per spell level at 11/13/15/17", () => {
    const c = blank();
    syncClassPools(c, klass(OfficialClass.Warlock, 10));
    expect(titles(c).some((t) => t.startsWith("Mystic Arcanum"))).toBe(false);
    syncClassPools(c, klass(OfficialClass.Warlock, 17));
    expect(
      titles(c).filter((t) => t.startsWith("Mystic Arcanum")),
    ).toHaveLength(4);
    expect(
      mechanicsForAbility(pool(c, "Mystic Arcanum (9th Level)"))?.actions,
    ).toHaveLength(1);
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

  // The dice count lives at index 0 of the roll effect's `fixed` tuple.
  const breathDice = (c: Character): number => {
    const roll = mechanicsForAbility(
      pool(c, "Breath Weapon"),
    )?.actions?.[0].effects.find((e) => e.effect === "roll");
    return (roll as unknown as { amount: { fixed: [number, StandardDie] } })
      .amount.fixed[0];
  };

  it("Breath Weapon dice scale 2d6 → 5d6 with total character level", () => {
    const countOf = (level: number) => {
      const c = blank();
      c.class = [klass(OfficialClass.Fighter, level)];
      syncRacePools(c, ["Breath Weapon"]);
      return breathDice(c);
    };
    expect([countOf(1), countOf(6), countOf(11), countOf(16)]).toEqual([
      2, 3, 4, 5,
    ]);
  });

  it("re-derives an existing Breath Weapon's dice on level-up without duplicating", () => {
    const c = blank();
    c.class = [klass(OfficialClass.Fighter, 1)];
    syncRacePools(c, ["Breath Weapon"]);
    expect(breathDice(c)).toBe(2);
    // Level up, then refresh the way applyLevelUp does — by existing titles.
    c.class[0].level = 11;
    syncRacePools(c, titles(c));
    expect(c.limitedUseAbilities).toHaveLength(1);
    expect(breathDice(c)).toBe(4);
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

  it("a barbarian at level 2 gains Reckless Attack / Danger Sense riders", () => {
    let c = level1("barbarian");
    c = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Barbarian as string,
    });
    expect(c.features.map((f) => f.title)).toEqual(
      expect.arrayContaining(["Reckless Attack", "Danger Sense"]),
    );
    const attack = ridersFor(c, "attack");
    const check = ridersFor(c, "check");
    expect(attack.some((r) => r.source === "Reckless Attack")).toBe(true);
    expect(check.some((r) => r.source === "Danger Sense")).toBe(true);
    // Rage's Strength-check advantage is advisory and always present.
    expect(check.some((r) => r.source === "Rage")).toBe(true);
  });

  it("a barbarian at level 7 gains the Feral Instinct initiative rider", () => {
    let c = level1("barbarian");
    for (let i = 0; i < 6; i++)
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Barbarian as string,
      });
    expect(c.class[0].level).toBe(7);
    expect(
      ridersFor(c, "check").some((r) => r.source === "Feral Instinct"),
    ).toBe(true);
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

describe("syncMartialArts", () => {
  const monkAt = (level: number): Character => {
    const c = blank();
    c.attacks = [];
    const monk = klass(OfficialClass.Monk, level);
    c.class = [monk];
    c.stats.dex = 16; // +3, beating STR 10
    syncMartialArts(c, monk);
    return c;
  };
  const strike = (c: Character) =>
    c.attacks.find((a) => a.name === "Unarmed Strike")!;

  it("grants an Unarmed Strike whose die is the Martial Arts die", () => {
    expect(martialArtsDie(1)).toBe(StandardDie.d4);
    expect(martialArtsDie(5)).toBe(StandardDie.d6);
    expect(martialArtsDie(11)).toBe(StandardDie.d8);
    expect(martialArtsDie(17)).toBe(StandardDie.d10);

    const c = monkAt(1);
    expect(strike(c)).toBeDefined();
    // 1d4 + the better of STR/DEX.
    expect(calculateCustomFormula(strike(c).formula.Bludgeoning!, c)).toBe(
      3 + 1, // DEX +3, plus the d4's deterministic stub
    );
  });

  it("re-derives the die on level-up instead of adding a second attack", () => {
    const c = monkAt(1);
    const monk5 = { ...c.class[0], level: 5 };
    c.class = [monk5];
    syncMartialArts(c, monk5);
    expect(c.attacks.filter((a) => a.name === "Unarmed Strike")).toHaveLength(
      1,
    );
    const damage = strike(c).formula.Bludgeoning as unknown as {
      operands: [[number, StandardDie, string], unknown];
    };
    expect(damage.operands[0][1]).toBe(StandardDie.d6);
  });

  it("leaves non-monks alone", () => {
    const c = blank();
    c.attacks = [];
    syncMartialArts(c, klass(OfficialClass.Fighter, 20));
    expect(c.attacks).toHaveLength(0);
  });
});
