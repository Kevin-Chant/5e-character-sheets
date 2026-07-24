import { describe, expect, it } from "vitest";
import { DamageType, StatKey } from "src/lib/data/data-definitions";
import {
  spellDamageAtLevel,
  spellHealingAtLevel,
} from "src/lib/spells/spell-scaling";
import { attack, auto, save, saveHalf, spellMech } from "./nonsrd-mechanics";

// The helper must produce exactly the `SpellMechanics` shape the SRD generator
// does, so a non-SRD spell rolls through `spellDamageAtLevel` identically. These
// pin the shapes against known SRD spells.

describe("spellMech", () => {
  it("builds a slot-scaling save-half damage spell (Fireball's shape)", () => {
    const m = spellMech({
      level: 3,
      resolution: saveHalf(StatKey.dex),
      damage: [{ type: DamageType.Fire, base: "8d6", scale: "1d6" }],
    });
    expect(m.resolution).toEqual({
      kind: "save",
      ability: "dex",
      halfOnSuccess: true,
    });
    // Base at its own level; +1d6 per slot level above 3rd.
    expect(spellDamageAtLevel(m, 3)).toEqual({ Fire: [8, "d6", "roll"] });
    expect(spellDamageAtLevel(m, 5)).toEqual({ Fire: [10, "d6", "roll"] });
  });

  it("builds a character-scaling attack cantrip (Fire Bolt's shape)", () => {
    const m = spellMech({
      level: 0,
      resolution: attack("ranged"),
      damage: [{ type: DamageType.Fire, base: "1d10", scale: "1d10" }],
      driver: "character",
    });
    expect(m.resolution).toEqual({ kind: "attack", range: "ranged" });
    expect(spellDamageAtLevel(m, 1)).toEqual({ Fire: [1, "d10", "roll"] });
    // Grows at the 5/11/17 tiers.
    expect(spellDamageAtLevel(m, 5)).toEqual({ Fire: [2, "d10", "roll"] });
    expect(spellDamageAtLevel(m, 11)).toEqual({ Fire: [3, "d10", "roll"] });
  });

  it("builds a healing spell with the caster mod (Cure Wounds' shape)", () => {
    const m = spellMech({
      level: 1,
      resolution: auto(),
      healing: { base: "1d8", mod: true, scale: "1d8" },
    });
    expect(m.healing).toEqual({
      operation: "addition",
      operands: [[1, "d8", "roll"], { spellMod: "@caster" }],
    });
    expect(m.scaling).toEqual({ driver: "slot", healing: [1, "d8", "roll"] });
    // Cast at 3rd = base + two 1d8 steps + the mod, worth 3d8 + mod. (The engine
    // keeps it as a nested addition rather than collapsing, since the base isn't
    // a bare die — the total is what matters.)
    expect(spellHealingAtLevel(m, 3)).toEqual({
      operation: "addition",
      operands: [
        {
          operation: "addition",
          operands: [[1, "d8", "roll"], { spellMod: "@caster" }],
        },
        [2, "d8", "roll"],
      ],
    });
  });

  it("omits scaling when nothing grows, and supports save-for-none", () => {
    const m = spellMech({
      level: 2,
      resolution: save(StatKey.con),
      damage: [{ type: DamageType.Poison, base: "3d6" }],
    });
    expect(m.scaling).toBeUndefined();
    expect(m.resolution).toEqual({ kind: "save", ability: "con" });
  });
});
