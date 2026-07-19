import { describe, expect, it } from "vitest";
import { OfficialClass, SpellLevel } from "./data/data-definitions";
import { defaultCharacter } from "./data/default-data";
import {
  availableSpellSlots,
  getHpFormula,
  isPreparedCaster,
  officialSpellcastingClasses,
} from "./rules";
import { Character } from "./types";

const wizard = (level: number): Character => {
  const c = structuredClone(defaultCharacter);
  c.class = [{ name: OfficialClass.Wizard, level }];
  c.spellcastingClasses = [{ class: OfficialClass.Wizard }];
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
    c.spellcastingClasses = [
      { class: OfficialClass.Wizard },
      { class: "Custom Caster" },
    ];
    expect(officialSpellcastingClasses(c)).toEqual([OfficialClass.Wizard]);
  });
});

describe("availableSpellSlots", () => {
  it("is total minus expended, floored at 0", () => {
    const c = wizard(9);
    // A 9th-level wizard has three 3rd-level slots and no 6th-level slots.
    c.spellSlots[SpellLevel.Third].expended = 1;
    expect(availableSpellSlots(c, SpellLevel.Third)).toBe(2);
    expect(availableSpellSlots(c, SpellLevel.Sixth)).toBe(0);
  });

  it("respects a totalOverride", () => {
    const c = wizard(1);
    c.spellSlots[SpellLevel.Third].totalOverride = 5;
    c.spellSlots[SpellLevel.Third].expended = 2;
    expect(availableSpellSlots(c, SpellLevel.Third)).toBe(3);
  });
});
