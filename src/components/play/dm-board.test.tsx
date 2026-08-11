// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { chooseOption } from "src/lib/fixtures/select-testing";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import DmBoard from "./dm-board";

// Pure pieces (`clearFallen`, ordering, `applyDamage`) are covered in
// `encounter.test.ts`; this covers component-level workflow.

describe("the DM board", () => {
  it("says whether this game is on your defaults, and hands them back", async () => {
    const user = userEvent.setup();
    renderWithCharacter(
      <MemoryRouter>
        <DmBoard />
      </MemoryRouter>,
      { editMode: false },
    );

    await user.click(screen.getByRole("button", { name: /Table settings/ }));
    expect(screen.getByText("Matching your defaults.")).toBeInTheDocument();

    // The game's own copy diverges; the default it started from is untouched.
    await user.click(screen.getByRole("radio", { name: /Private/ }));
    expect(
      screen.getByText("This game doesn't use your defaults."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use my defaults" }));
    expect(screen.getByText("Matching your defaults.")).toBeInTheDocument();
  });

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
      // Tracked from the start, no separate "Track" step.
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
    expect(damage).toHaveValue("");

    await user.type(damage, "+5{Enter}");
    expect(
      screen.getByLabelText("Set Ogre hit points directly"),
    ).toHaveTextContent("51/ 59");

    await user.click(screen.getByLabelText("Set Ogre hit points directly"));
    const absolute = screen.getByLabelText("Ogre hit points");
    await user.clear(absolute);
    await user.type(absolute, "59{Enter}");
    expect(
      screen.getByLabelText("Set Ogre hit points directly"),
    ).toHaveTextContent("59/ 59");
  });

  it("heals from a visible mode, switched by glyph or by sign key", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Ogre");
    await user.type(screen.getByLabelText("Hit points each (optional)"), "59");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await user.type(screen.getByLabelText("Damage to Ogre"), "20{Enter}");
    const total = () => screen.getByLabelText("Set Ogre hit points directly");
    expect(total()).toHaveTextContent("39/ 59");

    // Clicking the glyph flips the mode, and the field relabels with it.
    await user.click(
      screen.getByLabelText("Damaging Ogre — switch to healing"),
    );
    await user.type(screen.getByLabelText("Healing for Ogre"), "6{Enter}");
    expect(total()).toHaveTextContent("45/ 59");

    // Mode reverts to damage on its own after a heal.
    expect(screen.getByLabelText("Damage to Ogre")).toHaveValue("");
    await user.type(screen.getByLabelText("Damage to Ogre"), "5{Enter}");
    expect(total()).toHaveTextContent("40/ 59");

    // A leading plus is a one-off heal: it moves the glyph, not the box.
    await user.type(screen.getByLabelText("Damage to Ogre"), "+9{Enter}");
    expect(total()).toHaveTextContent("49/ 59");
  });

  it("sets a condition's duration on the chip, and corrects it in place", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Ogre");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await chooseOption("Give Ogre a condition", "Stunned", user);
    const duration = () =>
      screen.getByLabelText("Set how long Stunned lasts on Ogre");
    expect(duration()).toHaveTextContent("∞");

    await user.click(duration());
    await user.type(
      screen.getByLabelText("Rounds of Stunned left on Ogre"),
      "2{Enter}",
    );
    expect(duration()).toHaveTextContent("2");

    // Correcting is the same gesture, not remove-and-re-add.
    await user.click(duration());
    const rounds = screen.getByLabelText("Rounds of Stunned left on Ogre");
    await user.clear(rounds);
    await user.type(rounds, "5{Enter}");
    expect(duration()).toHaveTextContent("5");

    // Zero is how you get back to ∞.
    await user.click(duration());
    const back = screen.getByLabelText("Rounds of Stunned left on Ogre");
    await user.clear(back);
    await user.type(back, "0{Enter}");
    expect(duration()).toHaveTextContent("∞");
  });
});
