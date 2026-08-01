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
// catalog: picking an entry prefills mechanics, while free text just names a
// custom item. What these tests pin: what each kind of pick writes to the
// character and the +N bonus application. A weapon pick stores its Attack *on
// the item* (`item.weapon`) — the Attacks row appears only when the item is
// equipped on the sheet, which is EquipmentDisplay's job (see display.test).

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

  it("stores the weapon's Attack on the item — not in attacks — when picked", async () => {
    const { harness, baseAttacks } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Longsword" });
    expect(item.weapon?.attack.name).toBe("Longsword");
    expect(item.weight).toBe(3);
    // The Attacks row is created by equipping the item, not by picking it.
    expect(harness.character.attacks).toHaveLength(baseAttacks);
  });

  it("applies the magic bonus to the pick, and re-applies when it changes", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    await userEvent.selectOptions(screen.getByLabelText(/Bonus/), "1");
    const item = harness.character.equipment.at(-1)!;
    expect(item.text).toMatchObject({ title: "Longsword +1" });
    expect(item.weapon?.attack.name).toBe("Longsword +1");
  });

  it("drops the weapon mechanics when the pick changes to armor", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
    await userEvent.clear(nameInput());
    await userEvent.type(nameInput(), "chain ma");
    await userEvent.click(screen.getByRole("button", { name: "Chain Mail" }));
    const item = harness.character.equipment.at(-1)!;
    expect(item.weapon).toBeUndefined();
    expect(item.armor).toMatchObject({ base: 16 });
  });

  it("saves through the default equipment-field path", async () => {
    const { harness } = renderNewItem();
    await userEvent.type(nameInput(), "longsw");
    await userEvent.click(screen.getByRole("button", { name: "Longsword" }));
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
