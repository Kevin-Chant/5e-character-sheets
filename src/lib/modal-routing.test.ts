import { describe, expect, it } from "vitest";
import { FIELD, StatKey } from "src/lib/data/data-definitions";
import {
  matchedRouteName,
  resolveModalType,
  ROUTE_NAMES,
} from "./modal-routing";

// Pins every branch the old if/else chain in charsheet.tsx had, so the routing
// can be changed with something other than hope.

describe("resolveModalType", () => {
  it("falls back to the field's own editor when no rule matches", () => {
    expect(resolveModalType(FIELD.name)).toBe("string");
    expect(resolveModalType(FIELD.currHp)).toBe("number");
    expect(resolveModalType(FIELD.acFormula)).toBe("formula");
    expect(resolveModalType(FIELD.attacks)).toBe("attack");
    expect(resolveModalType(FIELD.equipment, "0")).toBe("equipment");
    expect(resolveModalType(FIELD.limitedUseAbilities, "0")).toBe(
      "limitedUseAbility",
    );
  });

  it("routes the two 'add new' sentinels to their pickers", () => {
    expect(resolveModalType(FIELD.attacks, "new")).toBe("selectWeapon");
    expect(resolveModalType(FIELD.spells, "0.new")).toBe("selectSpell");
    expect(resolveModalType(FIELD.spells, "3.new")).toBe("selectSpell");
  });

  it("distinguishes an attack's damage map from its other formulas", () => {
    expect(resolveModalType(FIELD.attacks, "0.formula")).toBe(
      "formulaWithDamage",
    );
    // Deeper into the damage map is a single-type formula again.
    expect(resolveModalType(FIELD.attacks, "0.formula.Slashing")).toBe(
      "formula",
    );
    expect(resolveModalType(FIELD.attacks, "0.bonus")).toBe("formula");
    // The save DC added with save-based attacks.
    expect(resolveModalType(FIELD.attacks, "0.save.dc")).toBe("formula");
  });

  it("routes each spellcasting-class sub-field", () => {
    expect(resolveModalType(FIELD.spellcastingClasses, "0.class")).toBe(
      "singleClass",
    );
    expect(
      resolveModalType(FIELD.spellcastingClasses, "0.abilityOverride"),
    ).toBe(StatKey);
    expect(
      resolveModalType(FIELD.spellcastingClasses, "0.saveDcOverride"),
    ).toBe("formula");
    expect(
      resolveModalType(FIELD.spellcastingClasses, "0.attackBonusOverride"),
    ).toBe("formula");
    expect(() =>
      resolveModalType(FIELD.spellcastingClasses, "0.nonsense"),
    ).toThrow(/Unexpected subfield/);
  });

  it("splits the proficiencies field three ways", () => {
    expect(resolveModalType(FIELD.proficiencies, "skills")).toBe("editSkills");
    expect(resolveModalType(FIELD.proficiencies, "skillBonuses.Stealth")).toBe(
      "formula",
    );
    // Anything else is the plain boolean editor.
    expect(resolveModalType(FIELD.proficiencies, "savingThrows.str")).toBe(
      "boolean",
    );
  });

  it("splits otherProficiencies by section", () => {
    expect(resolveModalType(FIELD.otherProficiencies, "armor")).toBe(
      "armorProficiencies",
    );
    expect(resolveModalType(FIELD.otherProficiencies, "toolsAndOther.0")).toBe(
      "textLine",
    );
    expect(
      resolveModalType(
        FIELD.otherProficiencies,
        "toolsAndOther.0.titleFormulas.0",
      ),
    ).toBe("formula");
    expect(resolveModalType(FIELD.otherProficiencies, "languages")).toBe(
      "string",
    );
    expect(resolveModalType(FIELD.otherProficiencies, "weapons")).toBe(
      "string",
    );
  });

  it("routes a limited-use ability's three kinds of formula leaf", () => {
    for (const sub of [
      "0.info.titleFormulas.0",
      "0.maxUses",
      // The save DC — this exact path used to reopen the ability editor.
      "0.save.dc",
    ])
      expect(resolveModalType(FIELD.limitedUseAbilities, sub), sub).toBe(
        "formula",
      );
  });

  it("routes formula slots inside text lines and spells", () => {
    expect(resolveModalType(FIELD.features, "0.titleFormulas.0")).toBe(
      "formula",
    );
    expect(resolveModalType(FIELD.spells, "1.0.info.detailFormulas.0")).toBe(
      "formula",
    );
    // …but a spell itself opens the spell editor.
    expect(resolveModalType(FIELD.spells, "1.0")).toBe("spell");
  });

  it("throws for a field with no registered editor", () => {
    expect(() => resolveModalType("nope" as FIELD)).toThrow(
      /Unsupported field type/,
    );
  });
});

describe("the route table", () => {
  it("has no unreachable rule", () => {
    // Each rule must be the *first* match for at least one real path, or it's
    // shadowed by an earlier one and only looks load-bearing.
    const samples: [FIELD, string | undefined][] = [
      [FIELD.attacks, "new"],
      [FIELD.attacks, "0.formula"],
      [FIELD.attacks, "0.bonus"],
      [FIELD.spellcastingClasses, "0.class"],
      [FIELD.proficiencies, "skillBonuses.Stealth"],
      [FIELD.proficiencies, "skills"],
      [FIELD.otherProficiencies, "armor"],
      [FIELD.otherProficiencies, "toolsAndOther.0"],
      [FIELD.otherProficiencies, "languages"],
      [FIELD.equipment, "0.text.titleFormulas.0"],
      [FIELD.limitedUseAbilities, "0.maxUses"],
      [FIELD.spells, "0.new"],
      [FIELD.features, "0.titleFormulas.0"],
    ];
    const hit = new Set(samples.map(([f, s]) => matchedRouteName(f, s)));
    for (const name of ROUTE_NAMES) expect(hit, name).toContain(name);
  });
});
