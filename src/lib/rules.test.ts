import { describe, expect, it } from "vitest";
import { OfficialClass } from "./data/data-definitions";
import { defaultCharacter } from "./data/default-data";
import {
  availableSpellSlots,
  carryingCapacityLb,
  countAttunedItems,
  equippedArmorAC,
  formatWeight,
  getHpFormula,
  isPreparedCaster,
  officialSpellcastingClasses,
  totalEquipmentWeightLb,
  weightInUnit,
  weightToLb,
} from "./rules";
import { Character, EquipmentItem } from "./types";
import { randomUUID } from "src/lib/browser";

const wizard = (level: number): Character => {
  const c = structuredClone(defaultCharacter);
  const id = randomUUID();
  c.class = [{ id, name: OfficialClass.Wizard, level }];
  c.spellcastingClasses = [{ classId: id }];
  return c;
};

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
