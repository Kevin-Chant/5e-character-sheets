import { describe, expect, it } from "vitest";
import {
  DamageType,
  DieOperation,
  Operation,
  PB,
  SkillName,
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
    expect(weaponTags(preset("Longbow"))).not.toContain("thrown");
  });

  it("derives finesse from the weapon's ability", () => {
    expect(weaponTags(preset("Rapier"))).toContain("finesse");
    expect(weaponTags(preset("Longsword"))).not.toContain("finesse");
  });

  it("makes two-handed a property of the attack, not the weapon", () => {
    expect(weaponTags(preset("Longsword"))).toEqual(
      expect.arrayContaining(["melee", "versatile"]),
    );
    expect(weaponTags(preset("Longsword"))).not.toContain("two-handed");
    expect(weaponTags(preset("Longsword"), true)).toContain("two-handed");
    expect(weaponTags(preset("Greatsword"))).toContain("two-handed");
  });

  it("only names real weapons in the extra-properties table", () => {
    const names = new Set(
      WEAPON_PRESETS.flatMap((g) => g.options).map((w) => w.name),
    );
    for (const w of WEAPON_PRESETS.flatMap((g) => g.options))
      expect(names.has(w.name)).toBe(true);
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
    expect(
      conditionEligibility({ tags: ["melee"], ability: [StatKey.str] }, rapier),
    ).toBe("unknown");
    expect(
      conditionEligibility(
        { tags: ["ranged"], ability: [StatKey.str] },
        rapier,
      ),
    ).toBe("no");
  });
});

describe("applicableRiders / needsOptIn", () => {
  const archery = rider(
    {
      rider: "bonus",
      value: 2,
      note: "ranged weapons only",
      requires: { tags: ["ranged"] },
    },
    "Archery",
  );
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
    expect(needsOptIn(rage, attackContext(attack("Greatsword")))).toBe(true);
  });
});

describe("hand-built attacks", () => {
  it("an untagged custom attack behaves exactly as it did before tags", () => {
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

describe("skill and proficiency clauses", () => {
  const check = (
    condition: Parameters<typeof conditionEligibility>[0],
    context: Parameters<typeof conditionEligibility>[1],
  ) => conditionEligibility(condition, context);

  it("scopes a rider to named skills", () => {
    const silverTongue = {
      skill: [SkillName.Persuasion, SkillName.Deception],
    };
    expect(check(silverTongue, { skill: SkillName.Persuasion })).toBe("yes");
    expect(check(silverTongue, { skill: SkillName.Stealth })).toBe("no");
  });

  it("treats a check with no skill as unknown, not excluded", () => {
    expect(check({ skill: [SkillName.Persuasion] }, {})).toBe("unknown");
  });

  it("reads proficiency in both directions", () => {
    expect(check({ proficiency: "proficient" }, { proficient: true })).toBe(
      "yes",
    );
    expect(check({ proficiency: "proficient" }, { proficient: false })).toBe(
      "no",
    );
    expect(check({ proficiency: "unproficient" }, { proficient: false })).toBe(
      "yes",
    );
    expect(check({ proficiency: "unproficient" }, { proficient: true })).toBe(
      "no",
    );
    expect(check({ proficiency: "proficient" }, {})).toBe("unknown");
  });

  it("keeps Remarkable Athlete off a proficient Athletics check", () => {
    const remarkableAthlete = {
      ability: [StatKey.str, StatKey.dex, StatKey.con],
      proficiency: "unproficient" as const,
    };
    expect(
      check(remarkableAthlete, {
        skill: SkillName.Athletics,
        ability: StatKey.str,
        proficient: true,
      }),
    ).toBe("no");
    expect(
      check(remarkableAthlete, {
        skill: SkillName.Acrobatics,
        ability: StatKey.dex,
        proficient: false,
      }),
    ).toBe("yes");
    // An INT skill is out of scope whatever the proficiency.
    expect(
      check(remarkableAthlete, {
        skill: SkillName.Arcana,
        ability: StatKey.int,
        proficient: false,
      }),
    ).toBe("no");
  });
});
