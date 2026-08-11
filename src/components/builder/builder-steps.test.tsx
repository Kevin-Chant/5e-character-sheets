// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseOption } from "src/lib/fixtures/select-testing";
import { SkillName } from "src/lib/data/data-definitions";
import { BuilderState, defaultBuilderState } from "src/lib/builder/types";
import {
  BackgroundStep,
  ClassStep,
  DetailsStep,
  RaceStep,
} from "./builder-steps";
import { DEFAULT_SETTINGS, SettingsContext } from "src/lib/hooks/use-settings";

// Covers conditional rendering for certain race/class combinations that unit
// tests on `buildCharacter` can't see.

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

    await chooseOption("Favored Enemy", "Dragons");
    expect(patch).toHaveBeenCalledWith({
      chosenOptions: { favoredEnemy: ["Dragons"] },
    });
  });

  it("offers a ranger the Tasha's swaps, and drops the list a swap replaces", async () => {
    const { patch } = renderStep(ClassStep, { classIndex: "ranger" });
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Favored Foe/ }),
    );
    expect(patch).toHaveBeenCalledWith({ optionalFeatures: ["Favored Foe"] });
  });

  it("drops only the list the taken swap replaces", () => {
    renderStep(ClassStep, {
      classIndex: "ranger",
      optionalFeatures: ["Favored Foe"],
    });
    expect(screen.queryByText("Favored Enemy")).not.toBeInTheDocument();
    expect(screen.getByText("Natural Explorer")).toBeInTheDocument();
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

  it("asks a Human their bonus language, without suggesting one they have", async () => {
    renderStep(RaceStep, { raceIndex: "human" });
    expect(screen.getByText("Extra languages")).toBeInTheDocument();

    await userEvent.click(
      screen.getByPlaceholderText("Choose or type a language"),
    );
    expect(screen.getByRole("button", { name: "Elvish" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Common" }),
    ).not.toBeInTheDocument();
  });

  it("asks no bonus language of a race that grants none", () => {
    renderStep(RaceStep, { raceIndex: "dwarf" });
    expect(screen.queryByText("Extra languages")).not.toBeInTheDocument();
  });
});

describe("BackgroundStep", () => {
  it("offers a rogue their expertise, scoped to skills they've taken", async () => {
    const { patch } = renderStep(BackgroundStep, {
      classIndex: "rogue",
      classSkillChoices: [SkillName.Stealth],
    });
    // Scope to the expertise field: "Stealth" also appears in the class skill picker above.
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

  it("suggests real tools and languages for a custom background", async () => {
    const { patch } = renderStep(BackgroundStep, {
      backgroundIsCustom: true,
      backgroundName: undefined,
    });
    await userEvent.click(screen.getAllByPlaceholderText(/type a tool/)[0]);
    await userEvent.click(screen.getByText("Herbalism kit"));
    expect(patch).toHaveBeenCalledWith({
      customBackgroundTools: "Herbalism kit",
    });

    await userEvent.click(screen.getAllByPlaceholderText(/type a language/)[0]);
    await userEvent.click(screen.getByText("Draconic"));
    expect(patch).toHaveBeenCalledWith({
      backgroundLanguageChoices: ["Draconic"],
    });
  });

  it("offers a background's own skill choice, and only its own options", async () => {
    const { patch } = renderStep(BackgroundStep, {
      backgroundName: "Cloistered Scholar",
    });
    const field = screen
      .getByText(/Background skill proficiencies \(choose 1\)/)
      .closest(".builder-field") as HTMLElement;
    // History is granted outright, so it's not an option.
    expect(
      within(field).queryByRole("button", { name: "History" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(field).getByRole("button", { name: "Religion" }),
    );
    expect(patch).toHaveBeenCalledWith({
      backgroundSkillChoices: [SkillName.Religion],
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
  // Scope to the Subrace field: Variant Human also has its own race grid card.
  const subraceCards = () => {
    const field = screen.getByText("Subrace").closest(".builder-field");
    return within(field as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
  };

  it("lets a human be a plain SRD human", () => {
    renderStep(RaceStep, { raceIndex: "human" });
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
    expect(noSubrace?.className).toContain("selected");
  });
});

describe("DetailsStep and the personality setting", () => {
  const PERSONALITY = ["Personality traits", "Ideals", "Bonds", "Flaws"];

  const renderDetails = (trackPersonality: boolean) =>
    render(
      <SettingsContext.Provider
        value={{
          settings: { ...DEFAULT_SETTINGS, trackPersonality },
          updateSetting: vi.fn(),
          resetSettings: vi.fn(),
        }}
      >
        <DetailsStep
          state={{ ...defaultBuilderState(), mode: "guided" }}
          patch={vi.fn()}
        />
      </SettingsContext.Provider>,
    );

  it("asks for personality by default", () => {
    renderDetails(true);
    for (const label of PERSONALITY)
      expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("skips the personality fields when the table doesn't use them", () => {
    renderDetails(false);
    for (const label of PERSONALITY)
      expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("still asks for the rest of the details", () => {
    renderDetails(false);
    expect(screen.getByText("Character name")).toBeInTheDocument();
    expect(screen.getByText("Alignment")).toBeInTheDocument();
  });
});
