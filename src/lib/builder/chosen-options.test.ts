import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { Character, IClass } from "src/lib/types";
import {
  OPTION_GROUPS,
  availableOptionGroups,
  chosenIn,
  optionFeaturesFor,
  optionGroup,
  optionSpellIndicesAt,
} from "./chosen-options";
import { getSrdSpell } from "src/lib/spells/srd-spells";
import { CLASS_POOLS, SUBCLASS_POOLS } from "src/lib/builder/class-pools";

const withClass = (...classes: Partial<IClass>[]): Character => {
  const c = structuredClone(defaultCharacter);
  c.class = classes.map((k) => ({
    id: randomUUID(),
    name: OfficialClass.Fighter,
    level: 1,
    ...k,
  }));
  return c;
};

const groupsFor = (c: Character) =>
  availableOptionGroups(c).map(({ group, known }) => [group.category, known]);

describe("availableOptionGroups", () => {
  it("offers nothing to a class with no option lists", () => {
    expect(
      groupsFor(withClass({ name: OfficialClass.Barbarian, level: 20 })),
    ).toEqual([]);
  });

  it("scales Metamagic picks with sorcerer level, and not before 3rd", () => {
    const at = (level: number) =>
      groupsFor(withClass({ name: OfficialClass.Sorcerer, level }));
    expect(at(2)).toEqual([]);
    expect(at(3)).toEqual([["metamagic", 2]]);
    expect(at(10)).toEqual([["metamagic", 3]]);
    expect(at(17)).toEqual([["metamagic", 4]]);
  });

  it("gates maneuvers on the Battle Master subclass, not just fighter level", () => {
    expect(
      groupsFor(withClass({ name: OfficialClass.Fighter, level: 10 })),
    ).toEqual([]);
    expect(
      groupsFor(
        withClass({
          name: OfficialClass.Fighter,
          level: 10,
          subclass: "Champion",
        }),
      ),
    ).toEqual([]);
    expect(
      groupsFor(
        withClass({
          name: OfficialClass.Fighter,
          level: 10,
          subclass: "Battle Master",
        }),
      ),
    ).toEqual([["maneuvers", 7]]);
  });

  it("a multiclass character gets every list they qualify for", () => {
    const c = withClass(
      { name: OfficialClass.Sorcerer, level: 3 },
      { name: OfficialClass.Warlock, level: 3 },
    );
    expect(groupsFor(c)).toEqual([
      ["metamagic", 2],
      ["pactBoon", 1],
    ]);
  });
});

describe("the option catalog", () => {
  it("has unique categories and unique option names within each", () => {
    const categories = OPTION_GROUPS.map((g) => g.category);
    expect(new Set(categories).size).toBe(categories.length);
    for (const group of OPTION_GROUPS) {
      const names = group.options.map((o) => o.name);
      expect(new Set(names).size, group.category).toBe(names.length);
      // Every option is described *somewhere*: either per-option, or once on
      // the group for "pick a type" lists where they all do the same thing.
      expect(
        group.options.every((o) => !!o.summary?.length) || !!group.summary,
        group.category,
      ).toBe(true);
    }
  });

  it("never offers fewer options than a class can know", () => {
    for (const group of OPTION_GROUPS) {
      const maxKnown = Math.max(...group.known.map(([, count]) => count));
      expect(group.options.length, group.category).toBeGreaterThanOrEqual(
        maxKnown,
      );
    }
  });

  it("looks a group up by category", () => {
    expect(optionGroup("metamagic")?.label).toBe("Metamagic");
    expect(optionGroup("nope")).toBeUndefined();
  });
});

describe("optionSpellIndicesAt", () => {
  const forest = [{ category: "landTerrain", name: "Forest" }];

  it("unlocks a terrain's spells as the class levels", () => {
    // 3rd: the two 3rd-level circle spells only.
    expect(optionSpellIndicesAt(forest, OfficialClass.Druid, 3)).toEqual([
      "barkskin",
      "spider-climb",
    ]);
    // 7th: everything through the 7th-level tier, cumulative.
    expect(optionSpellIndicesAt(forest, OfficialClass.Druid, 7)).toEqual([
      "barkskin",
      "spider-climb",
      "call-lightning",
      "plant-growth",
      "divination",
      "freedom-of-movement",
    ]);
  });

  it("consults only picks whose group belongs to the class being leveled", () => {
    // The same terrain pick contributes nothing while leveling a warlock dip.
    expect(optionSpellIndicesAt(forest, OfficialClass.Warlock, 9)).toEqual([]);
  });

  it("is empty before the first tier and for an option with no spells", () => {
    expect(optionSpellIndicesAt(forest, OfficialClass.Druid, 2)).toEqual([]);
    expect(
      optionSpellIndicesAt(
        [{ category: "metamagic", name: "Twinned Spell" }],
        OfficialClass.Sorcerer,
        20,
      ),
    ).toEqual([]);
  });
});

describe("optionFeaturesFor", () => {
  it("returns a pick's features only for its own class", () => {
    // Draconic Ancestry carries no features, so this is a shape check against a
    // real group: an unknown class yields nothing, the right class yields its
    // (here empty) feature list without throwing.
    const picks = [{ category: "draconicAncestry", name: "Red (fire)" }];
    expect(optionFeaturesFor(picks, OfficialClass.Wizard, 20)).toEqual([]);
    expect(optionFeaturesFor(picks, OfficialClass.Sorcerer, 20)).toEqual([]);
  });

  it("unlocks a pick's level-gated features as the class levels", () => {
    // Storm Herald's environment gates features across four levels.
    const picks = [{ category: "stormAura", name: "Tundra" }];
    const titlesAt = (level: number) =>
      optionFeaturesFor(picks, OfficialClass.Barbarian, level).map(
        (f) => f.title,
      );
    // 3rd: only the base aura; 6th: the aura plus the 6th-level feature.
    expect(titlesAt(3).length).toBeGreaterThan(0);
    expect(titlesAt(6).length).toBeGreaterThan(titlesAt(3).length);
    expect(titlesAt(2)).toEqual([]);
  });
});

describe("chosenIn", () => {
  it("filters the flat list by category, and copes with no picks at all", () => {
    const c = withClass({ name: OfficialClass.Sorcerer, level: 3 });
    expect(chosenIn(c, "metamagic")).toEqual([]);
    c.chosenOptions = [
      { category: "metamagic", name: "Twinned Spell" },
      { category: "pactBoon", name: "Pact of the Tome" },
      { category: "metamagic", name: "Quickened Spell" },
    ];
    expect(chosenIn(c, "metamagic").map((o) => o.name)).toEqual([
      "Twinned Spell",
      "Quickened Spell",
    ]);
  });
});

// The same join the subclass-spell registry is guarded on: an option that
// grants spells by index hands out nothing at all if the index is misspelled,
// and nothing else fails.
describe("option spell grants", () => {
  it("only names spell indices that resolve in the bundled catalog", () => {
    for (const group of OPTION_GROUPS)
      for (const option of group.options) {
        const indices = [
          ...(option.spellIndices?.always ?? []),
          ...Object.values(option.spellIndices?.byLevel ?? {}).flat(),
        ];
        for (const index of indices)
          expect(
            getSrdSpell(index),
            `${group.category}/${option.name}: "${index}" is not in the catalog`,
          ).toBeDefined();
      }
  });
});

// An option that spends a resource names its pool by title. A typo there is
// silent — `spendUses` finds no pool and the button does nothing — so the join
// is guarded the same way the spell-index one is.
describe("option action hosts", () => {
  const poolTitles = new Set(
    [
      ...Object.values(CLASS_POOLS).flat(),
      ...Object.values(SUBCLASS_POOLS).flat(),
    ].map((p) => p.title.toLowerCase()),
  );

  it("only drains pools that some class actually grants", () => {
    for (const group of OPTION_GROUPS)
      for (const option of group.options) {
        if (!option.action) continue;
        expect(
          poolTitles.has(option.action.pool.toLowerCase()),
          `${group.category}/${option.name}: no pool titled "${option.action.pool}"`,
        ).toBe(true);
      }
  });

  it("gives every metamagic option a sorcery-point cost", () => {
    const metamagic = optionGroup("metamagic")!;
    for (const option of metamagic.options) {
      expect(option.action, option.name).toBeDefined();
      expect(option.action!.pool).toBe("Sorcery Points");
    }
    // Twinned Spell's cost is the spell's level, which only the player knows.
    const twinned = metamagic.options.find((o) => o.name === "Twinned Spell");
    expect(twinned!.action!.amount).toBe("choose");
  });
});
