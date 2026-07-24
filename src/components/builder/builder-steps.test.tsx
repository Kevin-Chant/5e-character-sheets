import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillName } from "src/lib/data/data-definitions";
import { BuilderState, defaultBuilderState } from "src/lib/builder/types";
import { BackgroundStep, ClassStep, RaceStep } from "./builder-steps";

// Creation-wizard steps, like the level-up ones, are context-free props
// components. These cover the choices that only appear for certain
// race/class combinations — the conditional rendering that unit tests on
// `buildCharacter` can't see.

const renderStep = (
  Step: (p: {
    state: BuilderState;
    patch: (x: Partial<BuilderState>) => void;
  }) => JSX.Element,
  overrides: Partial<BuilderState> = {},
) => {
  const patch = vi.fn();
  const state = {
    ...defaultBuilderState(),
    mode: "guided" as const,
    ...overrides,
  };
  render(<Step state={state} patch={patch} />);
  return { patch, state };
};

describe("ClassStep", () => {
  it("offers a fighter their level-1 fighting style", () => {
    renderStep(ClassStep, { classIndex: "fighter" });
    expect(screen.getByText("Fighting style")).toBeInTheDocument();
  });

  it("doesn't offer one to a class that gets it later", () => {
    renderStep(ClassStep, { classIndex: "paladin" });
    expect(screen.queryByText("Fighting style")).not.toBeInTheDocument();
  });

  it("offers a ranger their level-1 favored enemy and terrain", async () => {
    const { patch } = renderStep(ClassStep, { classIndex: "ranger" });
    expect(screen.getByText("Favored Enemy")).toBeInTheDocument();
    expect(screen.getByText("Natural Explorer")).toBeInTheDocument();

    // Fourteen favored enemies is past `SingleChoice`'s threshold, so the pick
    // is a dropdown rather than a column of checkboxes.
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Favored Enemy" }),
      "Dragons",
    );
    expect(patch).toHaveBeenCalledWith({
      chosenOptions: { favoredEnemy: ["Dragons"] },
    });
  });

  it("offers no closed-list picks to a class whose lists start at 3rd", () => {
    renderStep(ClassStep, { classIndex: "sorcerer" });
    expect(screen.queryByText("Metamagic")).not.toBeInTheDocument();
  });

  it("offers a subclass only to classes that pick one at level 1", () => {
    renderStep(ClassStep, { classIndex: "cleric" });
    expect(screen.getByText("Subclass")).toBeInTheDocument();
  });
});

describe("RaceStep", () => {
  it("offers a feat only for a race that grants one", async () => {
    renderStep(RaceStep, { raceIndex: "human" });
    expect(screen.queryByText("Feat")).not.toBeInTheDocument();

    // Variant Human is its own race now, not a subrace of Human.
    renderStep(RaceStep, { raceIndex: "variant-human" });
    expect(screen.getAllByText("Feat").length).toBeGreaterThan(0);
  });

  it("offers Custom Lineage's feat and skill from the race itself", () => {
    renderStep(RaceStep, { raceIndex: "custom-lineage" });
    expect(screen.getAllByText("Feat").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Skill proficiencies (from your race)"),
    ).toBeInTheDocument();
  });
});

describe("BackgroundStep", () => {
  it("offers a rogue their expertise, scoped to skills they've taken", async () => {
    const { patch } = renderStep(BackgroundStep, {
      classIndex: "rogue",
      classSkillChoices: [SkillName.Stealth],
    });
    // "Stealth" also appears in the class skill picker above, so scope the
    // query to the expertise field.
    const field = screen
      .getByText(/Expertise \(choose 2\)/)
      .closest(".builder-field") as HTMLElement;
    await userEvent.click(
      within(field).getByRole("button", { name: "Stealth" }),
    );
    expect(patch).toHaveBeenCalledWith({
      expertiseChoices: [SkillName.Stealth],
    });
  });

  it("offers a bard their instrument choices", () => {
    renderStep(BackgroundStep, { classIndex: "bard" });
    expect(screen.getByText(/Tool proficiencies \(Bard\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lute" })).toBeInTheDocument();
  });

  it("offers no tool picks to a class without them", () => {
    renderStep(BackgroundStep, { classIndex: "fighter" });
    expect(screen.queryByText(/Tool proficiencies/)).not.toBeInTheDocument();
  });
});

describe("RaceStep — subrace options", () => {
  // Scope to the Subrace field: the race grid above it now has a Variant Human
  // card of its own, which a whole-document query would pick up.
  const subraceCards = () => {
    const field = screen.getByText("Subrace").closest(".builder-field");
    return within(field as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
  };

  it("lets a human be a plain SRD human", () => {
    renderStep(RaceStep, { raceIndex: "human" });
    // Variant Human used to be Human's only subrace, which made it mandatory.
    expect(subraceCards().some((t) => t.includes("Variant Human"))).toBe(false);
    expect(subraceCards().some((t) => t.includes("No subrace"))).toBe(true);
  });

  it("offers Variant Human as a race in its own right", () => {
    renderStep(RaceStep, {});
    expect(
      screen.getByRole("button", { name: /Variant Human/ }),
    ).toBeInTheDocument();
  });

  it("still grants Variant Human its feat and skill pickers", () => {
    renderStep(RaceStep, { raceIndex: "variant-human" });
    expect(screen.getAllByText("Feat").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Skill proficiencies (from your race)"),
    ).toBeInTheDocument();
  });

  it("preselects 'No subrace' for a race that has none, even with no pick recorded", () => {
    renderStep(RaceStep, {
      raceIndex: "custom-lineage",
      subraceIndex: undefined,
    });
    const noSubrace = screen
      .getAllByRole("button")
      .find((b) => (b.textContent ?? "").includes("No subrace"));
    // Leaving it unselected made "Other subrace" read as the only real option.
    expect(noSubrace?.className).toContain("selected");
  });
});
