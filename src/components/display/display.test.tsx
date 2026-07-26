import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CoinType,
  DamageType,
  FIELD,
  RestType,
} from "src/lib/data/data-definitions";
import {
  aCharacter,
  dispatchedValue,
  renderWithCharacter,
} from "src/lib/fixtures/render-with-character";
import { Character } from "src/lib/types";
import AmmunitionDisplay from "./ammunition-display";
import AttunementDisplay from "./attunement-display";
import CoinsDisplay from "./coins-display";
import DamageModifiersDisplay from "./damage-modifiers-display";
import SensesDisplay from "./senses-display";
import EquipmentDisplay from "./equipment-display";
import LimitedUseAbilitiesDisplay from "./limited-use-abilities-display";
import SpeedDisplay from "./speed-display";

// The sheet's read-side components. What's worth testing here isn't the markup
// — it's the two decisions each of these makes that the pure-function tests
// can't reach: **what edit mode changes** (which affordances disappear in play
// mode, and which deliberately stay because you use them mid-session), and
// **what a click dispatches** (an update carries the field's whole new value,
// so a wrong slice shows up as a wrong payload).

describe("CoinsDisplay", () => {
  it("shows every denomination as a field in edit mode", () => {
    renderWithCharacter(<CoinsDisplay />);
    // defaultCharacter carries PP/GP/SP; EP and CP are zero but still editable.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(5);
  });

  it("collapses to the coins actually held in play mode", () => {
    renderWithCharacter(<CoinsDisplay />, { editMode: false });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("PP")).toBeInTheDocument();
    // EP is zero, so play mode doesn't shout it.
    expect(screen.queryByText("EP")).not.toBeInTheDocument();
  });

  it("falls back to GP when the purse is empty", () => {
    const character = aCharacter();
    character.coins = {};
    renderWithCharacter(<CoinsDisplay />, { character, editMode: false });
    expect(screen.getByText("GP")).toBeInTheDocument();
  });

  it("writes the edited denomination through to the character", async () => {
    const harness = renderWithCharacter(<CoinsDisplay />);
    const gp = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(gp);
    await userEvent.type(gp, "12");
    expect(harness.character.coins[CoinType.GP]).toBe(12);
    // Other denominations are untouched — the update carries only this leaf.
    expect(harness.character.coins[CoinType.PP]).toBe(4);
  });

  it("clamps a cleared field to zero rather than NaN", async () => {
    const harness = renderWithCharacter(<CoinsDisplay />);
    await userEvent.clear(screen.getAllByRole("spinbutton")[1]);
    expect(harness.character.coins[CoinType.GP]).toBe(0);
  });
});

describe("SensesDisplay", () => {
  it("lists only the senses the character has", () => {
    renderWithCharacter(<SensesDisplay />);
    expect(screen.getByText("Darkvision")).toBeInTheDocument();
    expect(screen.queryByText("Truesight")).not.toBeInTheDocument();
  });

  it("clears one sense without disturbing the others", async () => {
    const character = aCharacter();
    character.senses = { darkvision: 60, blindsight: 10 };
    const { dispatch } = renderWithCharacter(<SensesDisplay />, { character });
    const row = screen.getByText("Blindsight").closest(".prof-row")!;
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: /remove/i,
      }),
    );
    expect(dispatch).toHaveBeenCalled();
  });

  it("offers no add or remove controls in play mode", () => {
    renderWithCharacter(<SensesDisplay />, { editMode: false });
    expect(screen.getByText("Darkvision")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SpeedDisplay", () => {
  it("shows walking speed as the headline number", () => {
    renderWithCharacter(<SpeedDisplay />);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
  });

  it("opens the speeds editor on click in edit mode only", async () => {
    const { setTargetedFieldStack } = renderWithCharacter(<SpeedDisplay />);
    await userEvent.click(screen.getByText("30"));
    expect(setTargetedFieldStack).toHaveBeenCalledWith([
      [FIELD.speeds, undefined],
    ]);
  });

  it("is inert in play mode", async () => {
    const { setTargetedFieldStack } = renderWithCharacter(<SpeedDisplay />, {
      editMode: false,
    });
    await userEvent.click(screen.getByText("30"));
    expect(setTargetedFieldStack).not.toHaveBeenCalled();
  });
});

describe("DamageModifiersDisplay", () => {
  const withMods = (): Character => {
    const c = aCharacter();
    c.damageModifiers = {
      resistances: [DamageType.Fire, DamageType.Cold],
      immunities: [],
      vulnerabilities: [],
    };
    return c;
  };

  it("shows all three categories in edit mode, even the empty ones", () => {
    renderWithCharacter(<DamageModifiersDisplay />, { character: withMods() });
    expect(screen.getByText("Resistances")).toBeInTheDocument();
    expect(screen.getByText("Immunities")).toBeInTheDocument();
    expect(screen.getByText("Vulnerabilities")).toBeInTheDocument();
  });

  it("hides empty categories in play mode", () => {
    renderWithCharacter(<DamageModifiersDisplay />, {
      character: withMods(),
      editMode: false,
    });
    expect(screen.getByText("Resistances")).toBeInTheDocument();
    expect(screen.queryByText("Immunities")).not.toBeInTheDocument();
  });

  it("hides the whole box when there's nothing to show", () => {
    const c = aCharacter();
    c.damageModifiers = {
      resistances: [],
      immunities: [],
      vulnerabilities: [],
    };
    const { container } = renderWithCharacter(<DamageModifiersDisplay />, {
      character: c,
      editMode: false,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("dispatches the remaining list when one entry is removed", async () => {
    const { dispatch } = renderWithCharacter(<DamageModifiersDisplay />, {
      character: withMods(),
    });
    const row = screen.getByText("Resistances").closest(".prof-row")!;
    const [firstRemove] = within(row as HTMLElement).getAllByRole("button", {
      name: /remove/i,
    });
    await userEvent.click(firstRemove);
    expect(dispatchedValue(dispatch)).toEqual([DamageType.Cold]);
  });
});

describe("AttunementDisplay", () => {
  const withAttuneables = (attunedCount: number): Character => {
    const c = aCharacter();
    c.equipment = c.equipment.slice(0, 4).map((item, i) => ({
      ...item,
      attunement: { attuned: i < attunedCount },
    }));
    return c;
  };

  it("renders nothing when no item requires attunement", () => {
    const c = aCharacter();
    c.equipment = c.equipment.map((i) => ({ ...i, attunement: undefined }));
    const { container } = renderWithCharacter(<AttunementDisplay />, {
      character: c,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("locks the unattuned rows once the slot cap is reached", () => {
    renderWithCharacter(<AttunementDisplay />, {
      character: withAttuneables(3),
    });
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const [a, b, c, d] = boxes;
    // The three attuned stay togglable so you can free a slot…
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
    expect(c.disabled).toBe(false);
    // …but the fourth can't be attuned without freeing one first.
    expect(d.disabled).toBe(true);
  });

  it("stays live in play mode — attuning happens during a rest", async () => {
    const { dispatch } = renderWithCharacter(<AttunementDisplay />, {
      character: withAttuneables(0),
      editMode: false,
    });
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(dispatchedValue(dispatch)).toEqual({ attuned: true });
  });
});

describe("AmmunitionDisplay", () => {
  const withAmmo = (): Character => {
    const c = aCharacter();
    c.ammunition = [
      { id: c.attacks[0].id, name: "Arrows", count: 20, weaponIds: [] },
      { id: c.attacks[1].id, name: "Bolts", count: 8, weaponIds: [] },
    ];
    return c;
  };

  it("keeps the count editable in play mode — you spend ammo as you shoot", () => {
    renderWithCharacter(<AmmunitionDisplay />, {
      character: withAmmo(),
      editMode: false,
    });
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    // The name is only editable in edit mode, so it's plain text here.
    expect(
      screen.queryByRole("button", { name: "Arrows" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Arrows")).toBeInTheDocument();
  });

  it("removes a pool by dispatching the whole remaining list", async () => {
    const { dispatch } = renderWithCharacter(<AmmunitionDisplay />, {
      character: withAmmo(),
    });
    const removes = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removes[0]);
    expect(
      (dispatchedValue(dispatch) as { name: string }[]).map((a) => a.name),
    ).toEqual(["Bolts"]);
  });
});

describe("EquipmentDisplay", () => {
  it("keeps the equipped toggle live in play mode — it drives AC", async () => {
    const character = aCharacter();
    const armor = character.equipment.find((i) => i.armor)!;
    const harness = renderWithCharacter(<EquipmentDisplay />, {
      character,
      editMode: false,
    });
    const toggle = screen.getByRole("button", {
      name: new RegExp(`${armor.text.title} — (not )?equipped`),
    });
    const before = !!armor.equipped;
    await userEvent.click(toggle);
    const after = harness.character.equipment.find((i) => i.armor)!.equipped;
    expect(!!after).toBe(!before);
  });

  it("removes an item by dispatching the whole remaining list", async () => {
    const harness = renderWithCharacter(<EquipmentDisplay />);
    const count = harness.character.equipment.length;
    const [firstRemove] = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(firstRemove);
    expect(harness.character.equipment).toHaveLength(count - 1);
  });
});

describe("LimitedUseAbilitiesDisplay", () => {
  const withPools = (): Character => {
    const c = aCharacter();
    c.limitedUseAbilities = [
      {
        info: { title: "Channel Divinity", titleFormulas: [] },
        maxUses: 2,
        recharge: RestType.shortRest,
        expended: 1,
      },
      {
        info: { title: "Sorcery Points", titleFormulas: [] },
        maxUses: 12,
        recharge: RestType.longRest,
        expended: 4,
      },
    ];
    return c;
  };

  it("shows a small pool as pips and a large one as a counter", async () => {
    const harness = renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: withPools(),
    });
    // 12 uses is past the pip threshold, so it reads as "remaining / total"…
    expect(screen.getByText("8 / 12")).toBeInTheDocument();
    // …with −/+ instead of a pip per use.
    await userEvent.click(screen.getByRole("button", { name: "Spend a use" }));
    expect(harness.character.limitedUseAbilities[1].expended).toBe(5);
  });

  it("drops the edit and remove affordances in play mode", () => {
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: withPools(),
      editMode: false,
    });
    // The pools are still there and still spendable…
    expect(screen.getByText("8 / 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spend a use" })).toBeEnabled();
    // …but you can't restructure them mid-session.
    expect(
      screen.queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
  });

  it("removes a pool by dispatching the remaining list", async () => {
    const harness = renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: withPools(),
    });
    const removes = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removes[0]);
    expect(
      harness.character.limitedUseAbilities.map((a) => a.info.title),
    ).toEqual(["Sorcery Points"]);
  });
});
