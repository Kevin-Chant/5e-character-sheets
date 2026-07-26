import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import {
  aCharacter,
  renderWithCharacter,
} from "src/lib/fixtures/render-with-character";
import { Character } from "src/lib/types";
import { OfficialClass } from "src/lib/data/data-definitions";
import Spellcasting from "./spellcasting";

// Whether the spellcasting section appears at all. A Champion Fighter has no
// spellcasting, and used to be shown an empty "Cantrips" card regardless —
// scaffolding for something the character can never do. The rule is that the
// section is present when the character casts, and that "casts" includes spells
// picked up outside a spellcasting class (a feat, a race, an item).

// The default character is a Paladin/Warlock, and `Spellcasting` back-fills a
// spellcasting entry for any casting class on the sheet — so a genuine
// non-caster has to be a non-casting *class*, not just an emptied list.
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
    // No empty spell furniture behind it.
    expect(screen.queryByText("Cantrips")).not.toBeInTheDocument();
  });

  it("shows the spell area once a spellcasting class exists", () => {
    const character = nonCaster();
    character.spellcastingClasses = [{ classId: character.class[0].id }];
    renderWithCharacter(<Spellcasting />, { character, editMode: false });
    expect(screen.getByText("Cantrips")).toBeInTheDocument();
  });

  it("shows the spell area for a spell learned outside a casting class", () => {
    // A Fighter with Magic Initiate has cantrips but no spellcasting class.
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
  // A wizard with a single 5th-level slot, which is the case the plural caption
  // got wrong ("1 SLOTS").
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
    // `SpellSlots` is keyed for every level, so override the one under test
    // rather than replacing the whole record.
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
    // A 9th-level wizard has slots at every level up to 5, so the plural is
    // everywhere; what matters is that nothing has gone singular.
    expect(screen.getAllByText("Slots").length).toBeGreaterThan(0);
    expect(screen.queryByText("Slot")).not.toBeInTheDocument();
  });
});
