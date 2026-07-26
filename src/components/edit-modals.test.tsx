import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArmorType, FIELD, SkillName } from "src/lib/data/data-definitions";
import {
  aCharacter,
  renderWithCharacter,
} from "src/lib/fixtures/render-with-character";
import EditArmorProficiencies from "./edit-armor-proficiencies";
import EditChosenOptions from "./edit-chosen-options";
import EditHitDice from "./edit-hit-dice";
import EditRace from "./edit-race";
import EditSenses from "./edit-senses";
import EditSkills from "./edit-skills";
import EditSpeeds from "./edit-speeds";

// The sheet's edit modals. Each is a small form over one slice of the
// character, and they split into two save styles that are easy to confuse:
//
// - **Live**: every keystroke dispatches, and the modal's Save button just
//   closes (speeds, race, armor proficiencies, hit dice). Cancelling does *not*
//   discard — the modal container's draft buffer handles that.
// - **Deferred**: local state, committed as one action on save (senses), or
//   save-on-change through `commit` (skills).
//
// So what these tests pin is which of the two each modal is, and that the
// action it produces carries the field's whole new value — the invariant undo,
// redo and live-sync all rest on.

describe("EditSpeeds", () => {
  it("writes the walking speed as you type", async () => {
    const harness = renderWithCharacter(<EditSpeeds />, {
      targetedField: FIELD.speeds,
    });
    const walk = screen.getByLabelText(/Walking speed/);
    await userEvent.clear(walk);
    await userEvent.type(walk, "35");
    expect(harness.character.speeds.walk).toBe(35);
  });

  it("offers only the modes the character doesn't already have", () => {
    const character = aCharacter();
    character.speeds = { walk: 30, fly: 60 };
    renderWithCharacter(<EditSpeeds />, {
      character,
      targetedField: FIELD.speeds,
    });
    const add = screen.getByLabelText(/Add movement mode/);
    const options = Array.from(add.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).not.toContain("Fly");
    expect(options).toContain("Swim");
  });

  it("removes an extra mode without touching walk", async () => {
    const character = aCharacter();
    character.speeds = { walk: 30, fly: 60, swim: 20 };
    const harness = renderWithCharacter(<EditSpeeds />, {
      character,
      targetedField: FIELD.speeds,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Fly speed" }),
    );
    expect(harness.character.speeds.fly).toBeUndefined();
    expect(harness.character.speeds.swim).toBe(20);
    expect(harness.character.speeds.walk).toBe(30);
  });
});

describe("EditSenses", () => {
  it("commits the new sense as one action on save, not as you type", async () => {
    const character = aCharacter();
    character.senses = {};
    const harness = renderWithCharacter(<EditSenses />, {
      character,
      targetedField: FIELD.senses,
      subField: "new",
    });
    const range = screen.getByLabelText(/Range/);
    await userEvent.clear(range);
    await userEvent.type(range, "90");
    // Nothing written yet — the pick is local until saved.
    expect(harness.character.senses.darkvision).toBeUndefined();
    expect(harness.saveData).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(harness.saveData).toHaveBeenCalledTimes(1);
    const action = harness.saveData.mock.calls[0][1];
    expect(action).toMatchObject({ payload: { value: 90 } });
  });

  it("switching sense in add-mode retargets the action, leaving no orphan key", async () => {
    const character = aCharacter();
    character.senses = {};
    const harness = renderWithCharacter(<EditSenses />, {
      character,
      targetedField: FIELD.senses,
      subField: "new",
    });
    await userEvent.selectOptions(
      screen.getByLabelText(/Sense/),
      "tremorsense",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    const action = harness.saveData.mock.calls[0][1] as { path?: unknown[] };
    expect(JSON.stringify(action)).toContain("tremorsense");
    expect(JSON.stringify(action)).not.toContain("darkvision");
  });

  it("edits an existing sense's range without offering a type picker", () => {
    const character = aCharacter();
    character.senses = { darkvision: 60 };
    renderWithCharacter(<EditSenses />, {
      character,
      targetedField: FIELD.senses,
      subField: "darkvision",
    });
    expect(screen.getByLabelText(/Sense/)).toBeDisabled();
    expect(screen.getByLabelText(/Range/)).toHaveValue(60);
  });
});

describe("EditArmorProficiencies", () => {
  it("toggles one armor type, leaving the others alone", async () => {
    const character = aCharacter();
    character.otherProficiencies.armor = {
      [ArmorType.Light]: true,
      [ArmorType.Medium]: false,
      [ArmorType.Heavy]: false,
      [ArmorType.Shields]: true,
    };
    const harness = renderWithCharacter(<EditArmorProficiencies />, {
      targetedField: FIELD.otherProficiencies,
      character,
    });
    await userEvent.click(
      screen.getByRole("checkbox", { name: ArmorType.Heavy }),
    );
    const armor = harness.character.otherProficiencies.armor;
    expect(armor[ArmorType.Heavy]).toBe(true);
    expect(armor[ArmorType.Light]).toBe(true);
    expect(armor[ArmorType.Shields]).toBe(true);
  });
});

describe("EditHitDice", () => {
  it("seeds the total from the class levels when there's no override", () => {
    const character = aCharacter();
    character.totalHitDice = undefined as never;
    const harness = renderWithCharacter(<EditHitDice />, {
      character,
      targetedField: FIELD.totalHitDice,
    });
    // defaultCharacter is Paladin 9 / Warlock 3 — d10s and d8s, not zeroes.
    expect(harness.character.totalHitDice).toEqual({ d10: 9, d8: 3 });
  });

  it("clears the override through saveData rather than dispatch", async () => {
    const harness = renderWithCharacter(<EditHitDice />, {
      targetedField: FIELD.totalHitDice,
    });
    await userEvent.click(
      screen.getByRole("button", { name: /clear override/i }),
    );
    expect(harness.saveData).toHaveBeenCalled();
  });
});

describe("EditRace", () => {
  it("edits name, subrace and size independently", async () => {
    const harness = renderWithCharacter(<EditRace />, {
      targetedField: FIELD.race,
    });
    const subrace = screen.getByLabelText(/Subrace/);
    await userEvent.clear(subrace);
    await userEvent.type(subrace, "Feral");
    expect(harness.character.race.subrace).toBe("Feral");
    // Untouched by the subrace edit.
    expect(harness.character.race.name).toBe("Tiefling");
  });
});

describe("EditSkills", () => {
  it("moves a skill through none → proficient → expert as two commits", async () => {
    const character = aCharacter();
    character.proficiencies.skills[SkillName.Arcana] = false;
    character.proficiencies.expertise[SkillName.Arcana] = false;
    const harness = renderWithCharacter(<EditSkills />, {
      character,
      targetedField: FIELD.proficiencies,
      subField: "skills",
    });
    const row = screen.getByText("Arcana").closest("li")!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Proficient" }),
    );
    // Proficiency and expertise are separate fields, so the state change is two
    // whole-value updates rather than one — both must fire, or the two drift.
    expect(harness.commit).toHaveBeenCalledTimes(2);
    const values = harness.commit.mock.calls.map(
      (c) => (c[0] as { payload: { value: unknown } }).payload.value,
    );
    expect(values).toEqual([true, false]);
  });
});

describe("EditChosenOptions", () => {
  it("renders nothing unless it was opened for chosenOptions", () => {
    const { container } = renderWithCharacter(<EditChosenOptions />, {
      targetedField: FIELD.race,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("locks the unpicked options once the allowance is spent", () => {
    const character = aCharacter();
    // defaultCharacter is a Warlock 3 with Pact of the Blade — one pact boon,
    // and the allowance is exactly one.
    renderWithCharacter(<EditChosenOptions />, {
      character,
      targetedField: FIELD.chosenOptions,
    });
    const blade = screen.getByRole("checkbox", { name: /Pact of the Blade/ });
    const chain = screen.getByRole("checkbox", { name: /Pact of the Chain/ });
    expect(blade).toBeChecked();
    // You can always un-pick to swap, but you can't quietly hold two.
    expect(blade).not.toBeDisabled();
    expect(chain).toBeDisabled();
  });

  it("records a pick with the catalog's summary as its detail", async () => {
    const character = aCharacter();
    character.chosenOptions = [];
    const harness = renderWithCharacter(<EditChosenOptions />, {
      character,
      targetedField: FIELD.chosenOptions,
    });
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Pact of the Tome/ }),
    );
    expect(harness.character.chosenOptions).toEqual([
      expect.objectContaining({
        category: "pactBoon",
        name: "Pact of the Tome",
        detail: expect.stringContaining("Book of Shadows"),
      }),
    ]);
  });
});
