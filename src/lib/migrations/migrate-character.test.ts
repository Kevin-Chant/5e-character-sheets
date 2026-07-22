import { describe, expect, it } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { validateCharacterData } from "src/lib/fields";
import { CURRENT_SCHEMA_VERSION, migrateCharacter } from "./migrate-character";
import { hydrateCharacter } from "./hydrate-character";

describe("migrateCharacter", () => {
  it("upgrades a pre-versioning (v0) character to a schema-valid current one", () => {
    // A character from before schemaVersion existed: strip the field entirely.
    const { schemaVersion: _omit, ...v0 } = structuredClone(defaultCharacter);
    void _omit;

    const migrated = migrateCharacter(v0);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const [valid, errors] = validateCharacterData(migrated);
    expect(errors).toBeFalsy();
    expect(valid).toBe(true);
  });

  it("backfills missing required fields on a truncated but character-shaped save", () => {
    const truncated = {
      uuid: "11111111-1111-1111-1111-111111111111",
      name: "Truncated Tim",
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    };

    const [valid] = validateCharacterData(migrateCharacter(truncated));
    expect(valid).toBe(true);
  });

  it("is a no-op for a character already at the current version", () => {
    const current = structuredClone(defaultCharacter);
    expect(migrateCharacter(current)).toEqual(current);
  });

  it("v3 parses a legacy race string into a structured race object", () => {
    // A real v2 character had a flat numeric `speed` and no `speeds`/`senses`.
    const {
      speeds: _s,
      senses: _n,
      ...base
    } = structuredClone(defaultCharacter);
    void _s;
    void _n;
    const legacy = {
      ...base,
      schemaVersion: 2,
      race: "Elf (High Elf)",
      speed: 35,
    };
    const migrated = migrateCharacter(legacy);
    expect(migrated.race).toEqual({
      name: "Elf",
      subrace: "High Elf",
      size: "Medium",
    });
    // Flat speed → structured speeds.walk; the old field is dropped; senses start
    // empty (a legacy save has no structured senses).
    expect(migrated.speeds).toEqual({ walk: 35 });
    expect(migrated.speed).toBeUndefined();
    expect(migrated.senses).toEqual({});
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });

  it("v4 remaps word-keyed spell buckets to numeric levels", () => {
    const legacy = {
      ...structuredClone(defaultCharacter),
      schemaVersion: 3,
      spells: { cantrips: [{ marker: "c" }], First: [{ marker: "1" }] },
      spellSlots: { First: { expended: 1 }, Third: { expended: 0 } },
    };
    const migrated = migrateCharacter(legacy);
    expect(migrated.spells[0]).toEqual([{ marker: "c" }]);
    expect(migrated.spells[1]).toEqual([{ marker: "1" }]);
    expect(migrated.spells.cantrips).toBeUndefined();
    expect(migrated.spellSlots[1]).toEqual({ expended: 1 });
    expect(migrated.spellSlots[3]).toEqual({ expended: 0 });
  });

  it("v5 gives classes ids and rewrites name-based references to them", () => {
    const legacy = {
      ...structuredClone(defaultCharacter),
      schemaVersion: 4,
      class: [{ name: "Wizard", level: 5 }],
      spellcastingClasses: [{ class: "Wizard", abilityOverride: "int" }],
      spells: {
        0: [
          {
            spellcastingClass: "Wizard",
            info: { title: "Fire Bolt", titleFormulas: [] },
          },
        ],
      },
      // A limited-use pool scaled by "Wizard level" (bare class-name leaf) and a
      // spellMod leaf carrying the class name.
      limitedUseAbilities: [
        {
          info: { title: "Arcane Recovery", titleFormulas: [] },
          maxUses: "Wizard",
          recharge: "Long Rest",
          expended: 0,
        },
      ],
    };
    const migrated = migrateCharacter(legacy);
    const wizardId = migrated.class[0].id;
    expect(typeof wizardId).toBe("string");
    expect(migrated.spellcastingClasses[0]).toEqual({
      classId: wizardId,
      abilityOverride: "int",
    });
    expect(migrated.spells[0][0].spellcastingClass).toBe(wizardId);
    // Bare class-name leaf became an id-tagged classLevel leaf.
    expect(migrated.limitedUseAbilities[0].maxUses).toEqual({
      classLevel: wizardId,
    });
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });

  it("v6 gives attacks ids and seeds an empty ammunition list", () => {
    const { ammunition: _drop, ...rest } = structuredClone(defaultCharacter);
    const legacy = {
      ...rest,
      schemaVersion: 5,
      attacks: [
        { name: "Longbow", bonus: 0, formula: {} },
        { name: "Shortsword", bonus: 0, formula: {} },
      ],
    };
    const migrated = migrateCharacter(legacy);
    expect(migrated.ammunition).toEqual([]);
    expect(typeof migrated.attacks[0].id).toBe("string");
    expect(typeof migrated.attacks[1].id).toBe("string");
    // Distinct ids per attack.
    expect(migrated.attacks[0].id).not.toBe(migrated.attacks[1].id);
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });

  it("v7 seeds empty damage modifiers", () => {
    const { damageModifiers: _drop, ...rest } =
      structuredClone(defaultCharacter);
    const legacy = { ...rest, schemaVersion: 6 };
    const migrated = migrateCharacter(legacy);
    expect(migrated.damageModifiers).toEqual({
      resistances: [],
      immunities: [],
      vulnerabilities: [],
    });
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });

  it("v8 seeds an empty skillBonuses map", () => {
    const base = structuredClone(defaultCharacter);
    const { skillBonuses: _drop, ...proficiencies } = base.proficiencies;
    const legacy = { ...base, schemaVersion: 7, proficiencies };
    const migrated = migrateCharacter(legacy);
    expect(migrated.proficiencies.skillBonuses).toEqual({});
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });

  it("v9 wraps free-text equipment into structured items", () => {
    const legacy = {
      ...structuredClone(defaultCharacter),
      schemaVersion: 8,
      equipment: [
        { title: "Rope", titleFormulas: [] },
        { title: "Torch", titleFormulas: [], detail: "10", detailFormulas: [] },
      ],
    };
    const migrated = migrateCharacter(legacy);
    expect(migrated.equipment).toHaveLength(2);
    // The original TextComponent is preserved verbatim under `text`.
    expect(migrated.equipment[0].text).toEqual({
      title: "Rope",
      titleFormulas: [],
    });
    expect(migrated.equipment[0]).toMatchObject({
      quantity: 1,
      equipped: false,
    });
    expect(typeof migrated.equipment[0].id).toBe("string");
    expect(migrated.equipment[1].text.detail).toBe("10");
    // Distinct ids per item; no attunement/weight added.
    expect(migrated.equipment[0].id).not.toBe(migrated.equipment[1].id);
    expect(migrated.equipment[0].attunement).toBeUndefined();
    const [valid] = validateCharacterData(migrated);
    expect(valid).toBe(true);
  });
});

describe("hydrateCharacter", () => {
  it("accepts the default character without reporting a migration", () => {
    const result = hydrateCharacter(structuredClone(defaultCharacter));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(false);
  });

  it("reports migrated=true when an old character is upgraded", () => {
    const { schemaVersion: _omit, ...v0 } = structuredClone(defaultCharacter);
    void _omit;
    const result = hydrateCharacter(v0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(true);
  });

  it.each([null, undefined, 42, "nonsense", {}, { uuid: 123 }])(
    "returns ok:false (never throws) on garbage input %o",
    (garbage) => {
      const result = hydrateCharacter(garbage);
      expect(result.ok).toBe(false);
    },
  );
});
