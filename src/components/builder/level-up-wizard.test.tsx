import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficialClass, SkillName } from "src/lib/data/data-definitions";
import { buildCharacter } from "src/lib/builder/build-character";
import { defaultBuilderState } from "src/lib/builder/types";
import { applyLevelUp, defaultLevelUpState } from "src/lib/builder/level-up";
import { Character } from "src/lib/types";
import LevelUpWizard from "./level-up-wizard";

// Which steps the wizard shows is decided by `visible` predicates that read
// `grantsAt`. Those predicates and the step bodies used to be written twice and
// could disagree; these tests pin the routing so they can't drift again.

const level1 = (classIndex: string, extra = {}) =>
  buildCharacter({
    ...defaultBuilderState(),
    mode: "guided",
    classIndex,
    scoreMethod: "manual",
    baseStats: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    ...extra,
  });

const advanceTo = (char: Character, className: string, level: number) => {
  let out = char;
  while ((out.class.find((c) => c.name === className)?.level ?? 0) < level)
    out = applyLevelUp(out, { ...defaultLevelUpState(out), className });
  return out;
};

const open = (character: Character) => {
  const onFinish = vi.fn();
  render(
    <LevelUpWizard
      character={character}
      onCancel={vi.fn()}
      onFinish={onFinish}
    />,
  );
  return { onFinish };
};

// The step counter ("Step 2 of 4") is the wizard's own view of its route.
const stepCount = () => {
  const label = screen.getByText(/Step \d+ of \d+/).textContent ?? "";
  return Number(/of (\d+)/.exec(label)?.[1]);
};

const next = () =>
  userEvent.click(screen.getByRole("button", { name: "Next" }));

describe("LevelUpWizard step routing", () => {
  it("shows the class-features step exactly when the level grants a choice", async () => {
    // Rogue 1 → 2 grants Cunning Action (prose only): no choices.
    open(level1("rogue"));
    await next();
    expect(screen.queryByText("Class features")).not.toBeInTheDocument();
  });

  it("shows it at a level that does grant one (rogue 6 expertise)", async () => {
    const char = advanceTo(
      level1("rogue", { classSkillChoices: [SkillName.Stealth] }),
      "Rogue",
      5,
    );
    open(char);
    await next();
    expect(screen.getByText("Class features")).toBeInTheDocument();
    expect(screen.getByText(/Expertise \(choose 2\)/)).toBeInTheDocument();
  });

  it("adds a step when a pending subclass choice unlocks one", async () => {
    // Fighter 2 → 3: subclass step, then Champion grants nothing more…
    const char = advanceTo(level1("fighter"), "Fighter", 2);
    open(char);
    await next();
    const withoutSubclass = stepCount();
    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "Battle Master",
    );
    // …but Battle Master owes maneuvers, so the route grows by a step.
    expect(stepCount()).toBe(withoutSubclass + 1);
  });

  it("shows the ASI step only on an ASI level", async () => {
    open(advanceTo(level1("wizard"), "Wizard", 3));
    await next();
    expect(screen.getByText("Ability score improvement")).toBeInTheDocument();
  });

  it("hands back a levelled character on confirm", async () => {
    const { onFinish } = open(level1("barbarian"));
    // Walk to the last step and confirm.
    for (let i = 0; i < 6; i++) {
      const confirm = screen.queryByRole("button", {
        name: "Confirm level up",
      });
      if (confirm) {
        await userEvent.click(confirm);
        break;
      }
      await next();
    }
    expect(onFinish).toHaveBeenCalledTimes(1);
    const updated = onFinish.mock.calls[0][0] as Character;
    expect(updated.class[0].level).toBe(2);
    expect(updated.class[0].name).toBe(OfficialClass.Barbarian);
  });
});
