import { describe, expect, it } from "vitest";
import {
  Alignment,
  ArmorType,
  DamageType,
  OfficialClass,
  SkillName,
  StandardDie,
} from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import {
  describeStartingWealth,
  rollStartingWealth,
  startingWealthFor,
} from "src/lib/builder/equipment";
import { BuilderState, defaultBuilderState } from "src/lib/builder/types";
import { defaultCharacter } from "src/lib/data/default-data";
import { chosenIn } from "src/lib/builder/chosen-options";

// A High Elf Wizard with a Sage background — exercises racial ASIs (race +
// subrace), class saving throws / skill choices, level-1 spellcasting, and a
// background's skills/feature/equipment/gold.
const highElfWizard = (): BuilderState => ({
  ...defaultBuilderState(),
  mode: "guided",
  raceIndex: "elf",
  subraceIndex: "high-elf",
  classIndex: "wizard",
  classSkillChoices: [SkillName.Arcana, SkillName.Investigation],
  scoreMethod: "manual",
  baseStats: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 },
  backgroundName: "Sage",
  cantripIndices: ["fire-bolt", "mage-hand"],
  levelOneSpellIndices: ["magic-missile", "shield"],
  name: "Maelina",
  playerName: "Kevin",
  alignment: Alignment["Chaotic Good"],
});

describe("buildCharacter — guided High Elf Wizard", () => {
  const char = buildCharacter(highElfWizard());

  it("sets identity fields with no placeholder junk", () => {
    expect(char.name).toBe("Maelina");
    expect(char.playerName).toBe("Kevin");
    expect(char.race.name).toBe("Elf");
    expect(char.race.subrace).toBe("High Elf");
    expect(char.background).toBe("Sage");
    expect(char.class).toEqual([
      expect.objectContaining({ name: "Wizard", level: 1 }),
    ]);
    expect(char.alignment).toBe(Alignment["Chaotic Good"]);
  });

  it("applies race (+2 DEX) and subrace (+1 INT) ability bonuses", () => {
    expect(char.stats.dex).toBe(16); // 14 base + 2 elf
    expect(char.stats.int).toBe(16); // 15 base + 1 high elf
    expect(char.stats.con).toBe(14); // unchanged
  });

  it("grants class saving throws and the union of skill proficiencies", () => {
    expect(char.proficiencies.savingThrows).toMatchObject({
      int: true,
      wis: true,
    });
    // class picks + background (Sage: Arcana, History)
    expect(char.proficiencies.skills).toMatchObject({
      Arcana: true,
      Investigation: true,
      History: true,
    });
  });

  it("computes level-1 HP and hit dice from the hit die + CON mod", () => {
    // d6 max (6) + CON mod (+2) = 8
    expect(char.currHp).toBe(8);
    expect(char.totalHitDice).toEqual({ [StandardDie.d6]: 1 });
    expect(char.maxHp).toEqual({
      operation: "addition",
      operands: [6, "con"],
    });
  });

  it("adds the chosen spells with roll-ready mechanics", () => {
    // The spellcasting entry references the Wizard class by its id, and the
    // spells are tagged to that same id.
    const wizardId = char.class.find((c) => c.name === "Wizard")!.id;
    expect(char.spellcastingClasses).toEqual([{ classId: wizardId }]);
    expect(char.spells[0]?.every((s) => s.spellcastingClass === wizardId)).toBe(
      true,
    );
    expect(char.spells[0]?.map((s) => s.info.title)).toEqual([
      "Fire Bolt",
      "Mage Hand",
    ]);
    expect(char.spells[1]?.map((s) => s.info.title)).toEqual([
      "Magic Missile",
      "Shield",
    ]);
    // Fire Bolt deals damage → should carry structured mechanics (roll button).
    expect(char.spells[0]?.[0].mechanics).toBeDefined();
  });

  it("collects features from race, subrace, class, and background", () => {
    const titles = char.features.map((f) => f.title);
    expect(titles).toContain("Darkvision"); // elf trait
    expect(titles).toContain("Elf Weapon Training"); // high-elf trait
    expect(titles).toContain("Researcher"); // Sage feature
  });

  it("seeds darkvision into senses from the race's Darkvision trait", () => {
    // The elf's "Darkvision" trait puts the 60ft range in the detail prose.
    expect(char.senses.darkvision).toBe(60);
  });

  it("takes background equipment and starting gold", () => {
    expect(char.coins).toEqual({ GP: 10 });
    expect(char.equipment.map((e) => e.text.title)).toContain("Spellbook");
  });
});

describe("buildCharacter — custom race & class", () => {
  const char = buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    raceIndex: undefined,
    customRaceName: "Aarakocra",
    classIndex: undefined,
    customClassName: "Blood Hunter",
    customHitDie: StandardDie.d10,
    baseStats: { str: 14, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
    name: "Homebrew Hero",
  });

  it("uses the custom names and hit die, with no SRD casting", () => {
    expect(char.race.name).toBe("Aarakocra");
    expect(char.class).toEqual([
      expect.objectContaining({ name: "Blood Hunter", level: 1 }),
    ]);
    expect(char.totalHitDice).toEqual({ [StandardDie.d10]: 1 });
    expect(char.currHp).toBe(12); // d10 max (10) + CON mod (+2)
    expect(char.spellcastingClasses).toEqual([]);
  });
});

describe("buildCharacter — subrace speed & tool dedup", () => {
  // Wood Elf Rogue: Fleet of Foot raises speed to 35, and the Rogue's
  // "Thieves' Tools" + a Criminal background's "Thieves' tools" must not both
  // land on the sheet.
  const char = buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    raceIndex: "elf",
    subraceIndex: "wood-elf",
    classIndex: "rogue",
    backgroundName: "Criminal",
  });

  it("applies the subrace speed override", () => {
    expect(char.speeds.walk).toBe(35);
  });

  it("de-duplicates tool proficiencies case-insensitively", () => {
    const tools = char.otherProficiencies.toolsAndOther.map((t) =>
      t.title.toLowerCase(),
    );
    expect(tools.filter((t) => t === "thieves' tools")).toHaveLength(1);
  });

  it("grants the elf's fixed Perception proficiency (Keen Senses)", () => {
    expect(char.proficiencies.skills).toMatchObject({ Perception: true });
  });
});

describe("buildCharacter — class equipment choices, attacks & AC", () => {
  it("resolves category choices to a concrete weapon and builds its attack", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "barbarian",
      // Option 0: "(a) a greataxe or (b) any martial melee weapon" → pick (b),
      // and explicitly choose a Glaive for that martial-melee slot.
      classEquipmentChoices: { 0: 1 },
      classWeaponChoices: { 0: ["Glaive"] },
    });
    const items = char.equipment.map((e) => e.text.title);
    expect(items).toContain("Glaive");
    expect(items).not.toContain("any martial melee weapon");
    // Option 1: "(a) two handaxes or (b) any simple weapon" defaults to (a).
    expect(items).toContain("Handaxe (2)");
    // Concrete weapons become rollable attacks.
    expect(char.attacks.map((a) => a.name)).toEqual(
      expect.arrayContaining(["Glaive", "Handaxe", "Javelin"]),
    );
  });

  it("tags chosen armor and shield as equipped so the AC leaf drives AC", () => {
    // Cleric: fixed Shield + a scale-mail option (default choice a).
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "cleric",
    });
    // AC comes from the equippedArmor leaf, not a baked formula.
    expect(char.acFormula).toEqual({ equippedArmor: true });
    const scaleMail = char.equipment.find((e) => e.text.title === "Scale Mail");
    expect(scaleMail?.equipped).toBe(true);
    expect(scaleMail?.armor).toEqual({
      base: 14,
      category: "medium",
      dex: "capped",
      dexCap: 2,
    });
    const shield = char.equipment.find((e) => e.text.title === "Shield");
    expect(shield?.equipped).toBe(true);
    expect(shield?.shield).toEqual({ bonus: 2 });
  });
});

describe("buildCharacter — level-1 subclass mechanics", () => {
  it("applies a Cleric Life Domain's heavy armor, domain spells, and feature", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "cleric",
      subclass: "Life",
    });
    expect(char.class).toEqual([
      expect.objectContaining({ name: "Cleric", level: 1, subclass: "Life" }),
    ]);
    // Life Domain grants heavy armor on top of the cleric's light + medium.
    expect(char.otherProficiencies.armor[ArmorType.Heavy]).toBe(true);
    // Domain spells (bless, cure wounds) are always prepared and land as
    // 1st-level spells even though the player didn't pick them.
    const first = char.spells[1]?.map((s) => s.info.title) ?? [];
    expect(first).toEqual(expect.arrayContaining(["Bless", "Cure Wounds"]));
    // The subclass's level-1 feature is merged into the sheet.
    expect(char.features.map((f) => f.title)).toContain("Disciple of Life");
  });

  it("applies a Warlock Hexblade's bonus weapon/armor proficiencies", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "warlock",
      subclass: "Hexblade",
    });
    expect(char.otherProficiencies.armor[ArmorType.Medium]).toBe(true);
    expect(char.otherProficiencies.armor[ArmorType.Shields]).toBe(true);
    expect(char.otherProficiencies.weapons).toContain("Martial Weapons");
    expect(char.features.map((f) => f.title)).toContain("Hex Warrior");
  });

  it("applies a Sorcerer origin's level-1 feature", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "sorcerer",
      subclass: "Draconic Bloodline",
    });
    expect(char.features.map((f) => f.title)).toContain("Draconic Resilience");
  });

  it("leaves a name-only subclass (no level-1 grants) as just a label", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "fighter",
      subclass: "Champion",
    });
    expect(char.class).toEqual([
      expect.objectContaining({
        name: "Fighter",
        level: 1,
        subclass: "Champion",
      }),
    ]);
    // No spurious subclass feature is added for a name-only subclass.
    expect(char.features.map((f) => f.title)).not.toContain("Champion");
  });
});

describe("buildCharacter — non-SRD race", () => {
  it("applies a Goliath's ability bonuses, skill grant, and traits", () => {
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      raceIndex: "goliath",
      classIndex: "fighter",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 12, con: 13, int: 10, wis: 10, cha: 8 },
    });
    expect(char.race.name).toBe("Goliath");
    expect(char.stats.str).toBe(17); // 15 + 2
    expect(char.stats.con).toBe(14); // 13 + 1
    expect(char.proficiencies.skills).toMatchObject({ Athletics: true });
    expect(char.features.map((f) => f.title)).toContain("Stone's Endurance");
  });
});

describe("buildCharacter — escape hatches", () => {
  it("blank mode returns an empty scaffold free of joke data", () => {
    const char = buildCharacter({ ...defaultBuilderState(), mode: "blank" });
    expect(char.class).toEqual([]);
    expect(char.attacks).toEqual([]);
    expect(char.features).toEqual([]);
    expect(char.name).toBe("");
  });

  it("sample mode clones the demo character with a fresh uuid", () => {
    const char = buildCharacter({ ...defaultBuilderState(), mode: "sample" });
    expect(char.name).toBe(defaultCharacter.name);
    expect(char.uuid).not.toBe(defaultCharacter.uuid);
  });
});

// A minimal guided level-1 build, overridable per test.
const level1 = (classIndex: string, extra: Partial<BuilderState> = {}) =>
  buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    classIndex,
    scoreMethod: "manual",
    baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    ...extra,
  });

describe("wizard choices added by the coverage audit", () => {
  it("a rogue's level-1 expertise lands on the chosen skills", () => {
    const c = level1("rogue", {
      classSkillChoices: [SkillName.Stealth, SkillName.Perception],
      expertiseChoices: [SkillName.Stealth],
    });
    expect(c.proficiencies.expertise[SkillName.Stealth]).toBe(true);
    expect(c.proficiencies.expertise[SkillName.Perception]).toBeFalsy();
  });

  it("expertise on a skill the character isn't proficient in is dropped", () => {
    const c = level1("rogue", {
      classSkillChoices: [SkillName.Stealth],
      // Arcana isn't among the picks, so it can't be doubled.
      expertiseChoices: [SkillName.Arcana],
    });
    expect(c.proficiencies.expertise[SkillName.Arcana]).toBeFalsy();
  });

  it("a non-expertise class ignores stray expertise picks", () => {
    const c = level1("fighter", {
      expertiseChoices: [SkillName.Athletics],
    });
    expect(c.proficiencies.expertise[SkillName.Athletics]).toBeFalsy();
  });

  it("class tool choices land as tool proficiencies", () => {
    const c = level1("bard", { toolChoices: ["Lute", "Drum", "Flute"] });
    const tools = c.otherProficiencies.toolsAndOther.map((t) => t.title);
    expect(tools).toEqual(expect.arrayContaining(["Lute", "Drum", "Flute"]));
    // A pick the class doesn't offer is filtered out.
    const stale = level1("bard", { toolChoices: ["Smith's tools"] });
    expect(
      stale.otherProficiencies.toolsAndOther.map((t) => t.title),
    ).not.toContain("Smith's tools");
  });

  it("a Variant Human starts with a feat, applied like any other", () => {
    // Variant Human is a top-level race, not a subrace of Human.
    const c = level1("fighter", {
      raceIndex: "variant-human",
      featIndex: "alert",
    });
    expect(c.features.map((f) => f.title)).toContain("Alert");
  });

  it("no feat is applied when the race doesn't grant one", () => {
    const c = level1("fighter", { raceIndex: "human", featIndex: "alert" });
    expect(c.features.map((f) => f.title)).not.toContain("Alert");
  });

  it("a draconic sorcerer's ancestry confers its damage resistance", () => {
    const c = level1("sorcerer", {
      subclass: "Draconic Bloodline",
      chosenOptions: { draconicAncestry: ["Blue (lightning)"] },
    });
    expect(c.damageModifiers.resistances).toContain(DamageType.Lightning);
  });
});

describe("level-1 chosen options", () => {
  it("applies a ranger's level-1 favored enemy and terrain", () => {
    const char = level1("ranger", {
      chosenOptions: {
        favoredEnemy: ["Dragons"],
        naturalExplorer: ["Forest"],
      },
    });
    expect(chosenIn(char, "favoredEnemy").map((o) => o.name)).toEqual([
      "Dragons",
    ]);
    expect(chosenIn(char, "naturalExplorer").map((o) => o.name)).toEqual([
      "Forest",
    ]);
  });

  it("drops picks the chosen class doesn't grant at level 1", () => {
    // Switching class mid-wizard can leave a stale pick in the working state.
    const char = level1("fighter", {
      chosenOptions: { favoredEnemy: ["Dragons"] },
    });
    expect(char.chosenOptions ?? []).toEqual([]);
  });
});

describe("the unified grant path", () => {
  it("doesn't list a pool-backed feature twice", () => {
    const c = level1("barbarian");
    // Rage is a limited-use pool with its own description; before the two
    // wizards shared a grant path, creation also pushed it into Features.
    expect(c.limitedUseAbilities.map((a) => a.info.title)).toContain("Rage");
    expect(c.features.map((f) => f.title)).not.toContain("Rage");
  });

  it("still grants the class's non-pooled level-1 features", () => {
    const c = level1("rogue");
    const titles = c.features.map((f) => f.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Sneak Attack", "Thieves' Cant"]),
    );
  });

  it("applies a level-1 subclass's grants through the shared path", () => {
    const c = level1("cleric", { subclass: "Life" });
    expect(c.features.map((f) => f.title)).toContain("Disciple of Life");
    // Domain spells land in the spell buckets, which buildSpells fills first.
    const first = (c.spells[1] ?? []).map((s) => s.info.title);
    expect(first).toEqual(expect.arrayContaining(["Bless", "Cure Wounds"]));
  });
});

describe("Custom Lineage's darkvision-or-skill choice", () => {
  const customLineage = (extra = {}) =>
    buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "fighter",
      raceIndex: "custom-lineage",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
      ...extra,
    });

  it("grants the skill and no darkvision when the skill is chosen", () => {
    const char = customLineage({
      raceTookDarkvision: false,
      raceSkillChoices: [SkillName.Arcana],
    });
    expect(char.proficiencies.skills[SkillName.Arcana]).toBe(true);
    // The trait prose mentions darkvision as one of the two options, so
    // scanning it used to hand the sense out to everyone.
    expect(char.senses.darkvision).toBeUndefined();
  });

  it("grants darkvision and forfeits the skill when darkvision is chosen", () => {
    const char = customLineage({
      raceTookDarkvision: true,
      // A skill left over from flipping the choice must not leak through.
      raceSkillChoices: [SkillName.Arcana],
    });
    expect(char.senses.darkvision).toBe(60);
    expect(char.proficiencies.skills[SkillName.Arcana]).toBeFalsy();
  });

  it("leaves an ordinary darkvision race alone", () => {
    const dwarf = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "fighter",
      raceIndex: "dwarf",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    });
    expect(dwarf.senses.darkvision).toBe(60);
  });
});

describe("starting wealth", () => {
  const withWealth = (extra = {}) =>
    buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "fighter",
      scoreMethod: "manual",
      baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
      ...extra,
    });

  it("takes the class equipment by default", () => {
    const char = withWealth();
    expect(char.equipment.length).toBeGreaterThan(0);
    expect(char.coins.GP ?? 0).toBe(0);
  });

  it("swaps the class package for gold when that's chosen", () => {
    const char = withWealth({ startingWealth: "gold", startingGold: 150 });
    expect(char.coins.GP).toBe(150);
    // No class loadout — and so no weapon attacks derived from it.
    expect(char.attacks).toEqual([]);
  });

  it("keeps background equipment and adds its coin on top", () => {
    const char = withWealth({
      startingWealth: "gold",
      startingGold: 100,
      backgroundName: "Acolyte", // grants 15 gp
      acceptBackgroundEquipment: true,
    });
    expect(char.equipment.length).toBeGreaterThan(0);
    expect(char.coins.GP).toBe(115);
  });
});

describe("starting wealth tables", () => {
  it("rolls within the class's range", () => {
    for (const c of Object.values(OfficialClass)) {
      const w = startingWealthFor(c)!;
      const rolled = rollStartingWealth(w);
      expect(rolled).toBeGreaterThanOrEqual(w.dice * 1 * w.multiplier);
      expect(rolled).toBeLessThanOrEqual(w.dice * 4 * w.multiplier);
    }
  });

  it("keeps the monk's 5d4 unmultiplied", () => {
    expect(startingWealthFor(OfficialClass.Monk)).toEqual({
      dice: 5,
      multiplier: 1,
    });
    expect(describeStartingWealth(startingWealthFor(OfficialClass.Monk)!)).toBe(
      "5d4 gp",
    );
    expect(
      describeStartingWealth(startingWealthFor(OfficialClass.Rogue)!),
    ).toBe("4d4 × 10 gp");
  });
});
