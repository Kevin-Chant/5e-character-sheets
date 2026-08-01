// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FIELD } from "src/lib/data/data-definitions";
import {
  aCharacter,
  renderWithCharacter,
} from "src/lib/fixtures/render-with-character";
import EditEquipmentItem from "./edit-equipment-item";

// The Add Item modal. Its new-item name field is a type-ahead over the built-in
// catalog: picking an entry prefills mechanics (and for a weapon, seeds an
// Attack into the draft), while free text just names a custom item. What these
// tests pin: what each kind of pick writes to the character, the +N bonus
// application, and that saving a weapon pick goes through `replace_character`
// (the default save path would copy only the equipment field and drop the
// seeded attack).

const renderNewItem = () => {
  const character = aCharacter();
  const harness = renderWithCharacter(<EditEquipmentItem />, {
    character,
    targetedField: FIELD.equipment,
    subField: "new",
  });
  return { harness, baseAttacks: character.attacks.length };
};

const nameInput = () =>
  screen.getByPlaceholderText(/Chain Mail, Longsword/) as HTMLInputElement;

describe("EditEquipmentItem (new item)", () => {
  it("uses typed text as the name when nothing is picked", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "Mysterious Orb");
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Mysterious Orb" });
    expect(item.armor).toBeUndefined();
    expect(item.equippable).toBeUndefined();
  });

  it("prefills armor mechanics and weight from a catalog pick", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "chain ma");
    await userEvent.click(screen.getByRole("button", { name: "Chain Mail" }));
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Chain Mail" });
    expect(item.armor).toMatchObject({ base: 16, category: "heavy" });
    expect(item.weight).toBe(55);
  });

  it("seeds an equippable item plus an Attack when a weapon is picked", async () => {
    const { harness, baseAttacks } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Longsword" });
    expect(item.equippable).toBe(true);
    expect(item.weight).toBe(3);
    expect(harness.character.attacks).toHaveLength(baseAttacks + 1);
    expect(harness.character.attacks.at(-1)!.name).toBe("Longsword");
  });

  it("applies the magic bonus to the pick, and re-applies when it changes", async () => {
    const { harness, baseAttacks } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    await userEvent.selectOptions(screen.getByLabelText(/Bonus/), "1");
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Longsword +1" });
    // Re-applied, not accumulated: still exactly one seeded attack.
    expect(harness.character.attacks).toHaveLength(baseAttacks + 1);
    expect(harness.character.attacks.at(-1)!.name).toBe("Longsword +1");
  });

  it("replaces the seeded attack when the pick changes to armor", async () => {
    const { harness, baseAttacks } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    await userEvent.clear(nameInput());
    await userEvent.type(nameInput(), "chain ma");
    await userEvent.click(screen.getByRole("button", { name: "Chain Mail" }));
    expect(harness.character.attacks).toHaveLength(baseAttacks);
    const item = harness.character.equipment.at(-1)!;
    expect(item.armor).toMatchObject({ base: 16 });
  });

  it("saves a weapon pick as one replace_character edit", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const action = harness.saveData.mock.calls.at(-1)?.[1];
    expect(action).toMatchObject({ type: "replace_character" });
  });

  it("saves a plain item through the default equipment-field path", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "Rope");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(harness.saveData).toHaveBeenCalled();
    expect(harness.saveData.mock.calls.at(-1)?.[1]).toBeUndefined();
  });

  it("picks an exact match on Enter instead of saving", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "shield{Enter}");
    expect(harness.saveData).not.toHaveBeenCalled();
    const item = harness.character.equipment.at(-1)!;
    expect(item.shield).toMatchObject({ bonus: 2 });
    expect(item.text).toMatchObject({ title: "Shield" });
  });
});
