import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { Character } from "src/lib/types";
import { preparedSpellsFor, preparedSpellCount } from "src/lib/rules";
import { addCatalogSpell, addCatalogSpellOnce } from "./grant-spells";

const classed = (name: OfficialClass, level: number): Character => {
  const c = structuredClone(defaultCharacter);
  const id = randomUUID();
  c.class = [{ id, name, level, subclass: "Life" }];
  c.spellcastingClasses = [{ classId: id }];
  c.spells = {};
  return c;
};

describe("always-prepared grants", () => {
  it("marks a prepared caster's granted spell and keeps it off the allowance", () => {
    const c = classed(OfficialClass.Cleric, 3);
    addCatalogSpell(c, "bless", OfficialClass.Cleric, true);
    addCatalogSpell(c, "cure-wounds", OfficialClass.Cleric);
    c.spells[1]![1].prepared = true;

    const [granted, chosen] = c.spells[1]!;
    expect(granted.alwaysPrepared).toBe(true);
    expect(granted.prepared).toBe(true);
    expect(chosen.alwaysPrepared).toBeUndefined();
    // Only the one the player prepared counts.
    expect(preparedSpellsFor(c, c.class[0].id)).toBe(1);
    expect(preparedSpellCount(c, c.class[0])).toBeGreaterThan(0);
  });

  it("leaves a known caster's expanded list alone — those still have to be learned", () => {
    const c = classed(OfficialClass.Warlock, 3);
    addCatalogSpell(c, "bless", OfficialClass.Warlock, true);
    expect(c.spells[1]![0].alwaysPrepared).toBeUndefined();
    expect(c.spells[1]![0].prepared).toBeUndefined();
  });

  it("never marks a cantrip, which is never prepared in the first place", () => {
    const c = classed(OfficialClass.Cleric, 3);
    addCatalogSpellOnce(c, "guidance", OfficialClass.Cleric, true);
    expect(c.spells[0]![0].alwaysPrepared).toBeUndefined();
  });
});
