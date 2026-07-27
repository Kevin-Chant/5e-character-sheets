// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import DmBoard from "./dm-board";

// The board's pure pieces (`clearFallen`, ordering, `applyDamage`) are covered
// in `encounter.test.ts`. What's worth testing here is the workflow only the
// component knows: one Add makes a numbered, tracked pack, the sweep button
// appears exactly when something is down, and the row's HP writes are deltas
// first with direct-set as the escape hatch.

describe("the DM board", () => {
  it("adds a numbered pack of tracked monsters in one submit", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Goblin");
    const howMany = screen.getByLabelText("How many");
    await user.clear(howMany);
    await user.type(howMany, "3{Enter}");
    await user.type(screen.getByLabelText("Hit points each (optional)"), "7");
    await user.click(screen.getByRole("button", { name: "Add" }));

    for (const name of ["Goblin 1", "Goblin 2", "Goblin 3"]) {
      // Tracked from the start: the damage box and the running total exist
      // without a "Track" step.
      expect(screen.getByLabelText(`Damage to ${name}`)).toBeInTheDocument();
      expect(
        screen.getByLabelText(`Set ${name} hit points directly`),
      ).toHaveTextContent("7/ 7");
    }
  });

  it("offers the sweep only once something hand-typed is down", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Goblin");
    const howMany = screen.getByLabelText("How many");
    await user.clear(howMany);
    await user.type(howMany, "2{Enter}");
    await user.type(screen.getByLabelText("Hit points each (optional)"), "7");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByText(/Clear the fallen/)).not.toBeInTheDocument();

    // Downed the table's way: "Goblin 1 takes 7."
    await user.type(screen.getByLabelText("Damage to Goblin 1"), "7{Enter}");

    await user.click(screen.getByText(/Clear the fallen \(1\)/));
    expect(screen.queryByText("Goblin 1")).not.toBeInTheDocument();
    expect(screen.getByText("Goblin 2")).toBeInTheDocument();
  });

  it("takes deltas first — damage, +heal — with direct set as the hatch", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Ogre");
    await user.type(screen.getByLabelText("Hit points each (optional)"), "59");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const damage = screen.getByLabelText("Damage to Ogre");
    await user.type(damage, "13{Enter}");
    expect(
      screen.getByLabelText("Set Ogre hit points directly"),
    ).toHaveTextContent("46/ 59");
    // The box clears itself for the next hit.
    expect(damage).toHaveValue("");

    await user.type(damage, "+5{Enter}");
    expect(
      screen.getByLabelText("Set Ogre hit points directly"),
    ).toHaveTextContent("51/ 59");

    // The escape hatch: click the total, type the exact number.
    await user.click(screen.getByLabelText("Set Ogre hit points directly"));
    const absolute = screen.getByLabelText("Ogre hit points");
    await user.clear(absolute);
    await user.type(absolute, "59{Enter}");
    expect(
      screen.getByLabelText("Set Ogre hit points directly"),
    ).toHaveTextContent("59/ 59");
  });
});
