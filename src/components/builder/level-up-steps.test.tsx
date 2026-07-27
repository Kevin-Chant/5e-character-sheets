// @vitest-environment jsdom
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
import {
  LevelUpAdvancementStep,
  LevelUpClassStep,
  LevelUpFeatureChoicesStep,
  LevelUpSpellsStep,
} from "./level-up-steps";

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

describe("LevelUpAdvancementStep — the ability score ceiling", () => {
  const renderAsi = (
    character: Character,
    state: Partial<LevelUpState> = {},
  ) => {
    const patch = vi.fn();
    render(
      <LevelUpAdvancementStep
        character={character}
        state={{ ...defaultLevelUpState(character), ...state }}
        patch={patch}
      />,
    );
    return patch;
  };

  it("doesn't offer a stat that's already at 20", () => {
    const char = level1("fighter");
    char.stats.str = 20;
    renderAsi(char, { advancement: "asi" });
    expect(screen.queryByRole("option", { name: "Strength" })).toBeNull();
    // The others are still on offer.
    expect(
      screen.getAllByRole("option", { name: "Dexterity" }).length,
    ).toBeGreaterThan(0);
  });

  it("still offers a 20 when a feature raised its ceiling", () => {
    const char = level1("fighter");
    char.stats.str = 20;
    char.features.push({ title: "Primal Champion", titleFormulas: [] });
    renderAsi(char, { advancement: "asi" });
    expect(
      screen.getAllByRole("option", { name: "Strength" }).length,
    ).toBeGreaterThan(0);
  });

  it("drops a stat from the second column once the first spends it to the cap", () => {
    const char = level1("fighter");
    char.stats.str = 19;
    renderAsi(char, { advancement: "asi", asi: { str: 1 } });
    // 19 + the +1 already taken = 20, so the remaining column can't add more.
    // The one already-picked column still shows it, hence exactly one option.
    expect(screen.getAllByRole("option", { name: "Strength" })).toHaveLength(1);
  });
});

describe("LevelUpClassStep — hit points", () => {
  const renderClassStep = (
    character: Character,
    state: Partial<LevelUpState> = {},
  ) => {
    const patch = vi.fn();
    render(
      <LevelUpClassStep
        character={character}
        state={{ ...defaultLevelUpState(character), ...state }}
        patch={patch}
      />,
    );
    return patch;
  };

  it("defaults to the average and says what the level adds", () => {
    const char = level1("fighter"); // d10, CON 14 (+2)
    renderClassStep(char, { className: OfficialClass.Fighter });
    expect(screen.getByLabelText(/Average \(6\)/)).toBeChecked();
    expect(screen.getByText(/This level adds 8 HP/)).toBeInTheDocument();
  });

  it("switches to a rolled value", async () => {
    const char = level1("fighter");
    const patch = renderClassStep(char, { className: OfficialClass.Fighter });
    await userEvent.click(screen.getByLabelText(/Roll it/));
    expect(patch).toHaveBeenCalledWith({ hpMethod: "roll" });
  });

  it("bounds the roll input by the hit die", () => {
    const char = level1("fighter");
    renderClassStep(char, {
      className: OfficialClass.Fighter,
      hpMethod: "roll",
    });
    const input = screen.getByPlaceholderText(/Your d10 result/);
    expect(input).toHaveAttribute("max", "10");
    expect(input).toHaveAttribute("min", "1");
  });
});

describe("LevelUpSpellsStep — known-spell counts", () => {
  it("states the allowance for a known caster", () => {
    const char = level1("bard");
    render(
      <LevelUpSpellsStep
        character={char}
        state={{ ...defaultLevelUpState(char), className: OfficialClass.Bard }}
        patch={vi.fn()}
      />,
    );
    // Bard 1 → 2 knows 5 spells where it knew 4: one new spell, no new cantrip.
    expect(screen.getByText(/grants 1 new spell/)).toBeInTheDocument();
  });

  it("tells a prepared caster there's nothing to enforce", () => {
    const char = level1("cleric");
    render(
      <LevelUpSpellsStep
        character={char}
        state={{
          ...defaultLevelUpState(char),
          className: OfficialClass.Cleric,
        }}
        patch={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/prepares spells from its whole list/),
    ).toBeInTheDocument();
  });
});

describe("LevelUpFeatureChoicesStep — Kensei's melee/ranged split", () => {
  // Monk 2 → 3, choosing Way of the Kensei in the same run.
  const kenseiStep = () =>
    renderStep(advanceTo(level1("monk"), "Monk", 2), {
      className: OfficialClass.Monk,
      subclass: "Kensei",
    });

  it("asks for one melee and one ranged weapon, not any two", () => {
    kenseiStep();
    expect(screen.getByText("Melee kensei weapon")).toBeInTheDocument();
    expect(screen.getByText("Ranged kensei weapon")).toBeInTheDocument();
  });

  it("offers only melee weapons in the melee slot", () => {
    kenseiStep();
    const melee = screen.getByRole("combobox", {
      name: /Melee kensei weapon/,
    });
    const names = within(melee)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toContain("Longsword");
    expect(names).not.toContain("Longbow");
    expect(names).not.toContain("Shortbow");
  });

  it("records a pick per slot without disturbing the other", async () => {
    const { patch } = kenseiStep();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Melee kensei weapon/ }),
      "Longsword",
    );
    expect(patch).toHaveBeenCalledWith({
      chosenOptions: { kenseiWeapon: ["Longsword"] },
    });
  });

  it("falls back to a single free pick at 6th, where the split doesn't apply", () => {
    const monk5 = advanceTo(level1("monk"), "Monk", 5);
    monk5.class[0].subclass = "Kensei";
    renderStep(monk5, { className: OfficialClass.Monk });
    expect(screen.queryByText("Melee kensei weapon")).not.toBeInTheDocument();
    expect(screen.getByText("Kensei Weapons")).toBeInTheDocument();
  });
});

describe("LevelUpSpellsStep — Lore Bard's Additional Magical Secrets", () => {
  const bard5 = (subclass: string) => {
    const char = advanceTo(level1("bard"), "Bard", 5);
    char.class[0].subclass = subclass;
    return char;
  };

  const renderSpells = (character: Character) => {
    const patch = vi.fn();
    render(
      <LevelUpSpellsStep
        character={character}
        state={{
          ...defaultLevelUpState(character),
          className: OfficialClass.Bard,
        }}
        patch={patch}
      />,
    );
    return { patch };
  };

  it("offers two off-list spells to a Lore bard reaching 6th", () => {
    renderSpells(bard5("Lore"));
    expect(
      screen.getByText("Additional Magical Secrets (choose 2)"),
    ).toBeInTheDocument();
    // The list ignores the bard list — Fireball is a sorcerer/wizard spell.
    expect(screen.getByText("Fireball")).toBeInTheDocument();
  });

  it("groups the mixed-level list under level headings", () => {
    renderSpells(bard5("Lore"));
    const list = screen.getByText("Fireball").closest(".builder-spell-list")!;
    const headings = within(list as HTMLElement)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    // Ascending, and the cantrips the bard can also take are named as such.
    expect(headings).toEqual([
      "Cantrips",
      "1st level",
      "2nd level",
      "3rd level",
    ]);
  });

  it("writes picks to secretSpells, apart from the level's own allowance", async () => {
    const { patch } = renderSpells(bard5("Lore"));
    await userEvent.click(screen.getByText("Fireball"));
    expect(patch).toHaveBeenCalledWith({ secretSpells: ["fireball"] });
  });

  it("offers nothing to a Valor bard", () => {
    renderSpells(bard5("Valor"));
    expect(
      screen.queryByText(/Additional Magical Secrets/),
    ).not.toBeInTheDocument();
  });
});
