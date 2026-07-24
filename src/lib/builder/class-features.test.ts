import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { mechanicsForTitle } from "src/lib/mechanics/catalog";
import {
  classFeaturesAt,
  ELDRITCH_INVOCATIONS,
  FIGHTING_STYLES,
  fightingStyleDueAt,
  invocationsKnownAt,
  newCantripsAt,
  newInvocationsAt,
  newSpellsAt,
} from "./class-features";

describe("fighting styles", () => {
  it("are due at the right class levels", () => {
    expect(fightingStyleDueAt(OfficialClass.Fighter, 1)).toBeDefined();
    expect(fightingStyleDueAt(OfficialClass.Paladin, 2)).toEqual([
      "Defense",
      "Dueling",
      "Great Weapon Fighting",
      "Protection",
    ]);
    expect(fightingStyleDueAt(OfficialClass.Ranger, 2)).toContain("Archery");
    expect(fightingStyleDueAt(OfficialClass.Paladin, 3)).toBeUndefined();
    expect(fightingStyleDueAt(OfficialClass.Wizard, 2)).toBeUndefined();
  });

  it("Great Weapon Fighting's bare name matches its catalog rider", () => {
    const gwf = FIGHTING_STYLES.find(
      (s) => s.name === "Great Weapon Fighting",
    )!;
    expect(mechanicsForTitle(gwf.name)?.riders).toBeDefined();
  });

  it("only Defense carries an AC bonus", () => {
    expect(FIGHTING_STYLES.filter((s) => s.acBonus).map((s) => s.name)).toEqual(
      ["Defense"],
    );
  });
});

describe("eldritch invocations", () => {
  it("known counts follow the PHB progression", () => {
    expect(invocationsKnownAt(1)).toBe(0);
    expect(invocationsKnownAt(2)).toBe(2);
    expect(invocationsKnownAt(4)).toBe(2);
    expect(invocationsKnownAt(5)).toBe(3);
    expect(invocationsKnownAt(9)).toBe(5);
    expect(invocationsKnownAt(18)).toBe(8);
  });

  it("new picks appear only at growth levels", () => {
    expect(newInvocationsAt(2)).toBe(2);
    expect(newInvocationsAt(3)).toBe(0);
    expect(newInvocationsAt(5)).toBe(1);
    expect(newInvocationsAt(12)).toBe(1);
  });

  it("has unique names", () => {
    const names = ELDRITCH_INVOCATIONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("per-level class features", () => {
  it("lands the paladin's signature features at their levels", () => {
    expect(
      classFeaturesAt(OfficialClass.Paladin, 2).map((f) => f.title),
    ).toEqual(["Divine Smite"]);
    expect(
      classFeaturesAt(OfficialClass.Paladin, 5).map((f) => f.title),
    ).toEqual(["Extra Attack"]);
    expect(
      classFeaturesAt(OfficialClass.Paladin, 6).map((f) => f.title),
    ).toEqual(["Aura of Protection"]);
    expect(classFeaturesAt(OfficialClass.Paladin, 4)).toEqual([]);
  });

  it("Reliable Talent's title matches its catalog rider", () => {
    const rogue11 = classFeaturesAt(OfficialClass.Rogue, 11);
    expect(rogue11.map((f) => f.title)).toContain("Reliable Talent");
    expect(mechanicsForTitle("Reliable Talent")?.riders).toBeDefined();
  });

  it("pool-backed features stay out of the prose table", () => {
    // Rage/Second Wind/Ki etc. land as limited-use pools with their own
    // descriptions; duplicating them here would double them on the sheet.
    for (const cls of [
      OfficialClass.Barbarian,
      OfficialClass.Fighter,
      OfficialClass.Monk,
    ]) {
      for (let lvl = 1; lvl <= 20; lvl++) {
        const titles = classFeaturesAt(cls, lvl).map((f) => f.title);
        for (const pooled of [
          "Rage",
          "Second Wind",
          "Action Surge",
          "Indomitable",
          "Ki",
        ])
          expect(titles, `${cls} ${lvl}`).not.toContain(pooled);
      }
    }
  });
});

describe("spells known / cantrips known progression", () => {
  it("reports new cantrips only at the levels the count changes", () => {
    expect(newCantripsAt(OfficialClass.Bard, 1)).toBe(2); // 0 → 2
    expect(newCantripsAt(OfficialClass.Bard, 2)).toBe(0);
    expect(newCantripsAt(OfficialClass.Bard, 4)).toBe(1); // 2 → 3
    expect(newCantripsAt(OfficialClass.Bard, 10)).toBe(1); // 3 → 4
    expect(newCantripsAt(OfficialClass.Bard, 11)).toBe(0);
  });

  it("gives half-casters no cantrips at all", () => {
    expect(newCantripsAt(OfficialClass.Paladin, 4)).toBeNull();
    expect(newCantripsAt(OfficialClass.Ranger, 4)).toBeNull();
  });

  it("walks the known-caster spell tables one level at a time", () => {
    expect(newSpellsAt(OfficialClass.Sorcerer, 1)).toBe(2);
    expect(newSpellsAt(OfficialClass.Sorcerer, 2)).toBe(1);
    // The sorcerer's repertoire stops growing at 17th.
    expect(newSpellsAt(OfficialClass.Sorcerer, 18)).toBe(0);
    expect(newSpellsAt(OfficialClass.Bard, 10)).toBe(2); // 12 → 14
    expect(newSpellsAt(OfficialClass.Warlock, 11)).toBe(1);
  });

  it("gives a ranger nothing at 1st and two spells at 2nd", () => {
    expect(newSpellsAt(OfficialClass.Ranger, 1)).toBe(0);
    expect(newSpellsAt(OfficialClass.Ranger, 2)).toBe(2);
  });

  it("grows a wizard's spellbook by two a level, six at the first", () => {
    expect(newSpellsAt(OfficialClass.Wizard, 1)).toBe(6);
    expect(newSpellsAt(OfficialClass.Wizard, 2)).toBe(2);
    expect(newSpellsAt(OfficialClass.Wizard, 17)).toBe(2);
  });

  it("leaves prepared casters unenforced", () => {
    for (const c of [
      OfficialClass.Cleric,
      OfficialClass.Druid,
      OfficialClass.Paladin,
    ])
      expect(newSpellsAt(c, 5)).toBeNull();
    // …and an unknown/homebrew class too.
    expect(newSpellsAt("Blood Hunter", 5)).toBeNull();
  });

  it("never returns a negative grant at any level of any class", () => {
    for (const c of Object.values(OfficialClass))
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(newSpellsAt(c, lvl) ?? 0).toBeGreaterThanOrEqual(0);
        expect(newCantripsAt(c, lvl) ?? 0).toBeGreaterThanOrEqual(0);
      }
  });
});
