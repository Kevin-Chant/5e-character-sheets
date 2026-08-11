// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import StatAndSkillPanel from "./stat-and-skill-panel";
import DefenceAndEquipmentPanel from "./defence-and-equipment-panel";
import CharacterInfoPanel from "./character-info-panel";

// Pins the sheet's section order to the paper sheet's reading order. Assert
// landmarks appear in this order, ignoring anything between them — adding a
// field is free, moving a section is not (see paper-fidelity in CLAUDE.md).

// Section landmarks in DOM order: `.section-heading` (bordered region),
// `.prof-title` (table-shaped section), `.display-title` (ability box),
// `.display-label` (single field). Trailing "+" add-buttons are stripped.
const landmarks = (container: HTMLElement): string[] =>
  [
    ...container.querySelectorAll(
      ".section-heading, .prof-title, .display-title, .display-label",
    ),
  ]
    .map((el) => (el.textContent ?? "").replace(/[+\s]+$/, "").trim())
    .filter(Boolean);

// Assert `expected` is a subsequence of `actual` — order enforced, gaps allowed.
function expectInOrder(actual: string[], expected: string[]) {
  const positions = expected.map((name) => actual.indexOf(name));
  const missing = expected.filter((_, i) => positions[i] === -1);
  expect(
    missing,
    `landmarks not rendered at all: ${missing.join(", ")}`,
  ).toEqual([]);
  const sorted = [...positions].sort((a, b) => a - b);
  expect(
    positions.map((_, i) => expected[i]),
    "sheet sections are out of paper order",
  ).toEqual(sorted.map((p) => actual[p]));
}

describe("the sheet keeps the paper sheet's reading order", () => {
  it("orders the left panel: abilities, saves, skills, passive, proficiencies", () => {
    const { container } = renderWithCharacter(<StatAndSkillPanel />);
    expectInOrder(landmarks(container), [
      "Strength",
      "Charisma",
      "Inspiration",
      "Proficiency Bonus",
      "Saving Throws",
      "Skills",
      "Passive Wisdom (Perception)",
      "Other Proficiencies & Languages",
    ]);
  });

  it("orders the middle panel: vitals, HP, hit dice, attacks, equipment", () => {
    const { container } = renderWithCharacter(<DefenceAndEquipmentPanel />);
    expectInOrder(landmarks(container), [
      "Armor Class",
      "Initiative",
      "Hit Point Maximum",
      "Current Hit Points",
      "Temporary Hit Points",
      "Hit Dice",
      "Death Saves",
      "Weapon Attacks",
      "Equipment",
    ]);
  });

  it("orders the right panel: personality, features, senses", () => {
    const { container } = renderWithCharacter(<CharacterInfoPanel />);
    expectInOrder(landmarks(container), [
      "Personality Traits",
      "Ideals",
      "Bonds",
      "Flaws",
      "Features & Traits",
      "Senses",
      "Damage Modifiers",
    ]);
  });

  it("keeps the three panels left-to-right as the paper lays them out", () => {
    // Read from source: charsheet.tsx needs providers this test doesn't mount.
    const source = readFileSync(join(__dirname, "charsheet.tsx"), "utf8");
    const order = [
      "StatAndSkillPanel",
      "DefenceAndEquipmentPanel",
      "CharacterInfoPanel",
    ].map((name) => source.indexOf(`<${name} />`));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
