import { describe, expect, it } from "vitest";
import { Operation } from "src/lib/data/data-definitions";
import {
  EQUIPMENT_CATALOG,
  armorWithBonus,
  buildCatalogAttack,
  catalogItemName,
  shieldWithBonus,
} from "./equipment-catalog";

const byName = (name: string) => {
  const entry = EQUIPMENT_CATALOG.find((e) => e.name === name);
  if (!entry) throw new Error(`${name} missing from catalog`);
  return entry;
};

describe("EQUIPMENT_CATALOG", () => {
  it("contains armor, a shield, and the SRD weapons", () => {
    expect(byName("Chain Mail").armor?.base).toBe(16);
    expect(byName("Shield").shield?.bonus).toBe(2);
    expect(byName("Longsword").weapon?.name).toBe("Longsword");
    expect(byName("Longbow").group).toBe("Martial Ranged Weapons");
  });

  it("carries a weight for every entry", () => {
    const weightless = EQUIPMENT_CATALOG.filter((e) => e.weight === undefined);
    expect(weightless.map((e) => e.name)).toEqual([]);
  });
});

describe("magic bonus helpers", () => {
  it("names the item with its bonus", () => {
    expect(catalogItemName(byName("Chain Mail"), 0)).toBe("Chain Mail");
    expect(catalogItemName(byName("Chain Mail"), 2)).toBe("Chain Mail +2");
  });

  it("raises armor base AC and shield bonus", () => {
    expect(armorWithBonus(byName("Chain Mail").armor!, 1).base).toBe(17);
    expect(shieldWithBonus(byName("Shield").shield!, 3).bonus).toBe(5);
  });

  it("builds a mundane attack untouched at +0", () => {
    const attack = buildCatalogAttack(byName("Longsword").weapon!, 0);
    expect(attack.name).toBe("Longsword");
    expect(attack.tags).toContain("versatile");
  });

  it("adds the bonus to both the attack roll and every damage type", () => {
    const attack = buildCatalogAttack(byName("Longsword").weapon!, 1);
    expect(attack.name).toBe("Longsword +1");
    expect(attack.bonus).toMatchObject({
      operation: Operation.addition,
      operands: [expect.anything(), 1],
    });
    for (const damage of Object.values(attack.formula)) {
      expect(damage).toMatchObject({
        operation: Operation.addition,
        operands: [expect.anything(), 1],
      });
    }
  });

  it("handles a weapon with no damage and no bonus formula gracefully", () => {
    // The Net: no damage dice at all. The +N must not invent a damage entry.
    const attack = buildCatalogAttack(byName("Net").weapon!, 1);
    expect(attack.name).toBe("Net +1");
    expect(Object.keys(attack.formula)).toEqual([]);
  });
});
