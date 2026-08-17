import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  RestType,
  StandardDie,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { buildCharacter } from "src/lib/builder/build-character";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import { defaultBuilderState } from "src/lib/builder/types";
import { resistancesFromOptions } from "src/lib/builder/chosen-options";
import { mechanicsForAbility } from "src/lib/mechanics/catalog";
import {
  critThreshold,
  extraDamageRiders,
  ridersFor,
} from "src/lib/mechanics/riders";
import { calculateCustomFormula } from "src/lib/formula";
import { randomUUID } from "src/lib/browser";
import { Character, IClass, LimitedUseAbility } from "src/lib/types";
import { SUBCLASS_POOLS, syncClassPools, syncRacePools } from "./class-pools";
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
    // 8 + PB + WIS, live rather than baked.
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

  it("Rune Knight grants Giant's Might (PB uses, long rest) with advantage + scaling extra-damage riders", () => {
    const c = blank();
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 3),
      subclass: "Rune Knight",
    });
    const gm = pool(c, "Giant's Might");
    // Uses equal your proficiency bonus (the PB formula leaf), per long rest.
    expect(gm.maxUses).toBe("proficiencyBonus");
    expect(gm.recharge).toBe(RestType.longRest);
    const riders = mechanicsForAbility(gm)?.riders ?? [];
    expect(riders.some((r) => r.rider.rider === "advantage")).toBe(true);
    const extra = riders.find((r) => r.rider.rider === "extraDamage");
    // The extra-damage die scales d6 → d8 (10th) → d10 (18th).
    const dieOf = (level: number) => {
      const cc = blank();
      syncClassPools(cc, {
        ...klass(OfficialClass.Fighter, level),
        subclass: "Rune Knight",
      });
      const rider = (
        mechanicsForAbility(pool(cc, "Giant's Might"))?.riders ?? []
      ).find((r) => r.rider.rider === "extraDamage");
      return (rider?.rider as { amount: [number, StandardDie, unknown] })
        .amount[1];
    };
    expect(extra).toBeTruthy();
    expect([dieOf(3), dieOf(10), dieOf(18)]).toEqual([
      StandardDie.d6,
      StandardDie.d8,
      StandardDie.d10,
    ]);
  });

  it("a rune's invocation pool is granted only once its rune is a known feature", () => {
    const c = blank();
    // No rune chosen yet: the pool is withheld even at the right level.
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 3),
      subclass: "Rune Knight",
    });
    expect(titles(c)).not.toContain("Cloud Rune");

    // The chosen rune lands as a feature; now the once-per-short-rest pool arrives.
    c.features.push({
      title: "Cloud Rune",
      titleFormulas: [],
      detail: "",
      detailFormulas: [],
    });
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 3),
      subclass: "Rune Knight",
    });
    const cloud = pool(c, "Cloud Rune");
    expect(calculateCustomFormula(cloud.maxUses, c)).toBe(1);
    expect(cloud.recharge).toBe(RestType.shortRest);
    // Master of Runes (15th) grants a second invocation.
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 15),
      subclass: "Rune Knight",
    });
    expect(calculateCustomFormula(pool(c, "Cloud Rune").maxUses, c)).toBe(2);
    // Its passive advantage note surfaces on ability checks.
    const notes = ridersFor(c, "check")
      .filter((r) => r.rider.rider === "advantage")
      .map((r) => (r.rider as { note: string }).note);
    expect(notes.some((n) => n.includes("Sleight of Hand"))).toBe(true);
  });

  it("a rune invoked on a weapon hit rides the attack instead of a button", () => {
    const c = blank();
    c.features.push({
      title: "Fire Rune",
      titleFormulas: [],
      detail: "",
      detailFormulas: [],
    });
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 3),
      subclass: "Rune Knight",
    });
    const fire = pool(c, "Fire Rune");
    const mechanics = mechanicsForAbility(fire);
    // The 2d6 belongs to the attack roll; this row is a signpost only.
    const [signpost] = mechanics?.actions ?? [];
    expect(signpost.name).toBe("Invoke Fire Rune");
    expect(signpost.effects).toHaveLength(1);
    expect(signpost.effects[0].effect).toBe("remind");
    const extra = extraDamageRiders(c).find((r) => r.source === "Fire Rune");
    const rider = extra?.rider as {
      amount: unknown;
      damageType: DamageType;
      declareAt: string;
      uses?: { pool: string };
    };
    expect(rider.amount).toEqual([2, StandardDie.d6, DieOperation.roll]);
    expect(rider.damageType).toBe(DamageType.Fire);
    expect(rider.declareAt).toBe("on-hit");
    // And ticking it costs the rune's own use.
    expect(rider.uses?.pool).toBe("Fire Rune");
    // The hit's restrain rides the rider, so the damage report can carry it.
    expect((rider as { applies?: { name: string } }).applies?.name).toBe(
      "Restrained",
    );
    // A rune invoked on its own keeps its button.
    c.features.push({
      title: "Frost Rune",
      titleFormulas: [],
      detail: "",
      detailFormulas: [],
    });
    syncClassPools(c, {
      ...klass(OfficialClass.Fighter, 3),
      subclass: "Rune Knight",
    });
    expect(mechanicsForAbility(pool(c, "Frost Rune"))?.actions).toHaveLength(1);
  });

  it("Favored Foe marks with its action and rolls its die for free", () => {
    const c = blank();
    c.features.push({
      title: "Favored Foe",
      titleFormulas: [],
      detail: "",
      detailFormulas: [],
    });
    const dieOf = (level: number) => {
      syncClassPools(c, klass(OfficialClass.Ranger, level));
      const rider = extraDamageRiders(c).find((r) => r.source === "Favored Foe")
        ?.rider as {
        amount: [number, StandardDie, unknown];
        uses?: { pool: string };
      };
      // The damage tick costs nothing — RAW, only marking spends.
      expect(rider.uses).toBeUndefined();
      return rider.amount[1];
    };
    expect([dieOf(1), dieOf(6), dieOf(14)]).toEqual([
      StandardDie.d4,
      StandardDie.d6,
      StandardDie.d8,
    ]);
    // The mark is the action: it takes the use and carries the condition.
    const [mark] = mechanicsForAbility(pool(c, "Favored Foe"))?.actions ?? [];
    expect(mark.name).toBe("Mark a foe");
    expect(mark.applies).toEqual({ name: "Favored Foe", rounds: 10 });
    expect(mark.effects).toContainEqual({
      effect: "spendUses",
      amount: { fixed: 1 },
    });
  });

  it("a Whispers bard's Psychic Blades is a rider spending Bardic Inspiration", () => {
    const c = blank();
    const bard = { ...klass(OfficialClass.Bard, 5), subclass: "Whispers" };
    c.class = [bard];
    syncClassPools(c, bard);
    // Not a charge-less pool row of its own any more.
    expect(titles(c)).not.toContain("Psychic Blades");
    const rider = extraDamageRiders(c).find(
      (r) => r.source === "Psychic Blades",
    )?.rider as {
      amount: [number, StandardDie, unknown];
      uses?: { pool: string };
    };
    expect(rider.amount[0]).toBe(3); // 2d6 → 3d6 at 5th
    expect(rider.uses?.pool).toBe("Bardic Inspiration");
    // Another college gets nothing (and neither does a Soulknife rogue, whose
    // same-named feature works nothing like it).
    c.class = [{ ...bard, subclass: "Lore" }];
    expect(
      extraDamageRiders(c).some((r) => r.source === "Psychic Blades"),
    ).toBe(false);
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

  it("withholds level-gated pools until the character reaches them (Radiant Soul)", () => {
    const c = blank();
    c.class = [klass(OfficialClass.Fighter, 1)];
    syncRacePools(c, ["Radiant Soul"]);
    expect(titles(c)).toEqual([]);
    c.class[0].level = 3;
    syncRacePools(c, ["Radiant Soul"]);
    expect(pool(c, "Radiant Soul").recharge).toBe(RestType.longRest);
  });

  it("innate-spell hosts carry their own recharge (Firbolg Magic on a short rest)", () => {
    const c = blank();
    c.class = [klass(OfficialClass.Druid, 1)];
    syncRacePools(c, ["Firbolg Magic", "Hidden Step"]);
    expect(titles(c)).toEqual(
      expect.arrayContaining(["Detect Magic", "Disguise Self", "Hidden Step"]),
    );
    expect(pool(c, "Detect Magic").recharge).toBe(RestType.shortRest);
    expect(pool(c, "Hidden Step").recharge).toBe(RestType.shortRest);
  });

  it("unlocks innate tiers as total level rises (Githyanki Psionics)", () => {
    const c = blank();
    c.class = [klass(OfficialClass.Fighter, 1)];
    syncRacePools(c, ["Githyanki Psionics"]);
    expect(titles(c)).toEqual(["Mage Hand"]);
    expect(pool(c, "Mage Hand").maxUses).toBe(0); // at will
    c.class[0].level = 5;
    syncRacePools(c, ["Githyanki Psionics", ...titles(c)]);
    expect(titles(c)).toEqual(
      expect.arrayContaining(["Mage Hand", "Jump", "Misty Step"]),
    );
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

  it("Lore bard gets Cutting Words as a cross-pool action host at 3rd", () => {
    let c = level1("bard");
    for (const level of [2, 3])
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Bard as string,
        ...(level === 3 ? { subclass: "Lore" } : {}),
      });
    const cw = pool(c, "Cutting Words");
    // An action-only host: it owns no charges of its own.
    expect(calculateCustomFormula(cw.maxUses, c)).toBe(0);
    const spend = mechanicsForAbility(cw)?.actions?.[0].effects.find(
      (e) => e.effect === "spendUses",
    );
    // Its spend drains the shared Bardic Inspiration pool, not itself.
    expect(spend && "pool" in spend && spend.pool).toBe("Bardic Inspiration");
    // And it isn't also a prose feature row (would double it on the sheet).
    expect(c.features.map((f) => f.title)).not.toContain("Cutting Words");
  });

  it("every action-host pool (maxUses 0) carries an action, and any spend names another pool", () => {
    // A spend with no `pool` would silently drain the empty host itself.
    for (const [subclass, defs] of Object.entries(SUBCLASS_POOLS))
      for (const def of defs) {
        const k = klass(OfficialClass.Bard, 20);
        if (calculateCustomFormula(def.maxUses(k), blank()) !== 0) continue;
        const actions = def.mechanics?.(k)?.actions ?? [];
        expect(actions.length, `${subclass} / ${def.title}`).toBeGreaterThan(0);
        for (const effect of actions.flatMap((a) => a.effects))
          if (effect.effect === "spendUses")
            expect(
              "pool" in effect && effect.pool,
              `${subclass} / ${def.title}`,
            ).toBeTruthy();
      }
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
    expect(leveled.features.map((f) => f.title)).toContain("Bonus Cantrip");

    // Circle Spells is a 3rd-level feature, so it arrives a level *after* the
    // circle is chosen — which is what the subclass level table is for.
    const third = applyLevelUp(leveled, {
      ...defaultLevelUpState(leveled),
      className: OfficialClass.Druid as string,
    });
    expect(third.features.map((f) => f.title)).toContain("Circle Spells");
  });

  it("a Land druid's terrain sub-choice grants circle spells that grow with level", () => {
    const spellTitles = (c: Character) =>
      Object.values(c.spells)
        .flat()
        .map((s) => s.info.title.toLowerCase());
    let c = level1("druid");
    // 2nd: choose Circle of the Land. 3rd: choose the terrain (Forest).
    c = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Druid as string,
      subclass: "Land",
    });
    c = applyLevelUp(c, {
      ...defaultLevelUpState(c),
      className: OfficialClass.Druid as string,
      chosenOptions: { landTerrain: ["Forest"] },
    });
    // The two 3rd-level Forest spells are now in the spellbook…
    expect(spellTitles(c)).toContain("barkskin");
    expect(spellTitles(c)).toContain("spider climb");
    // …but not yet a 5th-level-tier one.
    expect(spellTitles(c)).not.toContain("call lightning");

    // Level to 5th: the next tier unlocks, and nothing is duplicated.
    for (let i = 0; i < 2; i++)
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Druid as string,
      });
    expect(spellTitles(c)).toContain("call lightning");
    expect(spellTitles(c).filter((t) => t === "barkskin")).toHaveLength(1);
  });

  it("wires a monk subclass Ki spender as a cross-pool host draining Ki", () => {
    let c = level1("monk");
    for (const level of [2, 3])
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Monk as string,
        ...(level === 3 ? { subclass: "Shadow" } : {}),
      });
    const spend = mechanicsForAbility(
      pool(c, "Shadow Arts"),
    )?.actions?.[0].effects.find((e) => e.effect === "spendUses");
    expect(spend && "pool" in spend && spend.pool).toBe("Ki");
    expect(c.features.map((f) => f.title)).not.toContain("Shadow Arts");
  });

  it("wires a cleric domain's Channel Divinity option to drain Channel Divinity", () => {
    // The domain's Channel Divinity option arrives with Channel Divinity itself,
    // at cleric 2.
    const c = applyLevelUp(level1("cleric", { subclass: "Light" }), {
      ...defaultLevelUpState(level1("cleric", { subclass: "Light" })),
      className: OfficialClass.Cleric as string,
    });
    const host = pool(c, "Channel Divinity: Radiance of the Dawn");
    const spend = mechanicsForAbility(host)?.actions?.[0].effects.find(
      (e) => e.effect === "spendUses",
    );
    expect(spend && "pool" in spend && spend.pool).toBe("Channel Divinity");
  });

  it("a cleric's Channel Divinity turns undead, and says when it destroys them", () => {
    const c = blank();
    syncClassPools(c, klass(OfficialClass.Cleric, 2));
    const [turn, option] =
      mechanicsForAbility(pool(c, "Channel Divinity"))?.actions ?? [];
    // Turn Undead is base-class — every cleric owns it, so it can't live in
    // the subclass-keyed host registry with the domain options.
    expect(turn.name).toBe("Turn Undead");
    expect(turn.applies).toMatchObject({ name: "Turned", multi: true });
    expect(option.name).toBe("Use a domain option");
    // Destroy Undead arrives at 5 and its CR ceiling scales.
    const remindAt = (level: number) => {
      syncClassPools(c, klass(OfficialClass.Cleric, level));
      const [t] = mechanicsForAbility(pool(c, "Channel Divinity"))!.actions!;
      const remind = t.effects.find((e) => e.effect === "remind");
      return remind && "note" in remind ? remind.note : "";
    };
    expect(remindAt(2)).not.toContain("Destroy Undead");
    expect(remindAt(5)).toContain("CR 1/2 or lower");
    expect(remindAt(17)).toContain("CR 4 or lower");
  });

  it("a Totem Warrior's totem sub-choice grants the chosen totem's feature", () => {
    let c = level1("barbarian");
    for (const level of [2, 3])
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Barbarian as string,
        ...(level === 3
          ? {
              subclass: "Totem Warrior",
              chosenOptions: { totemSpirit: ["Bear"] },
            }
          : {}),
      });
    const titles = c.features.map((f) => f.title);
    expect(titles).toContain("Bear Totem Spirit");
    // Not the totem you didn't pick.
    expect(titles).not.toContain("Wolf Totem Spirit");
  });

  it("a Storm Herald's environment unlocks its aura features by level", () => {
    let c = level1("barbarian");
    const levelTo = (target: number, extra = {}) => {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Barbarian as string,
        ...extra,
      });
      expect(c.class[0].level).toBe(target);
    };
    levelTo(2);
    levelTo(3, {
      subclass: "Storm Herald",
      chosenOptions: { stormAura: ["Tundra"] },
    });
    // 3rd: the Tundra aura, and not another environment's.
    expect(c.features.map((f) => f.title)).toContain("Storm Aura (Tundra)");
    expect(c.features.map((f) => f.title)).not.toContain("Storm Aura (Desert)");
    // Storm Soul only unlocks at 6th.
    expect(c.features.map((f) => f.title)).not.toContain("Storm Soul (Tundra)");
    for (let l = 4; l <= 6; l++) levelTo(l);
    expect(c.features.map((f) => f.title)).toContain("Storm Soul (Tundra)");
  });

  it("an Armorer's model grants only the chosen model's features", () => {
    let c = level1("artificer");
    for (const level of [2, 3])
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Artificer as string,
        ...(level === 3
          ? { subclass: "Armorer", chosenOptions: { armorModel: ["Guardian"] } }
          : {}),
      });
    const titles = c.features.map((f) => f.title);
    expect(titles).toContain("Guardian Armor");
    expect(titles).not.toContain("Infiltrator Armor");
  });

  it("a Genie warlock's kind grants its spell and Genie's Wrath at 1st, resistance at 6th", () => {
    const c = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "warlock",
      subclass: "Genie",
      scoreMethod: "manual",
      baseStats: { str: 8, dex: 13, con: 14, int: 10, wis: 12, cha: 15 },
      chosenOptions: { genieKind: ["Djinni"] },
    });
    // Elemental Gift's resistance is a 6th-level feature — not granted at 1st.
    expect(c.damageModifiers?.resistances).not.toContain("Thunder");
    expect(c.features.map((f) => f.title)).toContain("Genie's Wrath");
    expect(
      Object.values(c.spells)
        .flat()
        .map((s) => s.info.title.toLowerCase()),
    ).toContain("thunderwave");
    // At 6th warlock level the kind's resistance lands.
    const w6 = {
      ...c,
      class: c.class.map((k) =>
        k.name === "Warlock" ? { ...k, level: 6 } : k,
      ),
    };
    expect(resistancesFromOptions(w6.chosenOptions ?? [], w6)).toContain(
      "Thunder",
    );
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
    const save = ridersFor(c, "save");
    expect(attack.some((r) => r.source === "Reckless Attack")).toBe(true);
    // Danger Sense is a save rider now that saves are their own kind.
    expect(save.some((r) => r.source === "Danger Sense")).toBe(true);
    expect(check.some((r) => r.source === "Danger Sense")).toBe(false);
    // Rage's Strength advantage is advisory on both checks and saves.
    expect(check.some((r) => r.source === "Rage")).toBe(true);
    expect(save.some((r) => r.source === "Rage")).toBe(true);
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
    // Its Channel Divinity option is now a cross-pool action host, not a prose
    // feature — it drains the shared Channel Divinity pool.
    expect(titles(c)).toContain("Channel Divinity: Sacred Weapon");
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

  it("grants a subclass's by-level spells as the class levels (Devotion oath)", () => {
    const spellNames = (c: Character) =>
      Object.values(c.spells)
        .flat()
        .map((s) => s.info.title.toLowerCase());
    let c = level1("paladin");
    // 2nd (subclass choice), then up to 5th.
    for (const level of [2, 3, 4, 5])
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Paladin as string,
        ...(level === 3 ? { subclass: "Devotion" } : {}),
      });
    // 3rd-level oath spells (choice-level grant) and the 5th-level tier are in;
    // the 9th-level tier is not yet.
    expect(spellNames(c)).toContain("sanctuary");
    expect(spellNames(c)).toContain("zone of truth");
    expect(spellNames(c)).not.toContain("beacon of hope");

    // Level to 9th: the next tier unlocks, without duplicating earlier ones.
    for (let l = 6; l <= 9; l++)
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Paladin as string,
      });
    expect(spellNames(c)).toContain("beacon of hope");
    expect(spellNames(c).filter((n) => n === "zone of truth")).toHaveLength(1);
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
    expect(titles(c)).toContain("Channel Divinity: Vow of Enmity");
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

// Pool-less at-will features: no charges of their own, no shared pool to
// drain, just a level-scaled die.
describe("at-will action hosts", () => {
  // Build at level 1 and advance, so the result reflects what a real sheet
  // gets: pools synced *and* the feature prose the same levels grant.
  const levelTo = (classIndex: string, to: number): Character => {
    let c = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex,
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    });
    for (let next = 2; next <= to; next++)
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: c.class[0].name,
      });
    return c;
  };

  const hostIn = (c: Character, title: string) =>
    c.limitedUseAbilities.find((a) => a.info.title === title);

  it("grants a bard Song of Rest as an action host, not prose", () => {
    const c = levelTo("bard", 2);
    const host = hostIn(c, "Song of Rest");
    expect(host).toBeDefined();
    expect(calculateCustomFormula(host!.maxUses, c)).toBe(0);
    expect(c.features.map((f) => f.title)).not.toContain("Song of Rest");
  });

  it("scales the Song of Rest die with bard level", () => {
    // The die sits at index 1 of the roll effect's [count, die, roll] tuple.
    const dieAt = (level: number) => {
      const roll = mechanicsForAbility(
        hostIn(levelTo("bard", level), "Song of Rest")!,
      )?.actions?.[0].effects.find((e) => e.effect === "roll");
      return (roll as unknown as { amount: { fixed: [number, StandardDie] } })
        .amount.fixed[1];
    };
    expect([dieAt(2), dieAt(9), dieAt(13), dieAt(17)]).toEqual([
      StandardDie.d6,
      StandardDie.d8,
      StandardDie.d10,
      StandardDie.d12,
    ]);
  });

  it("spends nothing when used", () => {
    const c = levelTo("bard", 2);
    const effects =
      mechanicsForAbility(hostIn(c, "Song of Rest")!)?.actions?.[0].effects ??
      [];
    expect(effects.some((e) => e.effect === "spendUses")).toBe(false);
    expect(effects.some((e) => e.effect === "roll")).toBe(true);
  });

  it("grants a monk Deflect Missiles at 3rd, replacing the prose row", () => {
    expect(hostIn(levelTo("monk", 2), "Deflect Missiles")).toBeUndefined();
    const c = levelTo("monk", 3);
    expect(hostIn(c, "Deflect Missiles")).toBeDefined();
    expect(c.features.map((f) => f.title)).not.toContain("Deflect Missiles");
  });
});

describe("Wild Magic tables", () => {
  const withSubclass = (
    name: OfficialClass,
    level: number,
    features: string[],
  ): Character => {
    const c = structuredClone(defaultCharacter);
    c.class = [{ id: randomUUID(), name, level, subclass: "Wild Magic" }];
    c.features = features.map((title) => ({ title, titleFormulas: [] }));
    c.limitedUseAbilities = [];
    syncClassPools(c, c.class[0]);
    return c;
  };

  const poolTitles = (c: Character) =>
    c.limitedUseAbilities.map((a) => a.info.title);

  const tableOf = (c: Character, poolTitle: string) => {
    const pool = c.limitedUseAbilities.find((a) => a.info.title === poolTitle);
    const effects = pool?.mechanics?.actions?.[0]?.effects ?? [];
    const table = effects.find((e) => e.effect === "table");
    return table?.effect === "table" ? table : undefined;
  };

  it("covers every roll of the barbarian d8, with no gaps or overlaps", () => {
    const table = tableOf(
      withSubclass(OfficialClass.Barbarian, 3, ["Magic Awareness"]),
      "Wild Surge",
    );
    expect(table?.die).toBe(StandardDie.d8);
    expect(table?.rows.map((r) => r.upTo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("covers every roll of the sorcerer d100 in ascending pairs", () => {
    const table = tableOf(
      withSubclass(OfficialClass.Sorcerer, 1, ["Tides of Chaos"]),
      "Wild Magic Surge",
    );
    expect(table?.die).toEqual({ numFaces: 100 });
    expect(table?.rows).toHaveLength(50);
    expect(table?.rows.map((r) => r.upTo)).toEqual(
      Array.from({ length: 50 }, (_, i) => (i + 1) * 2),
    );
    for (const row of table!.rows) expect(row.note.length).toBeGreaterThan(0);
  });

  // Both classes have a subclass named "Wild Magic" and SUBCLASS_POOLS is
  // keyed by name alone, so each table has to be gated onto its own class.
  it("keeps each class's table off the other", () => {
    const barb = poolTitles(
      withSubclass(OfficialClass.Barbarian, 20, ["Magic Awareness"]),
    );
    const sorc = poolTitles(
      withSubclass(OfficialClass.Sorcerer, 20, ["Tides of Chaos"]),
    );

    expect(barb).toContain("Wild Surge");
    expect(barb).not.toContain("Wild Magic Surge");
    expect(sorc).toContain("Wild Magic Surge");
    expect(sorc).not.toContain("Wild Surge");
  });

  it("gives the barbarian Unstable Backlash only from 10th level", () => {
    const actions = (level: number) =>
      withSubclass(OfficialClass.Barbarian, level, ["Magic Awareness"])
        .limitedUseAbilities.find((a) => a.info.title === "Wild Surge")
        ?.mechanics?.actions?.map((a) => a.id) ?? [];
    expect(actions(9)).toEqual(["wild-surge"]);
    expect(actions(10)).toEqual(["wild-surge", "unstable-backlash"]);
  });
});
