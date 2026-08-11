// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import {
  aCharacter,
  renderWithCharacter,
} from "src/lib/fixtures/render-with-character";
import { Character } from "src/lib/types";
import { OfficialClass } from "src/lib/data/data-definitions";
import Spellcasting from "./spellcasting";

// The default character is a Paladin/Warlock, and `Spellcasting` back-fills a
// spellcasting entry for any casting class on the sheet, so a non-caster
// needs a non-casting class, not just an emptied list.
const nonCaster = (): Character => {
  const character = aCharacter();
  character.class = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: OfficialClass.Fighter,
      level: 5,
    },
  ];
  character.spellcastingClasses = [];
  character.spells = {};
  character.pactSlots = undefined;
  return character;
};

describe("Spellcasting visibility", () => {
  it("renders nothing for a non-caster in play mode", () => {
    const { container } = renderWithCharacter(<Spellcasting />, {
      character: nonCaster(),
      editMode: false,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("offers only the opt-in for a non-caster in edit mode", () => {
    renderWithCharacter(<Spellcasting />, {
      character: nonCaster(),
      editMode: true,
    });
    expect(
      screen.getByRole("button", { name: "Add spellcasting class" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cantrips")).not.toBeInTheDocument();
  });

  it("shows the spell area once a spellcasting class exists", () => {
    const character = nonCaster();
    character.spellcastingClasses = [{ classId: character.class[0].id }];
    renderWithCharacter(<Spellcasting />, { character, editMode: false });
    expect(screen.getByText("Cantrips")).toBeInTheDocument();
  });

  it("shows the spell area for a spell learned outside a casting class", () => {
    const character = nonCaster();
    character.spells = {
      0: [
        {
          spellcastingClass: character.class[0].id,
          info: { title: "Fire Bolt", titleFormulas: [] },
        },
      ],
    };
    renderWithCharacter(<Spellcasting />, { character, editMode: false });
    expect(screen.getByText("Cantrips")).toBeInTheDocument();
    expect(screen.getByText("Fire Bolt")).toBeInTheDocument();
  });
});

describe("spell slot captions", () => {
  const caster = (level: number, slots: number): Character => {
    const character = nonCaster();
    character.class = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: OfficialClass.Wizard,
        level: 9,
      },
    ];
    character.spellcastingClasses = [{ classId: character.class[0].id }];
    // Override just the level under test; `SpellSlots` is keyed per level.
    character.spellSlots = {
      ...character.spellSlots,
      [level]: { totalOverride: slots, expended: 0 },
    };
    return character;
  };

  it("says slot, singular, when there is exactly one", () => {
    renderWithCharacter(<Spellcasting />, {
      character: caster(5, 1),
      editMode: false,
    });
    expect(screen.getByText("Slot")).toBeInTheDocument();
  });

  it("says slots for every other count", () => {
    renderWithCharacter(<Spellcasting />, {
      character: caster(5, 2),
      editMode: false,
    });
    expect(screen.getAllByText("Slots").length).toBeGreaterThan(0);
    expect(screen.queryByText("Slot")).not.toBeInTheDocument();
  });
});
