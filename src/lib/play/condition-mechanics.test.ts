import { describe, expect, it } from "vitest";
import {
  conditionRiders,
  conditionSummary,
  ridersAgainst,
  WIRED_CONDITION_NAMES,
} from "src/lib/play/condition-mechanics";

describe("condition mechanics", () => {
  it("gives Bless's d4 to attacks and saves, folding in on its own", () => {
    for (const kind of ["attack", "save"] as const) {
      const [bless] = conditionRiders(["Bless"], kind);
      expect(bless.source).toBe("Bless");
      // Not optional: saves and attacks are exactly what Bless touches, and
      // exactly what the split roll kinds can now say.
      expect(bless.rider).toEqual({
        rider: "bonusDice",
        count: 1,
        die: "d4",
      });
    }
    expect(conditionRiders(["Bless"], "check")).toEqual([]);
  });

  it("keeps Guidance off attack rolls", () => {
    expect(conditionRiders(["Guidance"], "check")).toHaveLength(1);
    expect(conditionRiders(["Guidance"], "attack")).toHaveLength(0);
  });

  it("knows nothing it wasn't taught — unknown and advisory-only names", () => {
    expect(conditionRiders(["Poisoned", "Homebrew Hex"], "check")).toEqual([]);
    // Advisory-only entries still carry a summary for banners.
    expect(conditionSummary("Hideous Laughter")).toMatch(/prone/i);
  });

  it("pays a caster-only mark to its caster and nobody else", () => {
    const hexed = [{ name: "Hex", from: "pc:hexer" }];
    expect(ridersAgainst(hexed, "pc:hexer", "damage")).toHaveLength(1);
    expect(ridersAgainst(hexed, "pc:someone-else", "damage")).toEqual([]);
    // A hand-ticked Hex with no recorded caster pays nobody.
    expect(ridersAgainst([{ name: "Hex" }], "pc:hexer", "damage")).toEqual([]);
  });

  it("pays an anyone-mark to any attacker", () => {
    const outlined = [{ name: "Faerie Fire", from: "pc:caster" }];
    const [rider] = ridersAgainst(outlined, "pc:someone-else", "attack");
    expect(rider.source).toBe("Faerie Fire");
    expect(rider.rider.rider).toBe("advantage");
    // Wrong kind: nothing.
    expect(ridersAgainst(outlined, "pc:someone-else", "damage")).toEqual([]);
  });

  it("pays Bestow Curse's necrotic d8 only to whoever placed it", () => {
    const cursed = [{ name: "Bestow Curse", from: "pc:witch" }];
    const [rider] = ridersAgainst(cursed, "pc:witch", "damage");
    expect(rider.rider.rider).toBe("extraDamage");
    // One of four curse options, so it waits for a tick.
    expect(rider.rider).toMatchObject({ optional: true });
    expect(ridersAgainst(cursed, "pc:ally", "damage")).toEqual([]);
  });

  it("pays Hexblade's Curse — the +PB damage and the 19–20 crits — to the curser alone", () => {
    const cursed = [{ name: "Hexblade's Curse", from: "pc:hexblade" }];
    const [damage] = ridersAgainst(cursed, "pc:hexblade", "damage");
    expect(damage.rider).toMatchObject({
      rider: "extraDamage",
      amount: "proficiencyBonus",
    });
    const [crit] = ridersAgainst(cursed, "pc:hexblade", "attack");
    expect(crit.rider).toEqual({ rider: "critRange", value: 19 });
    expect(ridersAgainst(cursed, "pc:ally", "damage")).toEqual([]);
    expect(ridersAgainst(cursed, "pc:ally", "attack")).toEqual([]);
  });

  it("gives Vow of Enmity's advantage only to the paladin who vowed", () => {
    const sworn = [{ name: "Vow of Enmity", from: "pc:paladin" }];
    expect(ridersAgainst(sworn, "pc:paladin", "attack")).toHaveLength(1);
    expect(ridersAgainst(sworn, "pc:rogue", "attack")).toEqual([]);
  });

  it("warns any attacker about a defensive ward on their target", () => {
    // The sweep's advisory family: no die to wire, but the reminder lands on
    // exactly the rolls it concerns.
    for (const name of ["Blurred", "Sanctuary", "Mirror Image"]) {
      const [rider] = ridersAgainst([{ name }], "pc:anyone", "attack");
      expect(rider.source).toBe(name);
      expect(rider.rider.rider).toBe("advantage");
    }
  });
});

describe("wired condition names", () => {
  it("offers the buffs and marks with real mechanics, not prose-only entries", () => {
    for (const name of [
      "Zephyr Strike",
      "Divine Favor",
      "Elemental Weapon",
      "Flame Arrows",
      "Hex",
      "Hunter's Mark",
      "Bless",
    ]) {
      expect(WIRED_CONDITION_NAMES).toContain(name);
    }
    // Summary-only entries have nothing to wire into a roll.
    expect(WIRED_CONDITION_NAMES).not.toContain("Aid");
    expect(WIRED_CONDITION_NAMES).not.toContain("Hideous Laughter");
  });

  it("gives Elemental Weapon and Flame Arrows their damage dice", () => {
    for (const name of ["Elemental Weapon", "Flame Arrows"]) {
      const riders = conditionRiders([name], "damage");
      expect(riders.some((r) => r.rider.rider === "extraDamage")).toBe(true);
    }
  });
});
