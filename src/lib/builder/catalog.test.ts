import { describe, expect, it } from "vitest";
import {
  SUBCLASSES,
  getSubclassByName,
  subclassesForClass,
} from "src/lib/builder/subclasses";
import { SRD_CLASSES } from "src/lib/builder/srd-classes";
import { SRD_RACES, subracesForRace } from "src/lib/builder/srd-races";
import { getSrdSpell } from "src/lib/spells/srd-spells";

// The classes that actually choose a subclass at level 1 — the only ones whose
// subclasses may carry mechanical `grants` (the level-1 builder can't apply the
// rest).
const LEVEL_ONE_SUBCLASS_CLASSES = new Set(["cleric", "sorcerer", "warlock"]);

describe("subclass catalog", () => {
  const classIndices = new Set(SRD_CLASSES.map((c) => c.index));

  it("returns a class's subclasses by index and nothing for the unknown", () => {
    const clericNames = subclassesForClass("cleric").map((s) => s.name);
    expect(clericNames).toContain("Life");
    expect(clericNames).toContain("Twilight");
    expect(subclassesForClass("nope")).toEqual([]);
    expect(subclassesForClass(undefined)).toEqual([]);
  });

  it("looks a subclass up by (class index, name)", () => {
    expect(getSubclassByName("cleric", "Life")?.grants).toBeDefined();
    expect(getSubclassByName("cleric", "Bogus")).toBeUndefined();
    expect(getSubclassByName(undefined, "Life")).toBeUndefined();
  });

  it("every entry belongs to a real class", () => {
    for (const s of SUBCLASSES) {
      expect(classIndices, `${s.name} → ${s.classIndex}`).toContain(
        s.classIndex,
      );
    }
  });

  it("only level-1-choice classes carry mechanical grants", () => {
    for (const s of SUBCLASSES) {
      if (s.grants) {
        expect(
          LEVEL_ONE_SUBCLASS_CLASSES,
          `${s.classIndex} / ${s.name} should not have grants`,
        ).toContain(s.classIndex);
      }
    }
  });

  it("all granted spell indices resolve to bundled SRD spells", () => {
    for (const s of SUBCLASSES) {
      for (const index of s.grants?.spellIndices ?? []) {
        expect(getSrdSpell(index), `${s.name} spell ${index}`).toBeDefined();
      }
    }
  });

  it("has unique entry indices", () => {
    const indices = SUBCLASSES.map((s) => s.index);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

describe("race catalog (SRD + non-SRD merge)", () => {
  it("exposes non-SRD races alongside the SRD ones", () => {
    const indices = SRD_RACES.map((r) => r.index);
    expect(indices).toContain("elf"); // SRD
    expect(indices).toContain("goliath"); // Volo's
    expect(indices).toContain("warforged"); // Eberron
  });

  it("has unique race indices", () => {
    const indices = SRD_RACES.map((r) => r.index);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("merges hand-authored subraces into their base race", () => {
    const elf = SRD_RACES.find((r) => r.index === "elf");
    const subraceIndices = subracesForRace(elf).map((s) => s.index);
    expect(subraceIndices).toContain("high-elf"); // SRD
    expect(subraceIndices).toContain("drow"); // PHB extra
    expect(subraceIndices).toContain("sea-elf"); // PHB extra

    const aasimar = SRD_RACES.find((r) => r.index === "aasimar");
    expect(subracesForRace(aasimar).map((s) => s.index)).toContain(
      "protector-aasimar",
    );
  });
});

describe("class catalog (SRD + non-SRD merge)", () => {
  it("includes the Artificer with level-1 spellcasting", () => {
    const artificer = SRD_CLASSES.find((c) => c.index === "artificer");
    expect(artificer?.name).toBe("Artificer");
    expect(artificer?.spellcasting?.ability).toBe("int");
  });
});
