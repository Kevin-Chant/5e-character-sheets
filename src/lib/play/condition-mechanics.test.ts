import { describe, expect, it } from "vitest";
import {
  conditionRiders,
  conditionSummary,
  ridersAgainst,
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
