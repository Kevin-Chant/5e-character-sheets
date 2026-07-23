import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import {
  DamageType,
  DieOperation,
  OfficialClass,
} from "src/lib/data/data-definitions";
import { rollD20Check } from "src/lib/roll";
import { Character, DieExpression } from "src/lib/types";
import {
  adjustDieRoll,
  applyTotalRiders,
  critThreshold,
  extraDamageRiders,
  flatBonusRiders,
  hitDieHealing,
  riderFlatBonus,
  riderMinimumTotal,
  ridersFor,
} from "./riders";
import { ActiveRider } from "./types";

// A single-class character at a given level, for the level-scaled damage riders.
const asClass = (name: OfficialClass, level: number): Character => {
  const c = structuredClone(defaultCharacter);
  c.class = [{ id: "00000000-0000-0000-0000-000000000001", name, level }];
  return c;
};

const withFeatures = (...titles: string[]): Character => {
  const c = structuredClone(defaultCharacter);
  c.features = titles.map((title) => ({ title, titleFormulas: [] }));
  return c;
};

afterEach(() => vi.restoreAllMocks());

describe("ridersFor", () => {
  it("collects riders from feature titles, filtered by roll kind", () => {
    const c = withFeatures("Durable", "Great Weapon Fighting");
    expect(ridersFor(c, "hitDie").map((r) => r.rider.rider)).toEqual([
      "minimumTotal",
    ]);
    expect(ridersFor(c, "damage").map((r) => r.rider.rider)).toEqual([
      "rerollBelow",
    ]);
    expect(ridersFor(c, "check")).toEqual([]);
  });

  it("matches titles case-insensitively with padding", () => {
    const c = withFeatures("  dUrAbLe ");
    expect(ridersFor(c, "hitDie")).toHaveLength(1);
  });

  it("collects riders from limited-use ability titles", () => {
    const c = withFeatures();
    c.limitedUseAbilities = [
      {
        info: { title: "Improved Critical", titleFormulas: [] },
        maxUses: 1,
        recharge: "long",
        expended: 0,
      },
    ];
    expect(critThreshold(ridersFor(c, "attack"))).toBe(19);
  });

  it("collects race-keyed riders by substring (Halfling Luck)", () => {
    const c = withFeatures();
    c.race.name = "Lightfoot Halfling";
    const riders = ridersFor(c, "attack");
    expect(riders).toHaveLength(1);
    expect(riders[0].rider).toEqual({ rider: "rerollBelow", threshold: 1 });
    // Damage rolls are unaffected.
    expect(ridersFor(c, "damage")).toEqual([]);
  });
});

describe("adjustDieRoll", () => {
  const reroll = (r: ActiveRider["rider"]): ActiveRider[] => [
    { source: "test", rider: r },
  ];

  it("rerolls at or below the threshold once, keeping the new roll", () => {
    const riders = reroll({ rider: "rerollBelow", threshold: 2 });
    expect(adjustDieRoll(2, riders, () => 1)).toBe(1); // must keep the new roll
    expect(adjustDieRoll(2, riders, () => 6)).toBe(6);
    expect(adjustDieRoll(3, riders, () => 6)).toBe(3); // above threshold: no reroll
  });

  it("floors individual dice at the minimum-die value", () => {
    const riders = reroll({ rider: "minimumDie", value: 10 });
    expect(
      adjustDieRoll(4, riders, () => {
        throw new Error("no reroll expected");
      }),
    ).toBe(10);
    expect(adjustDieRoll(15, riders, () => 0)).toBe(15);
  });

  it("applies reroll first, then the die floor", () => {
    const riders = [
      ...reroll({ rider: "rerollBelow", threshold: 1 }),
      ...reroll({ rider: "minimumDie", value: 10 }),
    ];
    expect(adjustDieRoll(1, riders, () => 4)).toBe(10);
  });
});

describe("total riders", () => {
  it("minimumTotal takes the highest applicable floor", () => {
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "minimumTotal", value: 3 } },
      { source: "b", rider: { rider: "minimumTotal", value: 6 } },
    ];
    const c = structuredClone(defaultCharacter);
    expect(riderMinimumTotal(riders, c)).toBe(6);
    expect(applyTotalRiders(4, riders, c)).toBe(6);
    expect(applyTotalRiders(9, riders, c)).toBe(9);
  });

  it("bonus riders add to the total after the floor", () => {
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "minimumTotal", value: 5 } },
      { source: "b", rider: { rider: "bonus", value: 2 } },
    ];
    expect(applyTotalRiders(1, riders, structuredClone(defaultCharacter))).toBe(
      7,
    );
  });

  it("an opt-in bonus never folds silently", () => {
    const riders: ActiveRider[] = [
      { source: "always", rider: { rider: "bonus", value: 2 } },
      {
        source: "conditional",
        rider: { rider: "bonus", value: 5, optional: true, note: "if…" },
      },
    ];
    const c = structuredClone(defaultCharacter);
    // Only the unconditional one lands in the fold …
    expect(applyTotalRiders(10, riders, c)).toBe(12);
    // … while the split hands the other to the dialog to offer.
    const { always, optional } = flatBonusRiders(riders);
    expect(always.map((r) => r.source)).toEqual(["always"]);
    expect(optional.map((r) => r.source)).toEqual(["conditional"]);
    // Summing an explicitly-chosen set does include it.
    expect(riderFlatBonus([...always, ...optional], c)).toBe(7);
  });
});

describe("fighting style numerics", () => {
  it("Archery offers an opt-in +2 on attack rolls only", () => {
    const c = withFeatures("Archery");
    const { always, optional } = flatBonusRiders(ridersFor(c, "attack"));
    expect(always).toHaveLength(0);
    expect(optional).toHaveLength(1);
    expect(optional[0].rider.value).toBe(2);
    expect(optional[0].rider.note).toBe("ranged weapons only");
    // Not a damage or check rider.
    expect(flatBonusRiders(ridersFor(c, "damage")).optional).toHaveLength(0);
    expect(flatBonusRiders(ridersFor(c, "check")).optional).toHaveLength(0);
  });

  it("Dueling is an opt-in flat +2 of extra damage", () => {
    const c = withFeatures("Dueling");
    const extras = extraDamageRiders(c).filter((r) => r.source === "Dueling");
    expect(extras).toHaveLength(1);
    const rider = extras[0].rider as Extract<
      (typeof extras)[0]["rider"],
      { rider: "extraDamage" }
    >;
    expect(rider.amount).toBe(2);
    expect(rider.optional).toBe(true);
    expect(rider.declareAt).toBe("on-hit");
  });
});

describe("critThreshold", () => {
  it("defaults to 20 and takes the widest range", () => {
    expect(critThreshold([])).toBe(20);
    const riders: ActiveRider[] = [
      { source: "a", rider: { rider: "critRange", value: 19 } },
      { source: "b", rider: { rider: "critRange", value: 18 } },
    ];
    expect(critThreshold(riders)).toBe(18);
  });
});

describe("hitDieHealing", () => {
  const withDurable = (con: number): Character => {
    const c = withFeatures("Durable");
    c.stats.con = con;
    return c;
  };

  it("matches the rolled total without Durable, floored at 0", () => {
    const c = withFeatures();
    expect(hitDieHealing(c, 7)).toBe(7);
    // A bad roll with a negative CON modifier can't damage you.
    expect(hitDieHealing(c, -1)).toBe(0);
  });

  it("applies Durable's minimum of twice the CON modifier", () => {
    const c = withDurable(16); // +3 → minimum 6
    expect(hitDieHealing(c, 4)).toBe(6);
    expect(hitDieHealing(c, 9)).toBe(9);
  });

  it("Durable's floor is itself at least 2, even with low CON", () => {
    const c = withDurable(8); // -1 → 2×mod is -2, floor stays 2
    expect(hitDieHealing(c, 1)).toBe(2);
  });
});

describe("rollD20Check with riders", () => {
  it("Halfling Luck rerolls a natural 1", () => {
    const c = structuredClone(defaultCharacter);
    c.race.name = "Stout Halfling";
    // First d20 rolls a 1, the reroll comes up 18.
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0) // → 1
      .mockReturnValueOnce(0.85); // → 18
    const result = rollD20Check(3, "normal", ridersFor(c, "check"));
    expect(result.kept).toBe(18);
    expect(result.total).toBe(21);
  });

  it("Reliable Talent floors the d20 at 10", () => {
    const c = structuredClone(defaultCharacter);
    c.features = [{ title: "Reliable Talent", titleFormulas: [] }];
    vi.spyOn(Math, "random").mockReturnValueOnce(0.2); // → 5
    const result = rollD20Check(0, "normal", ridersFor(c, "check"));
    expect(result.kept).toBe(10);
  });
});

describe("extraDamageRiders", () => {
  // The dice count is the first element of the DieExpression tuple.
  const diceCount = (r: ActiveRider): number =>
    (r.rider as { amount: DieExpression }).amount[0];

  it("has none for a character with no qualifying class", () => {
    // A wizard has no Sneak Attack / Rage damage / Divine Smite.
    expect(extraDamageRiders(asClass(OfficialClass.Wizard, 10))).toEqual([]);
  });

  it("scales Sneak Attack dice as ceil(rogue level / 2)", () => {
    const sneak = (level: number) => {
      const [r] = extraDamageRiders(asClass(OfficialClass.Rogue, level));
      expect(r.source).toBe("Sneak Attack");
      return diceCount(r);
    };
    expect(sneak(1)).toBe(1);
    expect(sneak(5)).toBe(3);
    expect(sneak(11)).toBe(6);
    expect(sneak(20)).toBe(10);
  });

  it("marks Sneak Attack opt-in, once per turn, declared on hit", () => {
    const [r] = extraDamageRiders(asClass(OfficialClass.Rogue, 3));
    expect(r.rider).toMatchObject({
      rider: "extraDamage",
      declareAt: "on-hit",
      optional: true,
      oncePerTurn: true,
    });
  });

  it("scales Rage damage +2/+3/+4 by barbarian level, always-on", () => {
    const rage = (level: number) => {
      const [r] = extraDamageRiders(asClass(OfficialClass.Barbarian, level));
      expect(r.source).toBe("Rage");
      expect(r.rider).toMatchObject({ declareAt: "on-hit" });
      expect((r.rider as { optional?: boolean }).optional).toBeUndefined();
      return (r.rider as { amount: number }).amount;
    };
    expect(rage(2)).toBe(2);
    expect(rage(9)).toBe(3);
    expect(rage(16)).toBe(4);
  });

  it("grants Divine Smite as a slot-powered rider at paladin 2, not 1", () => {
    expect(extraDamageRiders(asClass(OfficialClass.Paladin, 1))).toEqual([]);
    const [r] = extraDamageRiders(asClass(OfficialClass.Paladin, 2));
    expect(r.source).toBe("Divine Smite");
    expect(r.rider).toMatchObject({
      rider: "extraDamage",
      declareAt: "on-hit",
      optional: true,
      damageType: DamageType.Radiant,
      slot: { minLevel: 1, diceAtMin: 2, maxDice: 5 },
    });
    // No oncePerTurn — you may smite on each hit, slots permitting.
    expect((r.rider as { oncePerTurn?: boolean }).oncePerTurn).toBeUndefined();
  });

  it("collects authored extraDamage riders from a limited-use ability", () => {
    const c = asClass(OfficialClass.Fighter, 5);
    c.limitedUseAbilities = [
      {
        info: { title: "Homebrew Strike", titleFormulas: [] },
        maxUses: 1,
        expended: 0,
        recharge: "shortRest",
        mechanics: {
          riders: [
            {
              appliesTo: ["attack"],
              rider: {
                rider: "extraDamage",
                amount: [2, "d6", "roll"] as DieExpression,
                declareAt: "on-hit",
                damageType: DamageType.Fire,
              },
            },
          ],
        },
      },
    ] as Character["limitedUseAbilities"];
    const riders = extraDamageRiders(c);
    expect(riders).toHaveLength(1);
    expect(riders[0].source).toBe("Homebrew Strike");
    expect(diceCount(riders[0])).toBe(2);
  });
});

describe("Divine Strike", () => {
  const cleric = (level: number, subclass?: string): Character => {
    const c = asClass(OfficialClass.Cleric, level);
    c.class[0].subclass = subclass;
    return c;
  };
  const strikeOf = (c: Character) =>
    extraDamageRiders(c).find((r) => r.source === "Divine Strike")?.rider as
      | Extract<ActiveRider["rider"], { rider: "extraDamage" }>
      | undefined;

  it("appears at 8th and doubles its die at 14th", () => {
    expect(strikeOf(cleric(7, "Life"))).toBeUndefined();
    expect(strikeOf(cleric(8, "Life"))?.amount).toEqual([
      1,
      "d8",
      DieOperation.roll,
    ]);
    expect(strikeOf(cleric(14, "Life"))?.amount).toEqual([
      2,
      "d8",
      DieOperation.roll,
    ]);
  });

  it("takes its damage type from the domain", () => {
    expect(strikeOf(cleric(8, "Life"))?.damageType).toBe(DamageType.Radiant);
    expect(strikeOf(cleric(8, "Tempest"))?.damageType).toBe(DamageType.Thunder);
    expect(strikeOf(cleric(8, "Trickery"))?.damageType).toBe(DamageType.Poison);
  });

  it("leaves War and Nature untyped — weapon's type / player's choice", () => {
    expect(strikeOf(cleric(8, "War"))?.damageType).toBeUndefined();
    expect(strikeOf(cleric(8, "Nature"))?.damageType).toBeUndefined();
    expect(strikeOf(cleric(8, "Nature"))?.note).toContain("cold, fire, or");
  });

  it("is absent for domains that get Potent Spellcasting instead", () => {
    for (const domain of ["Knowledge", "Light", "Grave", "Peace", "Arcana"])
      expect(strikeOf(cleric(20, domain)), domain).toBeUndefined();
    // …and for a cleric who hasn't chosen a domain at all.
    expect(strikeOf(cleric(20))).toBeUndefined();
  });
});

describe("Foe Slayer", () => {
  it("offers the WIS bonus on both the attack roll and the damage", () => {
    const c = withFeatures("Foe Slayer");
    const onAttack = flatBonusRiders(ridersFor(c, "attack")).optional;
    expect(onAttack).toHaveLength(1);
    expect(onAttack[0].rider.value).toBe("wis");
    const onDamage = extraDamageRiders(c).filter(
      (r) => r.source === "Foe Slayer",
    );
    expect(onDamage).toHaveLength(1);
    // Both opt-in: the sheet can't tell which one the player is spending.
    expect(
      (
        onDamage[0].rider as Extract<
          ActiveRider["rider"],
          { rider: "extraDamage" }
        >
      ).optional,
    ).toBe(true);
  });
});
