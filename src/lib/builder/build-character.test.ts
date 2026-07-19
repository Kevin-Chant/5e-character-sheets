import { describe, expect, it } from "vitest";
import {
  Alignment,
  SkillName,
  StandardDie,
} from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { BuilderState, defaultBuilderState } from "src/lib/builder/types";
import { defaultCharacter } from "src/lib/data/default-data";

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
    expect(char.race).toBe("Elf (High Elf)");
    expect(char.background).toBe("Sage");
    expect(char.class).toEqual([{ name: "Wizard", level: 1 }]);
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
    expect(char.spellcastingClasses).toEqual([{ class: "Wizard" }]);
    expect(char.spells.cantrips?.map((s) => s.info.title)).toEqual([
      "Fire Bolt",
      "Mage Hand",
    ]);
    expect(char.spells.First?.map((s) => s.info.title)).toEqual([
      "Magic Missile",
      "Shield",
    ]);
    // Fire Bolt deals damage → should carry structured mechanics (roll button).
    expect(char.spells.cantrips?.[0].mechanics).toBeDefined();
  });

  it("collects features from race, subrace, class, and background", () => {
    const titles = char.features.map((f) => f.title);
    expect(titles).toContain("Darkvision"); // elf trait
    expect(titles).toContain("Elf Weapon Training"); // high-elf trait
    expect(titles).toContain("Researcher"); // Sage feature
  });

  it("takes background equipment and starting gold", () => {
    expect(char.coins).toEqual({ GP: 10 });
    expect(char.equipment.map((e) => e.title)).toContain("Spellbook");
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
    expect(char.race).toBe("Aarakocra");
    expect(char.class).toEqual([{ name: "Blood Hunter", level: 1 }]);
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
    expect(char.speed).toBe(35);
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
    const items = char.equipment.map((e) => e.title);
    expect(items).toContain("Glaive");
    expect(items).not.toContain("any martial melee weapon");
    // Option 1: "(a) two handaxes or (b) any simple weapon" defaults to (a).
    expect(items).toContain("Handaxe (2)");
    // Concrete weapons become rollable attacks.
    expect(char.attacks.map((a) => a.name)).toEqual(
      expect.arrayContaining(["Glaive", "Handaxe", "Javelin"]),
    );
  });

  it("derives the AC formula from chosen armor and a shield", () => {
    // Cleric: fixed Shield + a scale-mail option (default choice a).
    const char = buildCharacter({
      ...defaultBuilderState(),
      mode: "guided",
      classIndex: "cleric",
    });
    // Scale mail (14 + min(DEX,2)) + shield (+2).
    expect(char.acFormula).toEqual({
      operation: "addition",
      operands: [14, { operation: "minimum", operands: ["dex", 2] }, 2],
    });
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
