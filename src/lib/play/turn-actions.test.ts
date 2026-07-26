import { describe, expect, it } from "vitest";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character, Spell } from "src/lib/types";
import {
  groupByCost,
  normalizeCastingTime,
  turnActions,
} from "src/lib/play/turn-actions";

// A neutral base: `defaultCharacter` ships mid-adventuring-day (see the rest
// system's decision record), so anything asserting on availability has to reset
// the play state it arrives with.
function baseCharacter(): Character {
  const character = structuredClone(defaultCharacter) as Character;
  character.attacks = [];
  character.spells = {};
  character.limitedUseAbilities = [];
  return character;
}

// `TextComponent` carries a formula list alongside its title; nothing here
// exercises formulas, so every fixture gets an empty one.
function text(title: string) {
  return { title, titleFormulas: [] };
}

function spell(over: Partial<Spell> = {}): Spell {
  return {
    spellcastingClass: defaultCharacter.class[0].id,
    info: text("Test Spell"),
    ...over,
  } as Spell;
}

describe("normalizeCastingTime", () => {
  it("maps the three action-economy casting times", () => {
    expect(normalizeCastingTime("1 action").cost).toBe("action");
    expect(normalizeCastingTime("1 bonus action").cost).toBe("bonusAction");
    expect(normalizeCastingTime("1 reaction").cost).toBe("reaction");
  });

  it("keeps a reaction's trigger as the note", () => {
    expect(
      normalizeCastingTime(
        "1 reaction, which you take when you are hit by an attack",
      ),
    ).toEqual({
      cost: "reaction",
      note: "which you take when you are hit by an attack",
    });
  });

  it("treats anything longer as its own group, keeping the raw text", () => {
    expect(normalizeCastingTime("1 minute")).toEqual({
      cost: "special",
      note: "1 minute",
    });
    expect(normalizeCastingTime("8 hours")).toEqual({
      cost: "special",
      note: "8 hours",
    });
  });

  it("falls back to an action when a hand-authored spell has none", () => {
    expect(normalizeCastingTime(undefined)).toEqual({ cost: "action" });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeCastingTime("  1 Bonus Action ").cost).toBe("bonusAction");
  });
});

describe("turnActions", () => {
  it("groups a weapon attack under Action", () => {
    const character = baseCharacter();
    character.attacks = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Longsword",
        formula: { Slashing: 8 },
      },
    ] as Character["attacks"];
    const groups = groupByCost(turnActions(character));
    expect(groups.action.map((a) => a.name)).toEqual(["Longsword"]);
  });

  it("splits spells across groups by casting time", () => {
    const character = baseCharacter();
    character.spells = {
      0: [spell({ info: text("Fire Bolt"), castingTime: "1 action" })],
      1: [
        spell({
          info: text("Shield"),
          castingTime: "1 reaction",
          prepared: true,
        }),
        spell({
          info: text("Healing Word"),
          castingTime: "1 bonus action",
          prepared: true,
        }),
        spell({
          info: text("Detect Magic"),
          castingTime: "1 minute",
          prepared: true,
        }),
      ],
    };
    const groups = groupByCost(turnActions(character));
    expect(groups.action.map((a) => a.name)).toEqual(["Fire Bolt"]);
    expect(groups.reaction.map((a) => a.name)).toEqual(["Shield"]);
    expect(groups.bonusAction.map((a) => a.name)).toEqual(["Healing Word"]);
    expect(groups.special.map((a) => a.name)).toEqual(["Detect Magic"]);
  });

  it("marks a leveled spell unavailable once its slots are gone", () => {
    const character = baseCharacter();
    character.spells = {
      1: [spell({ info: text("Magic Missile"), prepared: true })],
    };
    const total = character.spellSlots[1].totalOverride ?? 0;
    character.spellSlots[1] = { totalOverride: total, expended: total };
    const [missile] = turnActions(character);
    expect(missile.available).toBe(false);
  });

  it("keeps cantrips available with no slots left", () => {
    const character = baseCharacter();
    character.spells = { 0: [spell({ info: text("Fire Bolt") })] };
    Object.keys(character.spellSlots).forEach((level) => {
      character.spellSlots[Number(level) as 1] = {
        totalOverride: 0,
        expended: 0,
      };
    });
    expect(turnActions(character)[0].available).toBe(true);
  });

  it("dims a prepared caster's unprepared spells rather than hiding them", () => {
    const character = baseCharacter();
    // The default character's first class is a Paladin — a prepared caster.
    character.spells = {
      0: [spell({ info: text("Light") })],
      1: [
        spell({ info: text("Bless"), prepared: true }),
        spell({ info: text("Heroism"), prepared: false }),
      ],
    };
    const actions = turnActions(character);
    // Every spell is still on the board — an empty board is worse than a
    // truthful one.
    expect(actions.map((a) => a.name)).toEqual(["Light", "Bless", "Heroism"]);
    const heroism = actions.find((a) => a.name === "Heroism");
    expect(heroism?.available).toBe(false);
    expect(heroism?.note).toBe("not prepared");
    expect(actions.find((a) => a.name === "Bless")?.available).toBe(true);
  });

  it("gives a pool one row per action it offers", () => {
    const character = baseCharacter();
    character.limitedUseAbilities = [
      {
        info: text("Ki"),
        maxUses: 5,
        recharge: "Short Rest",
        expended: 0,
        mechanics: {
          actions: [
            {
              id: "flurry",
              name: "Flurry of Blows",
              cost: "bonusAction",
              effects: [{ effect: "spendUses", amount: { fixed: 1 } }],
            },
            {
              id: "patient",
              name: "Patient Defense",
              cost: "bonusAction",
              effects: [{ effect: "spendUses", amount: { fixed: 1 } }],
            },
          ],
        },
      },
    ] as Character["limitedUseAbilities"];
    const groups = groupByCost(turnActions(character));
    expect(groups.bonusAction.map((a) => a.name)).toEqual([
      "Flurry of Blows",
      "Patient Defense",
    ]);
  });

  it("produces stable keys so rows don't remount as state changes", () => {
    const character = baseCharacter();
    character.spells = { 1: [spell({ info: text("Bless"), prepared: true })] };
    const first = turnActions(character).map((a) => a.key);
    character.currHp = 1;
    expect(turnActions(character).map((a) => a.key)).toEqual(first);
  });
});
