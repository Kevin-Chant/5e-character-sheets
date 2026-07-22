import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  StandardDie,
} from "src/lib/data/data-definitions";
import { randomUUID } from "src/lib/browser";

const WIZARD_ID = randomUUID();
const CLERIC_ID = randomUUID();
import { isTextComponentWithDetail } from "src/lib/types";
import { buildSpellFromSrd, parseDamageRoll } from "./srd-spell-adapter";
import { getSrdSpell, SrdSpell } from "./srd-spells";
import { spellDamageAtLevel } from "./spell-scaling";

const fireball: SrdSpell = {
  index: "fireball",
  name: "Fireball",
  level: 3,
  school: "Evocation",
  castingTime: "1 action",
  range: "150 feet",
  duration: "Instantaneous",
  concentration: false,
  ritual: false,
  verbal: true,
  somatic: true,
  material: "A tiny ball of bat guano and sulfur.",
  desc: "A bright streak flashes...",
  higherLevel: "the damage increases by 1d6 for each slot level above 3rd.",
  classes: ["Sorcerer", "Wizard"],
  save: "DEX",
  damageType: "Fire",
  baseDamage: "8d6",
  areaOfEffect: "20-foot sphere",
};

const cantrip: SrdSpell = {
  index: "guidance",
  name: "Guidance",
  level: 0,
  school: "Divination",
  castingTime: "1 action",
  range: "Touch",
  duration: "Concentration, up to 1 minute",
  concentration: true,
  ritual: false,
  verbal: true,
  somatic: true,
  desc: "You touch one willing creature...",
  classes: ["Cleric", "Druid"],
};

describe("parseDamageRoll", () => {
  it("parses NdM into a roll DieExpression", () => {
    expect(parseDamageRoll("8d6")).toEqual([
      8,
      StandardDie.d6,
      DieOperation.roll,
    ]);
    expect(parseDamageRoll(" 1d10 ")).toEqual([
      1,
      StandardDie.d10,
      DieOperation.roll,
    ]);
  });

  it("rejects malformed or non-standard dice", () => {
    expect(parseDamageRoll("8d6+2")).toBeUndefined();
    expect(parseDamageRoll("d6")).toBeUndefined();
    expect(parseDamageRoll("2d7")).toBeUndefined();
    expect(parseDamageRoll("0d6")).toBeUndefined();
  });
});

describe("buildSpellFromSrd", () => {
  it("maps core fields and attributes the class", () => {
    const spell = buildSpellFromSrd(fireball, WIZARD_ID);
    expect(spell.spellcastingClass).toBe(WIZARD_ID);
    expect(spell.info.title).toBe("Fireball");
    expect(spell.castingTime).toBe("1 action");
    expect(spell.range).toBe("150 feet");
    expect(spell.components).toEqual({
      verbal: true,
      somatic: true,
      material: [{ name: "A tiny ball of bat guano and sulfur." }],
    });
  });

  it("turns base damage into a live formula slot", () => {
    const spell = buildSpellFromSrd(fireball, WIZARD_ID);
    expect(isTextComponentWithDetail(spell.info)).toBe(true);
    if (!isTextComponentWithDetail(spell.info)) return;
    expect(spell.info.detailFormulas).toEqual([
      [8, StandardDie.d6, DieOperation.roll],
    ]);
    // One {{}} slot, matching the single detail formula.
    expect(spell.info.detail.match(/\{\{\}\}/g)).toHaveLength(1);
    expect(spell.info.detail).toContain(DamageType.Fire.toLowerCase());
    expect(spell.info.detail).toContain("At Higher Levels");
  });

  it("omits the damage slot for non-damaging spells and keeps slots balanced", () => {
    const spell = buildSpellFromSrd(cantrip, CLERIC_ID);
    expect(isTextComponentWithDetail(spell.info)).toBe(true);
    if (!isTextComponentWithDetail(spell.info)) return;
    expect(spell.info.detailFormulas).toEqual([]);
    expect(spell.info.detail).not.toContain("{{}}");
    expect(spell.concentration).toBe(true);
    expect(spell.ritual).toBeUndefined();
  });

  it("stamps the caster placeholder in healing with the spell's class", () => {
    // Cure Wounds heals 1d8 + spellcasting modifier; the importer marks the mod
    // with a placeholder class that the adapter must replace.
    const srd = getSrdSpell("cure-wounds");
    expect(srd?.mechanics?.healing).toBeDefined();
    const spell = buildSpellFromSrd(srd!, CLERIC_ID);
    const healing = spell.mechanics?.healing as {
      operands: Array<{ spellMod?: string }>;
    };
    // The spellMod leaf now carries the real class, not "@caster".
    const modLeaf = healing.operands.find((o) => o.spellMod);
    expect(modLeaf?.spellMod).toBe(CLERIC_ID);
    expect(JSON.stringify(spell.mechanics)).not.toContain("@caster");
  });

  it("carries structured mechanics through from the bundled catalog", () => {
    // End-to-end: the real bundled Fireball → mechanics → expanded damage.
    const srd = getSrdSpell("fireball");
    expect(srd).toBeDefined();
    const spell = buildSpellFromSrd(srd!, WIZARD_ID);
    expect(spell.mechanics?.scaling?.driver).toBe("slot");
    // Cast at slot 5 collapses to 10d6.
    expect(spellDamageAtLevel(spell.mechanics!, 5)).toEqual({
      [DamageType.Fire]: [10, StandardDie.d6, DieOperation.roll],
    });
  });
});
