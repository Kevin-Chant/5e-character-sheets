import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { Character } from "src/lib/types";
import { hydrateCharacter } from "./hydrate-character";
import { reconcileCharacterContent } from "./reconcile-content";

// A sheet built before the Rune Knight's pools were authored (2026-07-30): the
// class/subclass and the chosen runes' feature rows are on the sheet, but no
// pool ever landed because pools only synced during creation/level-up.
const preWiringRuneKnight = (): Character => {
  const c = structuredClone(defaultCharacter);
  c.class = [
    {
      id: randomUUID(),
      name: OfficialClass.Fighter,
      level: 3,
      subclass: "Rune Knight",
    },
  ];
  c.features = [
    { title: "Cloud Rune", titleFormulas: [] },
    { title: "Fire Rune", titleFormulas: [] },
  ];
  c.limitedUseAbilities = [];
  return c;
};

const titles = (c: Character) => c.limitedUseAbilities.map((a) => a.info.title);

describe("reconcileCharacterContent", () => {
  it("backfills the pools a pre-wiring sheet's recorded choices derive", () => {
    const c = preWiringRuneKnight();
    expect(reconcileCharacterContent(c)).toBe(true);
    expect(titles(c)).toContain("Giant's Might");
    expect(titles(c)).toContain("Cloud Rune");
    expect(titles(c)).toContain("Fire Rune");
  });

  it("withholds pools gated on a choice the sheet never recorded", () => {
    const c = preWiringRuneKnight();
    reconcileCharacterContent(c);
    // Frost Rune was never picked, and Runic Shield needs 7th level.
    expect(titles(c)).not.toContain("Frost Rune");
    expect(titles(c)).not.toContain("Runic Shield");
  });

  it("is idempotent: a second run changes nothing and says so", () => {
    const c = preWiringRuneKnight();
    reconcileCharacterContent(c);
    const settled = structuredClone(c);
    expect(reconcileCharacterContent(c)).toBe(false);
    expect(c).toEqual(settled);
  });

  it("preserves expenditure and hand-edits on pools it refreshes", () => {
    const c = preWiringRuneKnight();
    reconcileCharacterContent(c);
    const pool = c.limitedUseAbilities.find(
      (a) => a.info.title === "Cloud Rune",
    )!;
    pool.expended = 1;
    reconcileCharacterContent(c);
    expect(pool.expended).toBe(1);
  });
});

describe("hydrateCharacter content reconcile", () => {
  it("reports a backfilled sheet as migrated so write-on-read persists it", () => {
    const result = hydrateCharacter(preWiringRuneKnight());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(titles(result.character)).toContain("Giant's Might");
  });

  it("reports an already-reconciled sheet as unchanged", () => {
    const first = hydrateCharacter(preWiringRuneKnight());
    if (!first.ok) throw new Error("expected ok");
    const second = hydrateCharacter(structuredClone(first.character));
    expect(second.ok && second.migrated).toBe(false);
  });
});
