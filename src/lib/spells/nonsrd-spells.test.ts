import { describe, expect, it } from "vitest";
import { NONSRD_SPELLS } from "src/lib/data/nonsrd-spells";
import { ALL_SPELLS, SRD_SPELLS, getSrdSpell } from "src/lib/spells/srd-spells";

// Integrity guards for the hand-authored non-SRD catalog. These catch the
// mechanical mistakes an authoring pass is prone to — a duplicate/colliding
// index, a missing required fact, an out-of-range level — at CI time. The
// *content* (are the mechanics faithful, is the prose original) is checked by a
// separate verification pass, not here.

const KNOWN_CLASSES = new Set([
  "Artificer",
  "Bard",
  "Cleric",
  "Druid",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
  "Wizard",
]);

describe("the non-SRD spell catalog", () => {
  it("has a unique index that never collides with an SRD spell", () => {
    const srdIndices = new Set(SRD_SPELLS.map((s) => s.index));
    const seen = new Set<string>();
    for (const s of NONSRD_SPELLS) {
      expect(srdIndices, `${s.name} collides with an SRD index`).not.toContain(
        s.index,
      );
      expect(seen, `${s.name} duplicated`).not.toContain(s.index);
      seen.add(s.index);
    }
  });

  it("derives each index from the name as a slug", () => {
    for (const s of NONSRD_SPELLS) {
      const slug = s.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      expect(s.index, s.name).toBe(slug);
    }
  });

  it("gives every spell the required mechanical facts", () => {
    for (const s of NONSRD_SPELLS) {
      expect(s.name.length, "name").toBeGreaterThan(0);
      expect(s.level, `${s.name} level`).toBeGreaterThanOrEqual(0);
      expect(s.level, `${s.name} level`).toBeLessThanOrEqual(9);
      expect(s.school.length, `${s.name} school`).toBeGreaterThan(0);
      expect(s.castingTime.length, `${s.name} castingTime`).toBeGreaterThan(0);
      expect(s.range.length, `${s.name} range`).toBeGreaterThan(0);
      expect(s.duration.length, `${s.name} duration`).toBeGreaterThan(0);
      expect(s.desc.trim().length, `${s.name} desc`).toBeGreaterThan(0);
      expect(s.classes.length, `${s.name} has no classes`).toBeGreaterThan(0);
      for (const c of s.classes)
        expect(KNOWN_CLASSES, `${s.name}: unknown class ${c}`).toContain(c);
    }
  });

  it("is reachable through the merged catalog by index", () => {
    for (const s of NONSRD_SPELLS)
      expect(getSrdSpell(s.index), s.name)?.toBeDefined();
    expect(ALL_SPELLS.length).toBe(SRD_SPELLS.length + NONSRD_SPELLS.length);
  });
});
