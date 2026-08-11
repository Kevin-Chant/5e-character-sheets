import { describe, expect, it } from "vitest";
import { SUBCLASS_FEATURES } from "src/lib/data/subclass-features";
import {
  SUBCLASSES,
  getSubclassByName,
  subclassFeaturesAt,
} from "src/lib/builder/subclasses";
import { CLASS_POOLS, SUBCLASS_POOLS } from "src/lib/builder/class-pools";
import { CLASS_FEATURES } from "src/lib/builder/class-features";
import { OfficialClass } from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { defaultBuilderState } from "src/lib/builder/types";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";

// Subclass feature tables are keyed by subclass name and merged onto the
// catalog in `subclasses.ts`; a typo in either key silently resolves to
// nothing, so the join is what these tests guard.

const norm = (s: string) => s.trim().toLowerCase();

describe("subclass feature tables", () => {
  it("keys every table by a class index the catalog knows", () => {
    const known = new Set(SUBCLASSES.map((s) => s.classIndex));
    for (const classIndex of Object.keys(SUBCLASS_FEATURES))
      expect(known, `unknown class index "${classIndex}"`).toContain(
        classIndex,
      );
  });

  it("keys every entry by a subclass that exists in that class", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_FEATURES))
      for (const name of Object.keys(table))
        expect(
          getSubclassByName(classIndex, name),
          `${classIndex}: no subclass named "${name}"`,
        ).toBeDefined();
  });

  it("attaches the tables to the catalog entries", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_FEATURES))
      for (const [name, levels] of Object.entries(table))
        for (const level of Object.keys(levels))
          expect(
            subclassFeaturesAt(classIndex, name, Number(level)),
            `${classIndex}/${name}/${level} did not reach the catalog`,
          ).toEqual(levels[Number(level)]);
  });

  it("gives every feature a title and a non-empty detail", () => {
    for (const table of Object.values(SUBCLASS_FEATURES))
      for (const levels of Object.values(table))
        for (const features of Object.values(levels))
          for (const f of features) {
            expect(f.title.trim().length).toBeGreaterThan(0);
            expect(f.detail.trim().length).toBeGreaterThan(0);
          }
  });

  it("uses levels within 1-20", () => {
    for (const table of Object.values(SUBCLASS_FEATURES))
      for (const levels of Object.values(table))
        for (const level of Object.keys(levels)) {
          expect(Number(level)).toBeGreaterThanOrEqual(1);
          expect(Number(level)).toBeLessThanOrEqual(20);
        }
  });

  it("grants a subclass feature at a level after the subclass was chosen", () => {
    let c = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "barbarian",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    });
    for (const level of [2, 3, 4, 5, 6]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Barbarian as string,
        ...(level === 3 ? { subclass: "Berserker" } : {}),
      });
    }
    const titles = c.features.map((f) => f.title);
    expect(titles).toContain("Frenzy");
    expect(titles).toContain("Mindless Rage");
  });

  it("does not grant a subclass's features to a different subclass", () => {
    let c = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "barbarian",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    });
    for (const level of [2, 3, 4, 5, 6]) {
      c = applyLevelUp(c, {
        ...defaultLevelUpState(c),
        className: OfficialClass.Barbarian as string,
        ...(level === 3 ? { subclass: "Zealot" } : {}),
      });
    }
    expect(c.features.map((f) => f.title)).not.toContain("Mindless Rage");
  });

  // Guards against a title already granted via a pool, base-class prose, or
  // the subclass's choice-level `grants` being listed twice.
  it("does not duplicate a title the class already grants", () => {
    for (const [classIndex, table] of Object.entries(SUBCLASS_FEATURES)) {
      const oc = Object.values(OfficialClass).find(
        (c) => norm(c) === classIndex,
      );
      const classGranted = new Set(
        [
          ...(CLASS_POOLS[oc as OfficialClass] ?? []).map((p) => p.title),
          ...Object.values(CLASS_FEATURES[oc as OfficialClass] ?? {})
            .flat()
            .map((f) => f.title),
        ].map(norm),
      );
      for (const [name, levels] of Object.entries(table)) {
        const granted = new Set([
          ...classGranted,
          ...(SUBCLASS_POOLS[name] ?? []).map((p) => norm(p.title)),
          ...(getSubclassByName(classIndex, name)?.grants?.features ?? []).map(
            (f) => norm(f.title),
          ),
        ]);
        for (const features of Object.values(levels))
          for (const f of features)
            expect(
              granted,
              `${classIndex}/${name}: "${f.title}" is already granted elsewhere`,
            ).not.toContain(norm(f.title));
      }
    }
  });
});
