import { describe, expect, it } from "vitest";
import {
  averageDie,
  calculateCustomFormula,
  formatCustomFormula,
  getPB,
  levelInClass,
  modifier,
  ordinal,
  totalGP,
  traverse,
  withoutZero,
} from "./utils";
import { Character, DieExpression } from "./types";
import {
  DieOperation,
  OfficialClass,
  PB,
  StandardDie,
  StatKey,
} from "./data/data-definitions";

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

describe("formatCustomFormula", () => {
  // str 16 (+3), dex 10 (0), int 8 (-1), wis 12 (+1), cha 20 (+5); Wizard 5, PB 3.
  const character = makeCharacter();
  const d = (n: number, die: StandardDie): DieExpression => [
    n,
    die,
    DieOperation.roll,
  ];
  const fmt = (
    formula: Parameters<typeof formatCustomFormula>[0],
    evalRefs = true,
  ) => formatCustomFormula(formula, character, evalRefs);

  it("resolves references when evaluating, keeps them symbolic otherwise", () => {
    expect(fmt(StatKey.str)).toBe("3");
    expect(fmt(StatKey.str, false)).toBe("str mod");
    expect(fmt(PB)).toBe("3");
    expect(fmt(PB, false)).toBe("PB");
    expect(fmt(StatKey.int)).toBe("-1");
  });

  it("flips the sign of negative addition terms instead of rendering '+ -'", () => {
    // 1d8 + 1d12 + int mod + 2 -> int mod (-1) and 2 fold to +1
    const formula = {
      operation: "addition" as const,
      operands: [d(1, StandardDie.d8), d(1, StandardDie.d12), StatKey.int, 2],
    };
    expect(fmt(formula)).toBe("1d8 + 1d12 + 1");
    // Symbolic mode keeps structure (only the literal is foldable on its own).
    expect(fmt(formula, false)).toBe("1d8 + 1d12 + int mod + 2");
  });

  it("collapses a negative constant sum to a subtraction", () => {
    // 1d8 + int mod + int mod -> two -1s fold to -2
    expect(
      fmt({
        operation: "addition",
        operands: [d(1, StandardDie.d8), StatKey.int, StatKey.int],
      }),
    ).toBe("1d8 - 2");
  });

  it("folds a fully-constant subtree to a single number", () => {
    // floor((str mod + 4) / 2) -> floor((3 + 4) / 2) = 3
    expect(
      fmt({
        operation: "floor",
        operand1: {
          operation: "division",
          operand1: { operation: "addition", operands: [StatKey.str, 4] },
          operand2: 2,
        },
      }),
    ).toBe("3");
  });

  it("parenthesizes by precedence and drops noise parens around atoms", () => {
    // (1d8 + str mod) * 2, symbolic so nothing folds
    expect(
      fmt(
        {
          operation: "multiplication",
          operands: [
            {
              operation: "addition",
              operands: [d(1, StandardDie.d8), StatKey.str],
            },
            2,
          ],
        },
        false,
      ),
    ).toBe("(1d8 + str mod) * 2");
  });

  it("keeps rounding visible as a function call", () => {
    expect(
      fmt(
        {
          operation: "floor",
          operand1: {
            operation: "division",
            operand1: OfficialClass.Wizard,
            operand2: 2,
          },
        },
        false,
      ),
    ).toBe("round down(Wizard level / 2)");
  });

  it("renders min/max functionally", () => {
    expect(
      fmt({ operation: "minimum", operands: [5, StatKey.str] }, false),
    ).toBe("min(5, str mod)");
  });

  it("renders the clamp idiom as 'between lo and hi'", () => {
    // max(1, min(5, str mod))
    const clamp = {
      operation: "maximum" as const,
      operands: [
        1,
        { operation: "minimum" as const, operands: [5, StatKey.str] },
      ],
    };
    expect(fmt(clamp, false)).toBe("str mod, between 1 and 5");
    // min(5, max(1, str mod)) yields the same clamp
    expect(
      fmt(
        {
          operation: "minimum",
          operands: [5, { operation: "maximum", operands: [1, StatKey.str] }],
        },
        false,
      ),
    ).toBe("str mod, between 1 and 5");
    // Wrapped in parens when nested inside another expression.
    expect(
      fmt(
        { operation: "addition", operands: [d(1, StandardDie.d8), clamp] },
        false,
      ),
    ).toBe("1d8 + (str mod, between 1 and 5)");
  });

  it("shows a zero clamp bound rather than blanking it", () => {
    // max(0, min(5, str mod)) — the lower bound of 0 must render
    expect(
      fmt(
        {
          operation: "maximum",
          operands: [0, { operation: "minimum", operands: [5, StatKey.str] }],
        },
        false,
      ),
    ).toBe("str mod, between 0 and 5");
  });

  it("falls back to functional min/max when the clamp value is constant", () => {
    // max(1, min(5, str mod)) with str mod = 3 folds to 3
    expect(
      fmt({
        operation: "maximum",
        operands: [1, { operation: "minimum", operands: [5, StatKey.str] }],
      }),
    ).toBe("3");
  });
});
