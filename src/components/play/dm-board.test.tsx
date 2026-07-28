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

  // The mode used to be a character you typed and nothing showed: `9` damaged
  // and `+10` healed, documented in a tooltip. Now it's a glyph you can see
  // before you commit — and the sign keys still move it, so the old habit works
  // and becomes visible instead of silent.
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

    // And back to damage on its own. A healing mode left over from a minute ago
    // would quietly heal the next hit — the DM is looking at the roster, not at
    // this glyph — so every heal is deliberate and a mis-set mode costs one
    // entry rather than the rest of the fight.
    expect(screen.getByLabelText("Damage to Ogre")).toHaveValue("");
    await user.type(screen.getByLabelText("Damage to Ogre"), "5{Enter}");
    expect(total()).toHaveTextContent("40/ 59");

    // A leading plus is the whole gesture for a one-off heal: it moves the
    // glyph rather than landing in the box, so healing stays one keystroke.
    await user.type(screen.getByLabelText("Damage to Ogre"), "+9{Enter}");
    expect(total()).toHaveTextContent("49/ 59");
  });

  // Adding a condition is one act; how long it lasts is a separate thought,
  // answered on the chip. The pair used to be a select plus a rounds box that
  // had to be filled first, and a duration already running couldn't be changed
  // at all without removing the condition and adding it back.
  it("sets a condition's duration on the chip, and corrects it in place", async () => {
    const user = userEvent.setup();
    renderWithCharacter(<DmBoard />, { editMode: false });

    await user.type(screen.getByLabelText("Combatant name"), "Ogre");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // One commit, no confirm step, no duration asked for up front.
    await user.selectOptions(
      screen.getByLabelText("Give Ogre a condition"),
      "Stunned",
    );
    const duration = () =>
      screen.getByLabelText("Set how long Stunned lasts on Ogre");
    expect(duration()).toHaveTextContent("∞");

    await user.click(duration());
    await user.type(
      screen.getByLabelText("Rounds of Stunned left on Ogre"),
      "2{Enter}",
    );
    expect(duration()).toHaveTextContent("2");

    // Correcting it is the same gesture — not a remove-and-re-add.
    await user.click(duration());
    const rounds = screen.getByLabelText("Rounds of Stunned left on Ogre");
    await user.clear(rounds);
    await user.type(rounds, "5{Enter}");
    expect(duration()).toHaveTextContent("5");

    // Zero says indefinite unambiguously, which is how you get back to ∞.
    await user.click(duration());
    const back = screen.getByLabelText("Rounds of Stunned left on Ogre");
    await user.clear(back);
    await user.type(back, "0{Enter}");
    expect(duration()).toHaveTextContent("∞");
  });
});
