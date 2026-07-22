import { describe, expect, it } from "vitest";
import {
  grantsForChoiceText,
  parseEquipmentOption,
  resolveClassLoadout,
  weaponSlotsForText,
} from "src/lib/builder/equipment";

describe("parseEquipmentOption", () => {
  it("splits an (a)/(b) line into labelled choices", () => {
    expect(
      parseEquipmentOption("(a) a greataxe or (b) any martial melee weapon"),
    ).toEqual({
      kind: "choice",
      choices: [
        { key: "a", text: "a greataxe" },
        { key: "b", text: "any martial melee weapon" },
      ],
    });
  });

  it("handles three choices with an Oxford comma", () => {
    const parsed = parseEquipmentOption(
      "(a) a rapier, (b) a longsword, or (c) any simple weapon",
    );
    expect(parsed.kind).toBe("choice");
    if (parsed.kind === "choice")
      expect(parsed.choices.map((c) => c.text)).toEqual([
        "a rapier",
        "a longsword",
        "any simple weapon",
      ]);
  });

  it("treats a line with no markers as a fixed grant", () => {
    expect(parseEquipmentOption("holy symbol")).toEqual({
      kind: "fixed",
      text: "holy symbol",
    });
  });
});

describe("grantsForChoiceText", () => {
  it("classifies a concrete weapon", () => {
    expect(grantsForChoiceText("a greataxe")).toEqual([
      { kind: "weapon", name: "Greataxe", count: 1 },
    ]);
  });

  it("reads a leading count word (two handaxes)", () => {
    expect(grantsForChoiceText("two handaxes")).toEqual([
      { kind: "weapon", name: "Handaxe", count: 2 },
    ]);
  });

  it("reads a trailing count suffix (Dagger (2))", () => {
    expect(grantsForChoiceText("Dagger (2)")).toEqual([
      { kind: "weapon", name: "Dagger", count: 2 },
    ]);
  });

  it("classifies a weapon category as a choice slot", () => {
    expect(grantsForChoiceText("any martial melee weapon")).toEqual([
      { kind: "weaponChoice", category: "martial-melee", count: 1 },
    ]);
    expect(grantsForChoiceText("two martial weapons")).toEqual([
      { kind: "weaponChoice", category: "martial", count: 2 },
    ]);
  });

  it("splits a compound line into armor + weapon + item", () => {
    expect(
      grantsForChoiceText("leather armor, longbow, and 20 arrows"),
    ).toEqual([
      { kind: "armor", key: "leather armor" },
      { kind: "weapon", name: "Longbow", count: 1 },
      { kind: "item", text: "20 arrows" },
    ]);
  });

  it("recognises armor and shields, ignoring (if proficient)", () => {
    expect(grantsForChoiceText("chain mail (if proficient)")).toEqual([
      { kind: "armor", key: "chain mail" },
    ]);
    expect(grantsForChoiceText("a wooden shield")).toEqual([
      { kind: "shield" },
    ]);
  });
});

describe("weaponSlotsForText", () => {
  it("expands a category choice into one slot per weapon", () => {
    expect(weaponSlotsForText("two martial weapons")).toEqual([
      "martial",
      "martial",
    ]);
    expect(weaponSlotsForText("a martial weapon and a shield")).toEqual([
      "martial",
    ]);
  });
});

describe("resolveClassLoadout", () => {
  it("builds attacks and AC from fixed armor + weapons", () => {
    // Cleric-ish: fixed Shield; option picks Scale Mail + a mace.
    const loadout = resolveClassLoadout(
      ["Shield"],
      [
        "(a) scale mail, (b) leather armor, or (c) chain mail (if proficient)",
        "(a) a mace or (b) a warhammer (if proficient)",
      ],
      {},
      {},
    );
    expect(loadout.equipment).toEqual(["Shield", "Scale Mail", "Mace"]);
    expect(loadout.attacks.map((a) => a.name)).toEqual(["Mace"]);
    // Scale mail is medium armor (base 14, DEX capped at 2); a shield is granted.
    expect(loadout.armor).toEqual({
      label: "Scale Mail",
      mechanics: { base: 14, category: "medium", dex: "capped", dexCap: 2 },
    });
    expect(loadout.shield).toBe(true);
  });

  it("defaults a category slot to the first weapon, honouring picks", () => {
    const opts = ["(a) a greataxe or (b) any martial melee weapon"];
    // Choice (b) selected, no explicit pick → first martial melee weapon.
    const dflt = resolveClassLoadout([], opts, { 0: 1 }, {});
    expect(dflt.equipment).toEqual(["Battleaxe"]);
    // Explicit pick honoured.
    const picked = resolveClassLoadout(
      [],
      opts,
      { 0: 1 },
      { 0: ["Greatsword"] },
    );
    expect(picked.equipment).toEqual(["Greatsword"]);
    expect(picked.attacks.map((a) => a.name)).toEqual(["Greatsword"]);
  });

  it("grants no armor or shield when none is taken", () => {
    const loadout = resolveClassLoadout(["Spellbook"], [], {}, {});
    expect(loadout.armor).toBeUndefined();
    expect(loadout.shield).toBe(false);
  });
});
