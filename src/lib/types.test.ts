import { describe, expect, it } from "vitest";
import { isNumber } from "lodash";
import {
  isArr,
  isCustomFormula,
  isDamageType,
  isMap,
  isStandardDie,
  isStatKey,
  isUuid,
} from "./types";

describe("isUuid", () => {
  it("accepts uuid-shaped strings", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("rejects non-uuids", () => {
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("isStatKey", () => {
  it("recognizes the six ability scores", () => {
    expect(isStatKey("str")).toBe(true);
    expect(isStatKey("cha")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isStatKey("luck")).toBe(false);
    expect(isStatKey(null)).toBe(false);
  });
});

describe("isStandardDie", () => {
  it("recognizes standard dice", () => {
    expect(isStandardDie("d6")).toBe(true);
    expect(isStandardDie("d20")).toBe(true);
  });

  it("rejects non-standard dice", () => {
    expect(isStandardDie("d7")).toBe(false);
    expect(isStandardDie("6")).toBe(false);
  });
});

describe("isDamageType", () => {
  it("recognizes damage types", () => {
    expect(isDamageType("Fire")).toBe(true);
    expect(isDamageType("Slashing")).toBe(true);
  });

  it("rejects unknown damage types", () => {
    expect(isDamageType("fire")).toBe(false);
    expect(isDamageType("Sonic")).toBe(false);
  });
});

describe("isCustomFormula", () => {
  it("accepts atomic numbers and expressions", () => {
    expect(isCustomFormula(5)).toBe(true);
    expect(isCustomFormula({ operation: "addition", operands: [1, 2] })).toBe(
      true,
    );
  });

  it("rejects malformed values", () => {
    expect(isCustomFormula(null)).toBe(false);
    expect(isCustomFormula({ operation: "bogus", operands: [1] })).toBe(false);
  });
});

describe("isArr / isMap", () => {
  it("validates homogeneous arrays", () => {
    expect(isArr([1, 2, 3], isNumber)).toBe(true);
    expect(isArr([1, "two"], isNumber)).toBe(false);
    expect(isArr("nope", isNumber)).toBe(false);
  });

  it("validates maps by key and value predicate", () => {
    expect(isMap({ str: 1, dex: 2 }, isStatKey, isNumber)).toBe(true);
    expect(isMap({ str: 1, luck: 2 }, isStatKey, isNumber)).toBe(false);
    expect(isMap({ str: "x" }, isStatKey, isNumber)).toBe(false);
  });
});
