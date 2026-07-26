import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import StatAndSkillPanel from "./stat-and-skill-panel";
import DefenceAndEquipmentPanel from "./defence-and-equipment-panel";
import CharacterInfoPanel from "./character-info-panel";

// The sheet's reading order is inherited from the official 5e paper sheet, on
// purpose: a player who has used paper for years should be able to scan and
// jump without learning anything. That transfer attaches to *relative order* —
// "attacks are under HP", "skills are the left rail" — so the order is a
// contract, not an accident, and it is the one thing a well-meaning layout pass
// is most likely to "fix".
//
// These tests pin the sequence and nothing else. They assert that a set of
// landmarks appears **in this order**, ignoring anything between them, so
// adding a field is free but moving one is not. If you are here because a test
// failed: moving a section is a product decision, not a refactor — see the
// paper-fidelity bullet in CLAUDE.md. Fold problems are solved with density,
// not by reordering.

// Every section landmark on the sheet, in DOM order: `.section-heading` labels a
// bordered region ("Skills", "Death Saves"), `.prof-title` the two table-shaped
// ones, `.display-title` an ability box, and `.display-label` a single field
// ("Armor Class"). Together they are what a player's eye actually lands on.
//
// An "+" add-button sits inside some headings, so trailing punctuation is
// stripped rather than matched against.
const landmarks = (container: HTMLElement): string[] =>
  [
    ...container.querySelectorAll(
      ".section-heading, .prof-title, .display-title, .display-label",
    ),
  ]
    .map((el) => (el.textContent ?? "").replace(/[+\s]+$/, "").trim())
    .filter(Boolean);

// Assert `expected` appears as a subsequence of `actual` — order enforced,
// gaps allowed. The failure message names the first landmark found out of place.
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
    // Read from source rather than rendered output: `charsheet.tsx` needs the
    // roller/level-up/rest/presence providers to mount, and the only thing under
    // test here is the order of three lines.
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
