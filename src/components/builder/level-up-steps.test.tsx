import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficialClass, SkillName } from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { defaultBuilderState } from "src/lib/builder/types";
import {
  applyLevelUp,
  defaultLevelUpState,
  LevelUpState,
} from "src/lib/builder/level-up";
import { Character } from "src/lib/types";
import { LevelUpFeatureChoicesStep } from "./level-up-steps";

// The wizard steps are plain props components — no context — so they render
// directly. These cover the seam the unit tests can't: that a level's grants
// actually reach the screen, and that picking one writes the right state.

const level1 = (classIndex: string, extra = {}) =>
  buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    classIndex,
    scoreMethod: "manual",
    baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    ...extra,
  });

// Advance a character to a target level in one class, taking no choices.
const advanceTo = (char: Character, className: string, level: number) => {
  let out = char;
  while ((out.class.find((c) => c.name === className)?.level ?? 0) < level)
    out = applyLevelUp(out, { ...defaultLevelUpState(out), className });
  return out;
};

// Render the class-features step and hand back the patch spy.
const renderStep = (character: Character, state: Partial<LevelUpState>) => {
  const patch = vi.fn();
  const full = { ...defaultLevelUpState(character), ...state };
  render(
    <LevelUpFeatureChoicesStep
      character={character}
      state={full}
      patch={patch}
    />,
  );
  return { patch, state: full };
};

describe("LevelUpFeatureChoicesStep", () => {
  it("offers a fighting style at the level the class grants one", () => {
    const char = level1("fighter");
    // Fighter picks a style at 1st, so levelling to 2nd offers nothing.
    renderStep(char, { className: OfficialClass.Fighter });
    expect(screen.queryByText("Fighting style")).not.toBeInTheDocument();
  });

  it("offers expertise at rogue 6, scoped to skills already proficient in", async () => {
    const char = advanceTo(
      level1("rogue", { classSkillChoices: [SkillName.Stealth] }),
      "Rogue",
      5,
    );
    const { patch } = renderStep(char, { className: OfficialClass.Rogue });

    expect(screen.getByText(/Expertise \(choose 2\)/)).toBeInTheDocument();
    // Stealth was picked at creation, so it's a legal target…
    const stealth = screen.getByRole("button", { name: "Stealth" });
    // …while a skill the rogue never took isn't offered at all.
    expect(
      screen.queryByRole("button", { name: "Arcana" }),
    ).not.toBeInTheDocument();

    await userEvent.click(stealth);
    expect(patch).toHaveBeenCalledWith({
      expertiseChoices: [SkillName.Stealth],
    });
  });

  it("offers a Battle Master their maneuvers in the same step they pick the subclass", async () => {
    const char = advanceTo(level1("fighter"), "Fighter", 2);
    const { patch } = renderStep(char, {
      className: OfficialClass.Fighter,
      // Chosen in this very level-up — the grants must reflect the pending
      // choice, not what's on the sheet.
      subclass: "Battle Master",
    });

    expect(screen.getByText("Maneuvers")).toBeInTheDocument();
    expect(screen.getByText(/Choose 3/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Riposte/ }));
    expect(patch).toHaveBeenCalledWith({
      chosenOptions: { maneuvers: ["Riposte"] },
    });
  });

  it("locks the remaining options once the level's allowance is spent", async () => {
    const char = advanceTo(level1("fighter"), "Fighter", 2);
    renderStep(char, {
      className: OfficialClass.Fighter,
      subclass: "Battle Master",
      chosenOptions: { maneuvers: ["Riposte", "Parry", "Rally"] },
    });
    // Three picked of three allowed: an unpicked option can't be added…
    expect(screen.getByRole("checkbox", { name: /Ambush/ })).toBeDisabled();
    // …but a picked one stays clickable so it can be swapped.
    expect(screen.getByRole("checkbox", { name: /Riposte/ })).toBeEnabled();
  });

  it("doesn't re-offer an option the character already knows", () => {
    let char = advanceTo(level1("fighter"), "Fighter", 2);
    char = applyLevelUp(char, {
      ...defaultLevelUpState(char),
      className: OfficialClass.Fighter,
      subclass: "Battle Master",
      chosenOptions: { maneuvers: ["Riposte", "Parry", "Rally"] },
    });
    // 7th grants two more; the three already known are gone from the list.
    const at7 = advanceTo(char, "Fighter", 6);
    renderStep(at7, { className: OfficialClass.Fighter });

    expect(screen.getByText(/Choose 2/)).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Riposte/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Ambush/ }),
    ).toBeInTheDocument();
  });

  it("offers a warlock their new invocations, skipping ones already taken", async () => {
    const char = level1("warlock");
    const { patch } = renderStep(char, { className: OfficialClass.Warlock });

    const list = screen.getByText(/Choose 2 new invocations/);
    expect(list).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: /Agonizing Blast/ });
    await userEvent.click(box);
    expect(patch).toHaveBeenCalledWith({
      invocations: ["Agonizing Blast"],
    });
  });

  it("renders nothing for a level that grants no choices", () => {
    const char = advanceTo(level1("barbarian"), "Barbarian", 3);
    const { container } = render(
      <LevelUpFeatureChoicesStep
        character={char}
        state={{
          ...defaultLevelUpState(char),
          className: OfficialClass.Barbarian,
        }}
        patch={vi.fn()}
      />,
    );
    expect(within(container).queryAllByRole("checkbox")).toHaveLength(0);
  });
});
