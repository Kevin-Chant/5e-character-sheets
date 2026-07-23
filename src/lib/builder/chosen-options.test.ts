import { describe, expect, it } from "vitest";
import { OfficialClass } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { randomUUID } from "src/lib/browser";
import { Character, IClass } from "src/lib/types";
import {
  OPTION_GROUPS,
  availableOptionGroups,
  chosenIn,
  optionGroup,
} from "./chosen-options";

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
