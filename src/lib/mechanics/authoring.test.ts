import { describe, expect, it } from "vitest";
import {
  DieOperation,
  OfficialClass,
  Operation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { AmountExpr, Effect } from "src/lib/types";
import { buildAmount, deriveChoose, parseSimpleAmount } from "./authoring";
import { SLOT_CREATION_COSTS } from "./catalog";

describe("SimpleAmount codec", () => {
  it("round-trips numbers, dice, dice+bonus, and chosen amounts", () => {
    const cases: AmountExpr[] = [
      { fixed: 7 },
      { fixed: [2, StandardDie.d6, DieOperation.roll] },
      {
        fixed: {
          operation: Operation.addition,
          operands: [[1, StandardDie.d10, DieOperation.roll], 4],
        },
      },
      { chosenAmount: true },
      { chosenAmountDice: StandardDie.d6 },
    ];
    for (const expr of cases) {
      const simple = parseSimpleAmount(expr);
      expect(simple, JSON.stringify(expr)).not.toBeNull();
      expect(buildAmount(simple!)).toEqual(expr);
    }
  });

  it("refuses catalog-only shapes rather than mangling them", () => {
    expect(parseSimpleAmount({ chosenLevel: true })).toBeNull();
    expect(
      parseSimpleAmount({ byChosenLevel: SLOT_CREATION_COSTS }),
    ).toBeNull();
    expect(
      parseSimpleAmount({ fixed: 2, plusLevelOf: OfficialClass.Fighter }),
    ).toBeNull();
    // A non-simple formula (nested operation).
    expect(
      parseSimpleAmount({
        fixed: { operation: Operation.multiplication, operands: [2, 3] },
      }),
    ).toBeNull();
  });
});

describe("deriveChoose", () => {
  it("derives the slot picker from unpinned slot effects", () => {
    expect(deriveChoose([{ effect: "restoreSlot" }])).toEqual({
      slotLevel: "toRestore",
    });
    expect(deriveChoose([{ effect: "expendSlot" }])).toEqual({
      slotLevel: "toExpend",
    });
    // A pinned level needs no picker.
    expect(deriveChoose([{ effect: "restoreSlot", level: 1 }])).toBeUndefined();
  });

  it("derives the amount input from chosen amounts", () => {
    const effects: Effect[] = [
      { effect: "spendUses", amount: { chosenAmount: true } },
      { effect: "heal", amount: { chosenAmount: true } },
    ];
    expect(deriveChoose(effects)).toEqual({ amount: "uses" });
  });

  it("is undefined when nothing needs choosing", () => {
    expect(
      deriveChoose([
        { effect: "spendUses", amount: { fixed: 1 } },
        { effect: "remind", note: "hi" },
      ]),
    ).toBeUndefined();
  });
});
