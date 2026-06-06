import { describe, expect, it } from "vitest";
import {
  averageDie,
  calculateCustomFormula,
  getPB,
  levelInClass,
  modifier,
  ordinal,
  totalGP,
  traverse,
  withoutZero,
} from "./utils";
import { Character } from "./types";
import { OfficialClass, StandardDie } from "./data/data-definitions";

// A minimal character stub for the pure helpers that only read a few fields.
function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 20 },
    class: [{ name: OfficialClass.Wizard, level: 5 }],
    ...overrides,
  } as Character;
}

describe("modifier", () => {
  it("computes the 5e ability modifier", () => {
    expect(modifier(10)).toBe(0);
    expect(modifier(20)).toBe(5);
    expect(modifier(8)).toBe(-1);
    expect(modifier(15)).toBe(2);
  });
});

describe("getPB", () => {
  it("uses pbOverride when set", () => {
    expect(getPB(makeCharacter({ pbOverride: 7 }))).toBe(7);
  });

  it("derives proficiency bonus from total level", () => {
    expect(
      getPB(
        makeCharacter({ class: [{ name: OfficialClass.Wizard, level: 1 }] }),
      ),
    ).toBe(2);
    expect(
      getPB(
        makeCharacter({ class: [{ name: OfficialClass.Wizard, level: 5 }] }),
      ),
    ).toBe(3);
    expect(
      getPB(
        makeCharacter({ class: [{ name: OfficialClass.Wizard, level: 20 }] }),
      ),
    ).toBe(6);
  });

  it("sums levels across multiclass", () => {
    const character = makeCharacter({
      class: [
        { name: OfficialClass.Wizard, level: 3 },
        { name: OfficialClass.Cleric, level: 2 },
      ],
    });
    expect(getPB(character)).toBe(3);
  });
});

describe("averageDie", () => {
  it("averages a standard die with the given rounder", () => {
    expect(averageDie(StandardDie.d6, Math.floor)).toBe(3);
    expect(averageDie(StandardDie.d6, Math.ceil)).toBe(4);
    expect(averageDie(StandardDie.d8, Math.floor)).toBe(4);
  });
});

describe("withoutZero", () => {
  it("renders non-zero numbers and blanks zero", () => {
    expect(withoutZero(3)).toBe("3");
    expect(withoutZero(-2)).toBe("-2");
    expect(withoutZero(0)).toBe("");
  });
});

describe("ordinal", () => {
  it("applies correct English ordinal suffixes", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(100)).toBe("100th");
  });
});

describe("totalGP", () => {
  it("converts mixed coinage to a gold value", () => {
    expect(totalGP({ GP: 1 })).toBe(1);
    expect(totalGP({ CP: 100 })).toBeCloseTo(1);
    expect(totalGP({ PP: 1, GP: 2, SP: 5 })).toBeCloseTo(12.5);
  });
});

describe("traverse", () => {
  it("follows a dotted path", () => {
    expect(traverse("a.b.c", { a: { b: { c: 42 } } })).toBe(42);
  });

  it("returns the object for an empty path", () => {
    const obj = { x: 1 };
    expect(traverse("", obj)).toBe(obj);
  });

  it("short-circuits on a missing segment", () => {
    expect(traverse("x.y", { x: null })).toBeNull();
  });
});

describe("levelInClass", () => {
  const character = makeCharacter({
    class: [
      { name: OfficialClass.Wizard, level: 3 },
      { name: OfficialClass.Cleric, level: 2 },
    ],
  });

  it("returns the level for a class the character has", () => {
    expect(levelInClass(OfficialClass.Wizard, character)).toBe(3);
  });

  it("returns 0 for a class the character lacks", () => {
    expect(levelInClass(OfficialClass.Bard, character)).toBe(0);
  });
});

describe("calculateCustomFormula", () => {
  const character = makeCharacter();

  it("evaluates a plain number", () => {
    expect(calculateCustomFormula(7, character)).toBe(7);
  });

  it("evaluates a stat reference to its modifier", () => {
    // str 16 -> +3
    expect(calculateCustomFormula("str", character)).toBe(3);
  });

  it("evaluates arithmetic expressions", () => {
    expect(
      calculateCustomFormula(
        { operation: "addition", operands: [2, 3, 4] },
        character,
      ),
    ).toBe(9);
    expect(
      calculateCustomFormula(
        { operation: "subtraction", operand1: 10, operand2: 3 },
        character,
      ),
    ).toBe(7);
    expect(
      calculateCustomFormula(
        { operation: "division", operand1: 10, operand2: 2 },
        character,
      ),
    ).toBe(5);
    expect(
      calculateCustomFormula(
        { operation: "minimum", operands: [3, 5, 1] },
        character,
      ),
    ).toBe(1);
  });

  it("evaluates nested expressions", () => {
    // (str mod + proficiencyBonus) -> 3 + 3 = 6
    expect(
      calculateCustomFormula(
        { operation: "addition", operands: ["str", "proficiencyBonus"] },
        character,
      ),
    ).toBe(6);
  });
});
