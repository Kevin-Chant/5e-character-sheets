import { describe, expect, it } from "vitest";
import { charPath, clearAt, fromStack, updateAt } from "src/lib/cursor";
import {
  DamageType,
  FIELD,
  SkillName,
  StatKey,
} from "src/lib/data/data-definitions";

// The whole point of cursors is that they serialize to the *exact* dot-path
// strings the pipeline used before, so the wire format / undo-redo / modal
// routing are byte-for-byte unchanged. These assert that parity for every path
// *shape* that appears in the editor inventory.
describe("Cursor serialization parity", () => {
  it("bare top-level field → no subField", () => {
    const c = charPath(FIELD.currHp);
    expect(c.root()).toBe(FIELD.currHp);
    expect(c.subpath()).toBeUndefined();
    expect(c.toString()).toBe("currHp");
  });

  it("array index (bare) → '0'", () => {
    const c = charPath(FIELD.attacks).at(0);
    expect(c.root()).toBe(FIELD.attacks);
    expect(c.subpath()).toBe("0");
    expect(c.toString()).toBe("attacks.0");
  });

  it("array index + prop → '0.name'", () => {
    const c = charPath(FIELD.attacks).at(0).k("name");
    expect(c.subpath()).toBe("0.name");
    expect(c.toString()).toBe("attacks.0.name");
  });

  it("enum-keyed record → 'skills.Acrobatics'", () => {
    const c = charPath(FIELD.proficiencies).k("skills").k(SkillName.Acrobatics);
    expect(c.subpath()).toBe("skills.Acrobatics");
  });

  it("saving-throw stat key → 'savingThrows.str'", () => {
    const c = charPath(FIELD.proficiencies).k("savingThrows").k(StatKey.str);
    expect(c.subpath()).toBe("savingThrows.str");
  });

  it("spell-slot override → '1.totalOverride'", () => {
    const c = charPath(FIELD.spellSlots).k(1).k("totalOverride");
    expect(c.subpath()).toBe("1.totalOverride");
  });

  it("spellcasting class override → '0.saveDcOverride'", () => {
    const c = charPath(FIELD.spellcastingClasses).at(0).k("saveDcOverride");
    expect(c.subpath()).toBe("0.saveDcOverride");
  });

  it("nested spell formula slot → '0.2.info.titleFormulas.1'", () => {
    const c = charPath(FIELD.spells)
      .k(0) // cantrips bucket
      .at(2)
      .k("info")
      .k("titleFormulas")
      .at(1);
    expect(c.subpath()).toBe("0.2.info.titleFormulas.1");
  });

  it("damage-map formula slot → 'formula.Fire'", () => {
    const c = charPath(FIELD.attacks).at(0).k("formula").k(DamageType.Fire);
    expect(c.subpath()).toBe("0.formula.Fire");
  });

  it("append sentinel → 'new'", () => {
    const c = charPath(FIELD.attacks).append();
    expect(c.subpath()).toBe("new");
    expect(c.toString()).toBe("attacks.new");
  });

  it("spell-bucket append sentinel → '0.new'", () => {
    const c = charPath(FIELD.spells).k(0).append();
    expect(c.subpath()).toBe("0.new");
  });
});

describe("fromStack round-trips the stack representation", () => {
  it("rebuilds a subField and re-serializes identically", () => {
    const c = fromStack(FIELD.attacks, "0.name");
    expect(c.root()).toBe(FIELD.attacks);
    expect(c.subpath()).toBe("0.name");
  });

  it("handles an undefined subField (whole field)", () => {
    const c = fromStack(FIELD.maxHp, undefined);
    expect(c.subpath()).toBeUndefined();
  });
});

describe("updateAt / clearAt produce the pipeline's Action shape", () => {
  it("updateAt matches updateData(field, {value}, subField)", () => {
    const action = updateAt(
      charPath(FIELD.attacks).at(0).k("name"),
      "Longsword",
    );
    expect(action).toEqual({
      type: "update_attacks",
      payload: { value: "Longsword" },
      subField: "0.name",
    });
  });

  it("updateAt on a bare field omits subField", () => {
    const action = updateAt(charPath(FIELD.currHp), 30);
    expect(action).toEqual({
      type: "update_currHp",
      payload: { value: 30 },
      subField: undefined,
    });
  });

  it("clearAt dispatches { value: undefined }", () => {
    const action = clearAt(charPath(FIELD.spellSlots).k(1).k("totalOverride"));
    expect(action).toEqual({
      type: "update_spellSlots",
      payload: { value: undefined },
      subField: "1.totalOverride",
    });
  });
});

describe("type-level guards (compile-time only)", () => {
  it("rejects illegal traversals and values", () => {
    // Descending *into* a CustomFormula is a dead end — formulas swap whole.
    // @ts-expect-error .k() is not available on a Cursor<CustomFormula>
    charPath(FIELD.acFormula).k("operation");

    // Wrong value type for a string leaf.
    // @ts-expect-error name is a string, not a number
    updateAt(charPath(FIELD.attacks).at(0).k("name"), 5);

    // Unknown key on a struct.
    // @ts-expect-error Attack has no `nope` property
    charPath(FIELD.attacks).at(0).k("nope");

    // `.at()` requires an array cursor.
    // @ts-expect-error currHp is a number, not an array
    charPath(FIELD.currHp).at(0);

    expect(true).toBe(true);
  });
});
