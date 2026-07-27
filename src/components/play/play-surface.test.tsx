import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import PlaySurface from "./play-surface";

// The mission-facing behaviour of the surface: each round the board narrows to
// what the moment calls for — and only advisorily. Off your turn the banner
// says who is acting and the board dims by class; nothing is disabled, because
// a readied action or a DM ruling outranks anything the app can see.

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
  // The goblin's default initiative (10) beats the self participant's 0, so
  // combat opens on the goblin's turn — the off-turn state.
  await user.type(screen.getByLabelText("Combatant name"), "Goblin");
  // Scoped: the conditions panel in the vitals rail has an "Add" of its own.
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
    // Whatever is disabled before combat (zero-slot casts, steppers at their
    // minimum) is disabled for its own reasons and stays that way.
    const disabledBefore = disabledOnBoard();
    await intoCombatWithGoblin(user, container);

    expect(screen.getByText("Goblin is acting")).toBeInTheDocument();
    expect(container.querySelector(".play-body.off-turn")).not.toBeNull();
    // The escape hatch: dimming is a class, never `disabled` — going off-turn
    // disables nothing that wasn't already.
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

    // Off-turn with nothing spent it's the slot-reset button, and inert.
    expect(screen.getByRole("button", { name: "End turn" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next turn" }));
    expect(screen.getByText("Your turn")).toBeInTheDocument();

    // On your turn it's the real thing — no ruling needed, the order moves.
    await user.click(screen.getByRole("button", { name: "End turn" }));
    expect(screen.getByText("Goblin is acting")).toBeInTheDocument();
    expect(container.querySelector(".play-body.off-turn")).not.toBeNull();
  });
});
