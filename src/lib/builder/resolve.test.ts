import { describe, expect, it } from "vitest";
import { StatKey } from "src/lib/data/data-definitions";
import { defaultBuilderState } from "src/lib/builder/types";
import {
  defaultRaceBonuses,
  resolveBaseStats,
  resolveFinalStats,
  scorePool,
} from "src/lib/builder/resolve";
import { STANDARD_ARRAY } from "src/lib/builder/ability-scores";
import { getSrdRace, getSubrace } from "src/lib/builder/srd-races";

describe("defaultRaceBonuses", () => {
  it("combines race + subrace fixed bonuses", () => {
    const elf = getSrdRace("elf");
    const highElf = getSubrace(elf, "high-elf");
    expect(defaultRaceBonuses(elf, highElf)).toEqual([
      { bonus: 2, stat: "dex" },
      { bonus: 1, stat: "int" },
    ]);
  });

  it("adds unassigned +1 placeholders for floating choices (Half-Elf)", () => {
    const halfElf = getSrdRace("half-elf");
    const bonuses = defaultRaceBonuses(halfElf, undefined);
    expect(bonuses).toContainEqual({ bonus: 2, stat: "cha" });
    // Two floating +1s the player assigns.
    expect(bonuses.filter((b) => b.stat === "").length).toBe(2);
  });
});

describe("resolveFinalStats", () => {
  const base = { str: 10, dex: 12, con: 10, int: 14, wis: 8, cha: 10 };

  it("falls back to race defaults when bonuses were never edited", () => {
    const state = {
      ...defaultBuilderState(),
      scoreMethod: "manual" as const,
      baseStats: { ...base },
      raceIndex: "elf",
      subraceIndex: "high-elf",
    };
    const final = resolveFinalStats(state);
    expect(final.dex).toBe(14); // 12 + 2
    expect(final.int).toBe(15); // 14 + 1
  });

  it("honours a reassigned bonus list (floating rules)", () => {
    const state = {
      ...defaultBuilderState(),
      scoreMethod: "manual" as const,
      baseStats: { ...base },
      raceIndex: "elf",
      subraceIndex: "high-elf",
      // Moved the +2 onto INT and the +1 onto CON.
      raceBonuses: [
        { bonus: 2, stat: StatKey.int },
        { bonus: 1, stat: StatKey.con },
      ],
    };
    const final = resolveFinalStats(state);
    expect(final.int).toBe(16); // 14 + 2
    expect(final.con).toBe(11); // 10 + 1
    expect(final.dex).toBe(12); // unchanged
  });

  it("ignores unassigned bonuses", () => {
    const state = {
      ...defaultBuilderState(),
      scoreMethod: "manual" as const,
      baseStats: { ...base },
      raceBonuses: [{ bonus: 2, stat: "" as const }],
    };
    expect(resolveFinalStats(state).str).toBe(10);
  });
});

describe("resolveBaseStats + scorePool (assignment methods)", () => {
  it("standard array reads the assignment, unassigned → 10", () => {
    const state = {
      ...defaultBuilderState(),
      scoreMethod: "standard" as const,
      assignment: {
        str: 15,
        dex: 14,
        con: 13,
        int: null,
        wis: null,
        cha: null,
      },
    };
    expect(scorePool(state)).toEqual(STANDARD_ARRAY);
    const base = resolveBaseStats(state);
    expect(base.str).toBe(15);
    expect(base.int).toBe(10); // unassigned fallback
  });

  it("roll method draws its pool from the rolled scores", () => {
    const state = {
      ...defaultBuilderState(),
      scoreMethod: "roll" as const,
      rolledPool: [16, 14, 13, 12, 10, 9],
    };
    expect(scorePool(state)).toEqual([16, 14, 13, 12, 10, 9]);
  });
});
