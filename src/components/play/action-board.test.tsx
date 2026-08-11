// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithCharacter } from "src/lib/fixtures/render-with-character";
import { defaultCharacter } from "src/lib/data/default-data";
import { Character } from "src/lib/types";
import { availableSpellSlots } from "src/lib/rules";
import ActionBoard from "./action-board";
import { usePlayTurn } from "src/lib/play/use-turn";

// turn-actions.test.ts covers the projection; this covers that controls reach
// the real reducer and mark the turn.

function text(title: string) {
  return { title, titleFormulas: [] };
}

function characterWithSpells(): Character {
  const character = structuredClone(defaultCharacter) as Character;
  character.attacks = [];
  character.limitedUseAbilities = [];
  character.spells = {
    1: [
      {
        spellcastingClass: character.class[0].id,
        info: text("Bless"),
        prepared: true,
        castingTime: "1 action",
      },
      {
        spellcastingClass: character.class[0].id,
        info: text("Healing Word"),
        prepared: true,
        castingTime: "1 bonus action",
      },
    ],
  } as Character["spells"];
  character.spellSlots[1] = { totalOverride: 3, expended: 0 };
  return character;
}

function BoardHarness() {
  const turn = usePlayTurn();
  return (
    <>
      <span data-testid="action-spent">{String(turn.spent.action)}</span>
      <ActionBoard turn={turn} />
    </>
  );
}

describe("the action board", () => {
  it("files a spell under the group its casting time names", () => {
    renderWithCharacter(<BoardHarness />, {
      character: characterWithSpells(),
      editMode: false,
    });
    const action = screen.getByRole("heading", { name: "Action" });
    const bonus = screen.getByRole("heading", { name: "Bonus Action" });
    expect(
      within(action.parentElement as HTMLElement).getByText("Bless"),
    ).toBeTruthy();
    expect(
      within(bonus.parentElement as HTMLElement).getByText("Healing Word"),
    ).toBeTruthy();
  });

  it("spends a slot through the real reducer when a spell is cast", async () => {
    const harness = renderWithCharacter(<BoardHarness />, {
      character: characterWithSpells(),
      editMode: false,
    });
    await userEvent.click(screen.getAllByRole("button", { name: "Cast" })[0]);
    expect(availableSpellSlots(harness.character, 1)).toBe(2);
  });

  it("marks the turn's slot when an action is used", async () => {
    renderWithCharacter(<BoardHarness />, {
      character: characterWithSpells(),
      editMode: false,
    });
    expect(screen.getByTestId("action-spent").textContent).toBe("false");
    await userEvent.click(screen.getAllByRole("button", { name: "Cast" })[0]);
    expect(screen.getByTestId("action-spent").textContent).toBe("true");
  });
});
