import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { mechanicsForTitle } from "src/lib/mechanics/catalog";
import {
  classFeaturesAt,
  ELDRITCH_INVOCATIONS,
  FIGHTING_STYLES,
  fightingStyleDueAt,
  invocationsKnownAt,
  newInvocationsAt,
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
