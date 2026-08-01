import { describe, expect, it } from "vitest";
import { SUBCLASS_SPELLS } from "src/lib/data/subclass-spells";
import { getSubclassByName, subclassSpellIndicesAt } from "./subclasses";
import { getCatalogSpell } from "src/lib/spells/spell-catalog";

// The by-level subclass spell registry is keyed by subclass name and grants by
// spell index — a typo in either silently hands out nothing, so both joins are
// guarded here.

describe("subclass spell grants", () => {
  it("keys every entry by a subclass that exists in that class", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_SPELLS))
      for (const name of Object.keys(table))
        expect(
          getSubclassByName(classIndex, name),
          `${classIndex}: no subclass named "${name}"`,
        ).toBeDefined();
  });

  it("uses class levels within 1-20", () => {
    for (const table of Object.values(SUBCLASS_SPELLS))
      for (const levels of Object.values(table))
        for (const level of Object.keys(levels)) {
          expect(Number(level)).toBeGreaterThanOrEqual(1);
          expect(Number(level)).toBeLessThanOrEqual(20);
        }
  });

  it("grants only spell indices that resolve in the bundled catalog", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_SPELLS))
      for (const [name, levels] of Object.entries(table))
        for (const [level, indices] of Object.entries(levels))
          for (const index of indices)
            expect(
              getCatalogSpell(index),
              `${classIndex}/${name}/${level}: "${index}" is not in the catalog`,
            ).toBeDefined();
  });

  it("reaches the builder through subclassSpellIndicesAt, cumulatively", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_SPELLS))
      for (const [name, levels] of Object.entries(table)) {
        const maxLevel = Math.max(...Object.keys(levels).map(Number));
        const all = Object.values(levels).flat();
        const granted = subclassSpellIndicesAt(classIndex, name, maxLevel);
        for (const index of all)
          expect(granted, `${classIndex}/${name}`).toContain(index);
      }
  });
});
