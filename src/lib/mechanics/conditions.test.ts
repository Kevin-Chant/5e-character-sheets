import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  Operation,
  PB,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { Attack } from "src/lib/types";
import {
  WEAPON_PRESETS,
  buildAttackFromPreset,
  weaponTags,
} from "src/lib/data/weapon-presets";
import { ActiveRider } from "./types";
import {
  applicableRiders,
  attackContext,
  conditionEligibility,
  needsOptIn,
  riderEligibility,
} from "./conditions";

const preset = (name: string) => {
  const found = WEAPON_PRESETS.flatMap((g) => g.options).find(
    (w) => w.name === name,
  );
  if (!found) throw new Error(`no such weapon preset: ${name}`);
  return found;
};

const attack = (name: string, twoHanded = false) =>
  buildAttackFromPreset(preset(name), twoHanded);

const rider = (r: ActiveRider["rider"], source = "test"): ActiveRider => ({
  source,
  rider: r,
});

describe("weaponTags", () => {
  it("derives melee/ranged from the SRD group, not a per-weapon field", () => {
    expect(weaponTags(preset("Greatsword"))).toContain("melee");
    expect(weaponTags(preset("Longbow"))).toContain("ranged");
    expect(weaponTags(preset("Longbow"))).not.toContain("melee");
  });

  it("tags a melee weapon with a range as thrown, and a ranged one not", () => {
    expect(weaponTags(preset("Handaxe"))).toContain("thrown");
    // A longbow's range is just its range.
    expect(weaponTags(preset("Longbow"))).not.toContain("thrown");
  });

  it("derives finesse from the weapon's ability", () => {
    expect(weaponTags(preset("Rapier"))).toContain("finesse");
    expect(weaponTags(preset("Longsword"))).not.toContain("finesse");
  });

  it("makes two-handed a property of the attack, not the weapon", () => {
    // A versatile weapon is only two-handed in its (2H) variant — which is what
    // Great Weapon Fighting and Dueling actually key off.
    expect(weaponTags(preset("Longsword"))).toEqual(
      expect.arrayContaining(["melee", "versatile"]),
    );
    expect(weaponTags(preset("Longsword"))).not.toContain("two-handed");
    expect(weaponTags(preset("Longsword"), true)).toContain("two-handed");
    // A greatsword is two-handed either way.
    expect(weaponTags(preset("Greatsword"))).toContain("two-handed");
  });

  it("only names real weapons in the extra-properties table", () => {
    // Guards the one table that isn't derived: a typo'd or renamed weapon there
    // would silently lose its properties.
    const names = new Set(
      WEAPON_PRESETS.flatMap((g) => g.options).map((w) => w.name),
    );
    for (const w of WEAPON_PRESETS.flatMap((g) => g.options))
      expect(names.has(w.name)).toBe(true);
    // Every heavy/two-handed weapon we care about resolves through the table.
    expect(weaponTags(preset("Greataxe"))).toEqual(
      expect.arrayContaining(["heavy", "two-handed", "melee"]),
    );
  });
});

describe("attackContext", () => {
  it("reads the single ability off the to-hit formula", () => {
    expect(attackContext(attack("Greatsword")).ability).toBe(StatKey.str);
    expect(attackContext(attack("Longbow")).ability).toBe(StatKey.dex);
  });

  it("leaves a finesse weapon's ability undefined — max(STR, DEX) names two", () => {
    expect(attackContext(attack("Rapier")).ability).toBeUndefined();
  });

  it("reports no tags at all for an attack that carries none", () => {
    expect(attackContext({ ...attack("Greatsword"), tags: undefined })).toEqual(
      { tags: undefined, ability: StatKey.str },
    );
    expect(attackContext(undefined)).toEqual({});
  });
});

describe("conditionEligibility", () => {
  const bow = attackContext(attack("Longbow"));
  const greatsword = attackContext(attack("Greatsword"));
  const rapier = attackContext(attack("Rapier"));

  it("is yes with no condition at all", () => {
    expect(conditionEligibility(undefined, bow)).toBe("yes");
    expect(conditionEligibility({}, bow)).toBe("yes");
  });

  it("requires every tag in `tags`", () => {
    expect(conditionEligibility({ tags: ["ranged"] }, bow)).toBe("yes");
    expect(conditionEligibility({ tags: ["ranged"] }, greatsword)).toBe("no");
    expect(
      conditionEligibility({ tags: ["melee", "two-handed"] }, greatsword),
    ).toBe("yes");
  });

  it("requires only one of `anyTags`", () => {
    expect(conditionEligibility({ anyTags: ["finesse", "ranged"] }, bow)).toBe(
      "yes",
    );
    expect(
      conditionEligibility({ anyTags: ["finesse", "ranged"] }, rapier),
    ).toBe("yes");
    expect(
      conditionEligibility({ anyTags: ["finesse", "ranged"] }, greatsword),
    ).toBe("no");
  });

  it("rejects anything in `without`", () => {
    expect(
      conditionEligibility(
        { tags: ["melee"], without: ["two-handed"] },
        greatsword,
      ),
    ).toBe("no");
  });

  it("is unknown when the attack has no tags to judge by", () => {
    expect(conditionEligibility({ tags: ["ranged"] }, {})).toBe("unknown");
  });

  it("is unknown when the ability is ambiguous, but a tag failure still wins", () => {
    // Rapier: finesse, so the ability is unknowable — the STR clause can't be
    // settled …
    expect(
      conditionEligibility({ tags: ["melee"], ability: [StatKey.str] }, rapier),
    ).toBe("unknown");
    // … but a decidable failure elsewhere beats any number of unknowns.
    expect(
      conditionEligibility(
        { tags: ["ranged"], ability: [StatKey.str] },
        rapier,
      ),
    ).toBe("no");
  });
});

describe("applicableRiders / needsOptIn", () => {
  // Archery's shape: decidable from the weapon, no `optional` flag.
  const archery = rider(
    {
      rider: "bonus",
      value: 2,
      note: "ranged weapons only",
      requires: { tags: ["ranged"] },
    },
    "Archery",
  );
  // Rage's shape: decidable weapon half, plus a state the sheet can't see.
  const rage = rider(
    {
      rider: "extraDamage",
      amount: 2,
      declareAt: "on-hit",
      optional: true,
      requires: { tags: ["melee"], ability: [StatKey.str] },
    },
    "Rage",
  );

  it("drops riders the weapon rules out", () => {
    const onBow = applicableRiders(
      [archery, rage],
      attackContext(attack("Longbow")),
    );
    expect(onBow.map((r) => r.source)).toEqual(["Archery"]);

    const onGreatsword = applicableRiders(
      [archery, rage],
      attackContext(attack("Greatsword")),
    );
    expect(onGreatsword.map((r) => r.source)).toEqual(["Rage"]);
  });

  it("keeps everything when the attack is untagged", () => {
    expect(applicableRiders([archery, rage], {})).toHaveLength(2);
  });

  it("applies a settled weapon condition on its own", () => {
    expect(needsOptIn(archery, attackContext(attack("Longbow")))).toBe(false);
  });

  it("falls back to a prompt on an untagged attack", () => {
    expect(needsOptIn(archery, {})).toBe(true);
  });

  it("still prompts for a non-weapon condition even when the weapon fits", () => {
    // Rage on a greatsword: the weapon qualifies, but "are you raging" doesn't
    // come from the sheet.
    expect(needsOptIn(rage, attackContext(attack("Greatsword")))).toBe(true);
  });
});

describe("hand-built attacks", () => {
  it("an untagged custom attack behaves exactly as it did before tags", () => {
    // The whole compatibility promise: no tags means "unknown", so every
    // conditional rider is offered as a tick rather than guessed at.
    const custom: Attack = {
      id: "00000000-0000-0000-0000-0000000000ff",
      name: "Mystery Blade",
      bonus: { operation: Operation.addition, operands: [StatKey.str, PB] },
      formula: {
        [DamageType.Slashing]: [1, StandardDie.d8, DieOperation.roll],
      },
    };
    const context = attackContext(custom);
    expect(context.tags).toBeUndefined();
    expect(
      riderEligibility(
        rider({ rider: "bonus", value: 2, requires: { tags: ["ranged"] } }),
        context,
      ),
    ).toBe("unknown");
  });
});
