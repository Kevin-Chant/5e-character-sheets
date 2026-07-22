import { describe, expect, it } from "vitest";
import { OfficialClass } from "./data/data-definitions";
import { defaultCharacter } from "./data/default-data";
import {
  availableSpellSlots,
  getHpFormula,
  isPreparedCaster,
  officialSpellcastingClasses,
} from "./rules";
import { Character } from "./types";
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
