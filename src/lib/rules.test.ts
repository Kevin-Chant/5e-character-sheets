import { describe, expect, it } from "vitest";
import {
  OfficialClass,
  Operation,
  StandardDie,
  StatKey,
} from "./data/data-definitions";
import { defaultCharacter } from "./data/default-data";
import {
  availableSpellSlots,
  carryingCapacityLb,
  expendedSpellSlots,
  countAttunedItems,
  equippedArmorAC,
  formatWeight,
  getHpFormula,
  isPreparedCaster,
  maxSpellLevelForClass,
  officialSpellcastingClasses,
  remainingHitDice,
  saveDcFormula,
  totalEquipmentWeightLb,
  totalSpellSlots,
  weightInUnit,
  weightToLb,
} from "./rules";
import { Character, EquipmentItem } from "./types";
import {
  calculateCustomFormula,
  describeSaveEffect,
  formatSaveEffect,
} from "./formula";
import { randomUUID } from "src/lib/browser";

const wizard = (level: number): Character => {
  const c = structuredClone(defaultCharacter);
  const id = randomUUID();
  c.class = [{ id, name: OfficialClass.Wizard, level }];
  c.spellcastingClasses = [{ classId: id }];
  return c;
};

describe("saveDcFormula", () => {
  it("builds 8 + PB + ability, and resolves to the 5e DC", () => {
    const c = wizard(5); // PB +3
    c.stats.wis = 16; // +3
    const formula = saveDcFormula(StatKey.wis);
    expect(formula).toEqual({
      operation: Operation.addition,
      operands: [8, "proficiencyBonus", StatKey.wis],
    });
    expect(calculateCustomFormula(formula, c)).toBe(14);
  });

  it("takes the best of several abilities when the rule lets you choose", () => {
    const c = wizard(5); // PB +3
    c.stats.str = 12; // +1
    c.stats.dex = 18; // +4
    // A Battle Master's maneuver DC is "STR or DEX", so the higher one wins.
    expect(
      calculateCustomFormula(saveDcFormula([StatKey.str, StatKey.dex]), c),
    ).toBe(15);
  });

  it("re-derives on a level-up instead of going stale", () => {
    const c = wizard(4); // PB +2
    c.stats.wis = 16; // +3
    const formula = saveDcFormula(StatKey.wis);
    expect(calculateCustomFormula(formula, c)).toBe(13);
    c.class[0].level = 5; // PB +3
    expect(calculateCustomFormula(formula, c)).toBe(14);
  });
});

describe("formatSaveEffect / describeSaveEffect", () => {
  const character = () => {
    const c = wizard(5); // PB +3
    c.stats.con = 16; // +3
    return c;
  };

  it("renders the DC with its ability, or bare when the ability varies", () => {
    const c = character();
    const dc = saveDcFormula(StatKey.con);
    expect(formatSaveEffect({ dc, stat: StatKey.dex }, c)).toBe("DC 14 DEX");
    expect(formatSaveEffect({ dc }, c)).toBe("DC 14");
  });

  it("describes what a success does, and any advisory note", () => {
    const c = character();
    const dc = saveDcFormula(StatKey.con);
    expect(
      describeSaveEffect({ dc, stat: StatKey.dex, onSuccess: "half" }, c),
    ).toBe("DC 14 DEX saving throw — half damage on a success");
    expect(describeSaveEffect({ dc, onSuccess: "none" }, c)).toBe(
      "DC 14 saving throw — no damage on a success",
    );
    // A save with no damage to scale is all note.
    expect(describeSaveEffect({ dc, note: "Stunned on a failure." }, c)).toBe(
      "DC 14 saving throw — Stunned on a failure.",
    );
  });
});

describe("isPreparedCaster", () => {
  it("is true for prepared casters", () => {
    expect(isPreparedCaster(OfficialClass.Cleric)).toBe(true);
    expect(isPreparedCaster(OfficialClass.Wizard)).toBe(true);
    expect(isPreparedCaster(OfficialClass.Paladin)).toBe(true);
  });

  it("is false for known casters and custom classes", () => {
    expect(isPreparedCaster(OfficialClass.Sorcerer)).toBe(false);
    expect(isPreparedCaster(OfficialClass.Bard)).toBe(false);
    expect(isPreparedCaster(OfficialClass.Warlock)).toBe(false);
    expect(isPreparedCaster("Homebrew Mage")).toBe(false);
  });
});

describe("getHpFormula", () => {
  it("falls back to 0 for a classless (blank) character", () => {
    const c = structuredClone(defaultCharacter);
    c.class = [];
    expect(getHpFormula(c)).toBe(0);
  });
});

describe("officialSpellcastingClasses", () => {
  it("keeps only official spellcasting classes", () => {
    const c = wizard(9);
    // First entry resolves to the character's Wizard class; the second references
    // no class on the sheet, so it resolves to nothing and is filtered out.
    c.spellcastingClasses = [
      { classId: c.class[0].id },
      { classId: randomUUID() },
    ];
    expect(officialSpellcastingClasses(c)).toEqual([OfficialClass.Wizard]);
  });
});

describe("remainingHitDice", () => {
  it("is total (from the override) minus expended, floored at 0", () => {
    const c = structuredClone(defaultCharacter);
    c.totalHitDice = { d10: 3 };
    c.expendedHitDice = { d10: 1 };
    expect(remainingHitDice(c, StandardDie.d10)).toBe(2);
    c.expendedHitDice = { d10: 5 };
    expect(remainingHitDice(c, StandardDie.d10)).toBe(0);
    expect(remainingHitDice(c, StandardDie.d6)).toBe(0);
  });

  it("derives totals from class levels when no override is set", () => {
    const c = wizard(4); // 4 × d6
    c.totalHitDice = undefined;
    c.expendedHitDice = { d6: 1 };
    expect(remainingHitDice(c, StandardDie.d6)).toBe(3);
  });
});

describe("maxSpellLevelForClass", () => {
  const k = (name: OfficialClass, level: number, subclass?: string) => ({
    id: randomUUID(),
    name,
    level,
    subclass,
  });

  it("full casters follow their own single-class table", () => {
    expect(maxSpellLevelForClass(k(OfficialClass.Wizard, 1))).toBe(1);
    expect(maxSpellLevelForClass(k(OfficialClass.Wizard, 3))).toBe(2);
    expect(maxSpellLevelForClass(k(OfficialClass.Wizard, 17))).toBe(9);
  });

  it("half-casters round up (a single-classed paladin 9 casts 3rd)", () => {
    expect(maxSpellLevelForClass(k(OfficialClass.Paladin, 1))).toBe(0);
    expect(maxSpellLevelForClass(k(OfficialClass.Paladin, 2))).toBe(1);
    expect(maxSpellLevelForClass(k(OfficialClass.Paladin, 4))).toBe(1);
    expect(maxSpellLevelForClass(k(OfficialClass.Paladin, 5))).toBe(2);
    expect(maxSpellLevelForClass(k(OfficialClass.Paladin, 9))).toBe(3);
  });

  it("warlocks gate on their own pact-slot level", () => {
    expect(maxSpellLevelForClass(k(OfficialClass.Warlock, 1))).toBe(1);
    expect(maxSpellLevelForClass(k(OfficialClass.Warlock, 3))).toBe(2);
    expect(maxSpellLevelForClass(k(OfficialClass.Warlock, 11))).toBe(5);
  });

  it("non-casters and subclass casters", () => {
    expect(maxSpellLevelForClass(k(OfficialClass.Fighter, 10))).toBe(0);
    expect(
      maxSpellLevelForClass(k(OfficialClass.Fighter, 3, "Eldritch Knight")),
    ).toBe(1);
    expect(
      maxSpellLevelForClass(k(OfficialClass.Rogue, 3, "Arcane Trickster")),
    ).toBe(1);
    expect(maxSpellLevelForClass(k(OfficialClass.Barbarian, 20))).toBe(0);
  });
});

describe("availableSpellSlots", () => {
  it("is total minus expended, floored at 0", () => {
    const c = wizard(9);
    // A 9th-level wizard has three 3rd-level slots and no 6th-level slots.
    c.spellSlots[3].expended = 1;
    expect(availableSpellSlots(c, 3)).toBe(2);
    expect(availableSpellSlots(c, 6)).toBe(0);
  });

  it("respects a totalOverride", () => {
    const c = wizard(1);
    c.spellSlots[3].totalOverride = 5;
    c.spellSlots[3].expended = 2;
    expect(availableSpellSlots(c, 3)).toBe(3);
  });
});

const item = (partial: Partial<EquipmentItem>): EquipmentItem => ({
  id: randomUUID(),
  text: { title: "Item", titleFormulas: [] },
  quantity: 1,
  equipped: false,
  ...partial,
});

describe("countAttunedItems", () => {
  it("counts only items currently attuned", () => {
    expect(
      countAttunedItems([
        item({ attunement: { attuned: true } }),
        item({ attunement: { attuned: false } }), // requires attunement, not attuned
        item({ attunement: { attuned: true } }),
        item({}), // no attunement at all
      ]),
    ).toBe(2);
  });
});

describe("totalEquipmentWeightLb", () => {
  it("sums per-unit weight times quantity, ignoring weightless items", () => {
    expect(
      totalEquipmentWeightLb([
        item({ weight: 3, quantity: 2 }), // 6
        item({ weight: 10 }), // 10 (quantity defaults to 1)
        item({ quantity: 5 }), // no weight → 0
      ]),
    ).toBe(16);
  });
});

describe("carrying capacity", () => {
  it("is Strength score times 15 pounds", () => {
    expect(carryingCapacityLb(15)).toBe(225);
  });
});

describe("equippedArmorAC", () => {
  // DEX 20 → +5 modifier, so full-vs-capped-vs-none is clearly distinguishable.
  const withGear = (...equipment: EquipmentItem[]): Character => {
    const c = structuredClone(defaultCharacter);
    c.stats.dex = 20;
    c.equipment = equipment;
    return c;
  };
  const armorItem = (
    armor: EquipmentItem["armor"],
    equipped = true,
  ): EquipmentItem => item({ armor, equipped });
  const shieldItem = (bonus = 2, equipped = true): EquipmentItem =>
    item({ shield: { bonus }, equipped });

  it("falls back to 10 + DEX when no armor is equipped", () => {
    expect(equippedArmorAC(withGear())).toBe(15);
  });

  it("uses full DEX for light armor", () => {
    expect(
      equippedArmorAC(
        withGear(armorItem({ base: 12, category: "light", dex: "full" })),
      ),
    ).toBe(17); // 12 + 5
  });

  it("caps DEX for medium armor", () => {
    expect(
      equippedArmorAC(
        withGear(
          armorItem({ base: 14, category: "medium", dex: "capped", dexCap: 2 }),
        ),
      ),
    ).toBe(16); // 14 + min(5, 2)
  });

  it("ignores DEX for heavy armor and adds equipped shields", () => {
    expect(
      equippedArmorAC(
        withGear(
          armorItem({ base: 16, category: "heavy", dex: "none" }),
          shieldItem(2),
        ),
      ),
    ).toBe(18); // 16 + 0 + 2
  });

  it("honours a special medium armor that grants full DEX", () => {
    expect(
      equippedArmorAC(
        withGear(armorItem({ base: 13, category: "medium", dex: "full" })),
      ),
    ).toBe(18); // 13 + 5
  });

  it("ignores unequipped armor but still counts equipped shields", () => {
    expect(
      equippedArmorAC(
        withGear(
          armorItem({ base: 18, category: "heavy", dex: "none" }, false),
          shieldItem(2),
        ),
      ),
    ).toBe(17); // unarmored 10 + 5, + shield 2
  });

  it("takes the best AC when multiple armors are somehow equipped", () => {
    expect(
      equippedArmorAC(
        withGear(
          armorItem({ base: 11, category: "light", dex: "full" }), // 16
          armorItem({ base: 16, category: "heavy", dex: "none" }), // 16
          armorItem({ base: 14, category: "medium", dex: "capped" }), // 16
        ),
      ),
    ).toBe(16);
  });
});

describe("weight unit conversion", () => {
  it("round-trips lb → display unit → lb", () => {
    expect(weightToLb(weightInUnit(100, "lb"), "lb")).toBeCloseTo(100);
    expect(weightToLb(weightInUnit(100, "kg"), "kg")).toBeCloseTo(100, 1);
  });

  it("formats in the chosen unit", () => {
    expect(formatWeight(10, "lb")).toBe("10 lb");
    expect(formatWeight(2.2046226218, "kg")).toBe("1 kg");
  });
});

describe("spell slot accounting", () => {
  it("clamps a stored expended count that exceeds the total", () => {
    const c = wizard(9);
    // Spend all three 3rd-level slots, then lose the levels that granted them.
    c.spellSlots[3].expended = 3;
    expect(availableSpellSlots(c, 3)).toBe(0);
    c.spellSlots[3].totalOverride = 1;
    // The stored 3 is now impossible; reads clamp rather than going negative.
    expect(expendedSpellSlots(c, 3)).toBe(1);
    expect(availableSpellSlots(c, 3)).toBe(0);
  });

  it("recovers the stored value when the total goes back up", () => {
    const c = wizard(9);
    c.spellSlots[3].expended = 3;
    c.spellSlots[3].totalOverride = 1;
    expect(expendedSpellSlots(c, 3)).toBe(1);
    // Clamping is read-side only, so the original 3 is still there.
    c.spellSlots[3].totalOverride = undefined;
    expect(expendedSpellSlots(c, 3)).toBe(3);
  });

  it("floors a negative stored value at 0", () => {
    const c = wizard(9);
    c.spellSlots[3].expended = -2;
    expect(expendedSpellSlots(c, 3)).toBe(0);
    expect(availableSpellSlots(c, 3)).toBe(totalSpellSlots(c, 3));
  });
});
