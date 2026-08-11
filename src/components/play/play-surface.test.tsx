// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import PlaySurface from "./play-surface";

function renderSurface() {
  return renderWithCharacter(
    <MemoryRouter initialEntries={["/play"]}>
      <PlaySurface />
    </MemoryRouter>,
    { editMode: false },
  );
}

async function intoCombatWithGoblin(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
) {
  // Goblin's default initiative (10) beats self's 0, opening combat off-turn.
  await user.type(screen.getByLabelText("Combatant name"), "Goblin");
  // Scoped: the vitals rail's conditions panel has its own "Add".
  const add = container.querySelector(".initiative-add button[type=submit]");
  await user.click(add as HTMLElement);
  await user.click(screen.getByRole("button", { name: "Start combat" }));
}

describe("per-round guidance on the play surface", () => {
  it("says who is acting and dims the board off-turn, without disabling it", async () => {
    const user = userEvent.setup();
    const { container } = renderSurface();
    const disabledOnBoard = () =>
      container.querySelectorAll(".action-board button:disabled").length;
    const disabledBefore = disabledOnBoard();
    await intoCombatWithGoblin(user, container);

    expect(screen.getByText("Goblin is acting")).toBeInTheDocument();
    expect(container.querySelector(".play-body.off-turn")).not.toBeNull();
    // Dimming is a class, never `disabled`.
    expect(disabledOnBoard()).toBe(disabledBefore);
  });

  it("switches to the your-turn banner when the order comes round", async () => {
    const user = userEvent.setup();
    const { container } = renderSurface();
    await intoCombatWithGoblin(user, container);

    await user.click(screen.getByRole("button", { name: "Next turn" }));
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(container.querySelector(".play-body.off-turn")).toBeNull();
  });

  it("End turn passes the turn for real when it's yours", async () => {
    const user = userEvent.setup();
    const { container } = renderSurface();
    await intoCombatWithGoblin(user, container);

    // Off-turn with nothing spent, "End turn" is the inert slot-reset button.
    expect(screen.getByRole("button", { name: "End turn" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next turn" }));
    expect(screen.getByText("Your turn")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End turn" }));
    expect(screen.getByText("Goblin is acting")).toBeInTheDocument();
    expect(container.querySelector(".play-body.off-turn")).not.toBeNull();
  });
});
