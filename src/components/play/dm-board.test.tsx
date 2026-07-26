import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import DmBoard from "./dm-board";

// The board's pure pieces (`clearFallen`, ordering) are covered in
// `encounter.test.ts`. What's worth testing here is the workflow only the
// component knows: one Add makes a numbered, tracked pack, and the sweep
// button appears exactly when something is down.

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
      // Tracked from the start: the HP stepper exists without a "Track" step.
      expect(screen.getByLabelText(`${name} hit points`)).toHaveValue(7);
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

    const goblinOneHp = screen.getByLabelText("Goblin 1 hit points");
    await user.clear(goblinOneHp);
    await user.type(goblinOneHp, "0{Enter}");

    await user.click(screen.getByText(/Clear the fallen \(1\)/));
    expect(screen.queryByText("Goblin 1")).not.toBeInTheDocument();
    expect(screen.getByText("Goblin 2")).toBeInTheDocument();
  });
});
