// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { chooseOption } from "src/lib/fixtures/select-testing";
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
import { randomUUID } from "src/lib/browser";
import { charPath } from "src/lib/cursor";
import { MAX_EXHAUSTION } from "src/lib/rules";
import { maxHpValue } from "src/lib/mechanics/resolve";
import { EncounterContext, NO_ENCOUNTER } from "src/lib/hooks/use-encounter";
import { NO_TABLE_TALK, TableTalkContext } from "src/lib/hooks/use-table-talk";
import { EMPTY_ENCOUNTER, Participant } from "src/lib/play/encounter";
import AmmunitionDisplay from "./ammunition-display";
import AttunementDisplay from "./attunement-display";
import CoinsDisplay from "./coins-display";
import DamageModifiersDisplay from "./damage-modifiers-display";
import SensesDisplay from "./senses-display";
import EquipmentDisplay from "./equipment-display";
import LimitedUseAbilitiesDisplay from "./limited-use-abilities-display";
import SpeedDisplay from "./speed-display";
import TrackerValue from "./tracker-value";
import DeathSavesDisplay from "./death-saves-display";
import MultiLineTextDisplay from "./multi-line-text-display";
import OtherProficienciesDisplay from "./other-proficiencies-display";
import CharacterInfoPanel from "../character-info-panel";

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
    await userEvent.tab();
    expect(harness.character.coins[CoinType.GP]).toBe(12);
    // Other denominations are untouched — the update carries only this leaf.
    expect(harness.character.coins[CoinType.PP]).toBe(4);
  });

  it("writes once when the edit finishes, not once per digit", async () => {
    const harness = renderWithCharacter(<CoinsDisplay />);
    const gp = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(gp);
    await userEvent.type(gp, "150");
    // Nothing written yet — this used to have already stored 1, then 15.
    expect(harness.dispatch).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.character.coins[CoinType.GP]).toBe(150);
  });

  it("reverts a cleared field rather than storing zero or NaN", async () => {
    // Clearing a field and leaving it is more often abandonment than an intent
    // to zero it — and typing "0" says that unambiguously. (This used to store
    // 0 on clear, back when every keystroke was committed.)
    const harness = renderWithCharacter(<CoinsDisplay />);
    const gp = screen.getAllByRole("spinbutton")[1];
    const before = harness.character.coins[CoinType.GP];
    await userEvent.clear(gp);
    await userEvent.tab();
    expect(harness.character.coins[CoinType.GP]).toBe(before);
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it("stores zero when zero is actually typed", async () => {
    const harness = renderWithCharacter(<CoinsDisplay />);
    const gp = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(gp);
    await userEvent.type(gp, "0");
    await userEvent.tab();
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

  // Attuning is the other gate on an item-owned ability: for an already-worn
  // item, the attune checkbox is what moves the ability in and out of the
  // Limited-Use list (unattuning parks the live row back on the item).
  it("attuning brings an equipped item's ability in; unattuning parks it", async () => {
    const character = aCharacter();
    character.limitedUseAbilities = [];
    const abilityId = randomUUID();
    character.equipment = [
      {
        id: randomUUID(),
        text: { title: "Staff of Healing", titleFormulas: [] },
        quantity: 1,
        equippable: true,
        equipped: true,
        attunement: { attuned: false },
        ability: {
          id: abilityId,
          info: { title: "Cure Wounds", titleFormulas: [] },
          maxUses: 10,
          recharge: "Dawn",
          expended: 0,
        },
      },
    ];
    const harness = renderWithCharacter(<AttunementDisplay />, { character });

    await userEvent.click(screen.getByRole("checkbox"));
    expect(harness.character.limitedUseAbilities).toHaveLength(1);
    expect(harness.character.limitedUseAbilities[0].id).toBe(abilityId);

    await userEvent.click(screen.getByRole("checkbox"));
    expect(harness.character.limitedUseAbilities).toHaveLength(0);
    expect(harness.character.equipment[0].ability!.id).toBe(abilityId);
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

  it("disappears in play mode with no pools, rather than leaving a bare heading", () => {
    const { container } = renderWithCharacter(<AmmunitionDisplay />, {
      editMode: false,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps its heading in edit mode with no pools, so a pool can be added", () => {
    renderWithCharacter(<AmmunitionDisplay />);
    expect(screen.getByText("Ammunition")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add ammunition" }),
    ).toBeInTheDocument();
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

describe("OtherProficienciesDisplay separators", () => {
  // The Tools & Other entries are rich TextComponents, so their label renders
  // through TextWithFormulasDisplay while the comma separating them is a plain
  // sibling. When that component wrapped its text in a <div>, the block took the
  // whole line and pushed the comma onto the next one — an orphaned comma with a
  // broken line height under it. jsdom has no layout, so pin the cause: the text
  // run has to be phrasing content for the comma to sit beside it.
  it("keeps a tool's separator on the same line as its name", () => {
    const character = aCharacter();
    character.otherProficiencies.toolsAndOther = [
      { title: "One type of gaming set", titleFormulas: [] },
      { title: "Vehicles (land)", titleFormulas: [] },
    ];
    renderWithCharacter(<OtherProficienciesDisplay />, { character });
    const row = screen.getByText("Tools & Other").closest(".prof-row")!;
    const first = row.querySelectorAll(".prof-chip-label")[0];
    expect(first.textContent).toBe("One type of gaming set,");
    expect(first.querySelector("div")).toBeNull();
    expect(first.querySelector("p")).toBeNull();
  });

  it("leaves the last entry without a trailing comma", () => {
    const character = aCharacter();
    character.otherProficiencies.toolsAndOther = [
      { title: "Thieves' Tools", titleFormulas: [] },
    ];
    renderWithCharacter(<OtherProficienciesDisplay />, { character });
    const row = screen.getByText("Tools & Other").closest(".prof-row")!;
    expect(row.querySelector(".prof-chip-label")!.textContent).toBe(
      "Thieves' Tools",
    );
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

  // A weapon item owns its attack: the row in `attacks` exists only while the
  // item is equipped, mirroring how armor only counts toward AC while worn.
  const withWeaponItem = (): Character => {
    const character = aCharacter();
    character.equipment.push({
      id: randomUUID(),
      text: { title: "Longsword", titleFormulas: [] },
      quantity: 1,
      equipped: false,
      weapon: { attack: { id: randomUUID(), name: "Longsword", formula: {} } },
    });
    return character;
  };
  const weaponItem = (c: Character) => c.equipment.find((i) => i.weapon)!;

  it("equipping a weapon adds its attack row; unequipping removes it", async () => {
    const character = withWeaponItem();
    const attackId = weaponItem(character).weapon!.attack.id;
    const harness = renderWithCharacter(<EquipmentDisplay />, { character });
    const baseAttacks = character.attacks.length;

    await userEvent.click(
      screen.getByRole("button", { name: "Longsword — not equipped" }),
    );
    expect(harness.character.attacks).toHaveLength(baseAttacks + 1);
    expect(harness.character.attacks.at(-1)!.id).toBe(attackId);

    await userEvent.click(
      screen.getByRole("button", { name: "Longsword — equipped" }),
    );
    expect(harness.character.attacks).toHaveLength(baseAttacks);
    // The attack is parked on the item (same id), ready for the next equip.
    expect(weaponItem(harness.character).weapon!.attack.id).toBe(attackId);
  });

  it("removing an equipped weapon takes its attack row with it", async () => {
    const character = withWeaponItem();
    weaponItem(character).equipped = true;
    character.attacks.push(weaponItem(character).weapon!.attack);
    const attackId = weaponItem(character).weapon!.attack.id;
    const harness = renderWithCharacter(<EquipmentDisplay />, { character });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Longsword" }),
    );
    expect(harness.character.equipment.some((i) => i.weapon)).toBe(false);
    expect(harness.character.attacks.some((a) => a.id === attackId)).toBe(
      false,
    );
  });

  // A magic item owns its limited-use ability the same way a weapon owns its
  // attack: the row exists in the Limited-Use list only while the item is
  // active (equipped, and attuned where required).
  const withMagicItem = (attunement?: { attuned: boolean }): Character => {
    const character = aCharacter();
    character.limitedUseAbilities = [];
    character.equipment.push({
      id: randomUUID(),
      text: { title: "Circlet of Blasting", titleFormulas: [] },
      quantity: 1,
      equippable: true,
      equipped: false,
      attunement,
      ability: {
        id: randomUUID(),
        info: { title: "Scorching Ray", titleFormulas: [] },
        maxUses: 1,
        recharge: "Dawn",
        expended: 0,
      },
    });
    return character;
  };
  const magicItem = (c: Character) => c.equipment.find((i) => i.ability)!;

  it("equipping a magic item adds its ability row; unequipping parks it", async () => {
    const character = withMagicItem();
    const abilityId = magicItem(character).ability!.id;
    const harness = renderWithCharacter(<EquipmentDisplay />, { character });

    await userEvent.click(
      screen.getByRole("button", {
        name: "Circlet of Blasting — not equipped",
      }),
    );
    expect(harness.character.limitedUseAbilities).toHaveLength(1);
    expect(harness.character.limitedUseAbilities[0].id).toBe(abilityId);

    await userEvent.click(
      screen.getByRole("button", { name: "Circlet of Blasting — equipped" }),
    );
    expect(harness.character.limitedUseAbilities).toHaveLength(0);
    // Parked on the item, same id, ready for the next equip.
    expect(magicItem(harness.character).ability!.id).toBe(abilityId);
  });

  it("holds an unattuned item's ability back even when equipped", async () => {
    const character = withMagicItem({ attuned: false });
    const harness = renderWithCharacter(<EquipmentDisplay />, { character });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Circlet of Blasting — not equipped",
      }),
    );
    expect(harness.character.limitedUseAbilities).toHaveLength(0);
  });

  it("removing a magic item takes its ability row with it", async () => {
    const character = withMagicItem();
    magicItem(character).equipped = true;
    character.limitedUseAbilities.push(magicItem(character).ability!);
    const harness = renderWithCharacter(<EquipmentDisplay />, { character });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Circlet of Blasting" }),
    );
    expect(harness.character.equipment.some((i) => i.ability)).toBe(false);
    expect(harness.character.limitedUseAbilities).toHaveLength(0);
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

  it("reads the recharge trigger as prose, not as the stored enum value", () => {
    const character = withPools();
    character.limitedUseAbilities.push({
      info: { title: "Bardic Inspiration", titleFormulas: [] },
      maxUses: 3,
      // Homebrew triggers aren't presets and keep whatever case they were given.
      recharge: "Dawn",
      expended: 0,
    });
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, { character });
    expect(screen.getByText("per short rest")).toBeInTheDocument();
    expect(screen.getByText("per long rest")).toBeInTheDocument();
    expect(screen.getByText("per Dawn")).toBeInTheDocument();
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

describe("AbilityActions — Lay on Hands", () => {
  // The one ability whose action lets you choose how much of the pool to spend.
  // Its amount field moved from a raw number input to the shared StepperInput,
  // which commits on blur/Enter rather than per keystroke — so what's worth
  // pinning is that a typed amount is still the one the button spends.
  const paladin = (): Character => {
    const c = aCharacter();
    c.currHp = 20;
    return c;
  };
  const layOnHands = (c: Character) =>
    c.limitedUseAbilities.findIndex((a) => /lay on hands/i.test(a.info.title));

  it("spends the typed amount and heals by it", async () => {
    const character = paladin();
    const i = layOnHands(character);
    expect(i).toBeGreaterThanOrEqual(0);
    const before = character.limitedUseAbilities[i].expended;
    const harness = renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character,
      editMode: false,
    });
    const amount = screen.getByRole("spinbutton", {
      name: "Lay on Hands amount",
    });
    await userEvent.clear(amount);
    await userEvent.type(amount, "7");
    await userEvent.click(
      screen.getByRole("button", { name: "Use Lay on Hands" }),
    );
    expect(harness.character.currHp).toBe(27);
    expect(harness.character.limitedUseAbilities[i].expended).toBe(before + 7);
  });

  it("labels the field so the number isn't a bare box", () => {
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: paladin(),
      editMode: false,
    });
    expect(screen.getByText("Spend")).toBeInTheDocument();
  });

  it("won't let a full-HP character burn the pool", () => {
    const character = aCharacter();
    character.currHp = maxHpValue(character);
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character,
      editMode: false,
    });
    expect(
      screen.getByRole("button", { name: "Use Lay on Hands" }),
    ).toBeDisabled();
  });
});

describe("AbilityActions — condition-applying uses at a table", () => {
  // Stunning Strike's `applies` grant: at a table the row asks whom, and the
  // use reports a `cast` stage carrying the condition *name* — the same wire
  // shape a condition-granting spell sends, so offers and DM apply buttons
  // fall out of the existing fan-out.
  const SELF: Participant = {
    id: "pc:self",
    name: "Brakka",
    characterUuid: randomUUID(),
    initiative: 15,
    spent: { action: false, bonusAction: false, reaction: false },
    conditions: [],
    vitals: { currHp: 20, maxHp: 30, ac: 18 },
  };
  const GOBLIN: Participant = {
    id: "combatant:goblin",
    name: "Goblin 1",
    initiative: 12,
    spent: { action: false, bonusAction: false, reaction: false },
    conditions: [],
    vitals: { currHp: 7, maxHp: 7, ac: 13 },
  };
  const withKi = (): Character => {
    const c = aCharacter();
    c.limitedUseAbilities.push({
      info: { title: "Ki", titleFormulas: [] },
      maxUses: 5,
      recharge: RestType.shortRest,
      expended: 0,
    });
    return c;
  };
  const atTable = (
    character: Character,
    sendReport: ReturnType<typeof vi.fn>,
  ) =>
    renderWithCharacter(
      <EncounterContext.Provider
        value={{
          ...NO_ENCOUNTER,
          encounter: { ...EMPTY_ENCOUNTER, participants: [SELF, GOBLIN] },
          self: SELF,
        }}
      >
        <TableTalkContext.Provider
          value={{ ...NO_TABLE_TALK, reportsEnabled: true, sendReport }}
        >
          <LimitedUseAbilitiesDisplay />
        </TableTalkContext.Provider>
      </EncounterContext.Provider>,
      { character, editMode: false },
    );
  const stunningStrikeButton = () =>
    screen
      .getAllByText("Stunning Strike")
      .find((el) => el.tagName === "BUTTON") as HTMLElement;

  it("asks whom, and reports the use as a cast carrying the condition", async () => {
    const sendReport = vi.fn();
    const harness = atTable(withKi(), sendReport);
    await chooseOption("Who stunning strike targets", GOBLIN.name);
    await userEvent.click(stunningStrikeButton());
    const cast = sendReport.mock.calls
      .map((c) => c[0])
      .find((r) => r.stage === "cast");
    expect(cast).toMatchObject({
      targetId: GOBLIN.id,
      condition: { name: "Stunned", rounds: 1 },
    });
    // The spend still happened — the report is a side channel, not the write.
    const ki = harness.character.limitedUseAbilities.find(
      (a) => a.info.title === "Ki",
    );
    expect(ki?.expended).toBe(1);
  });

  it("still announces an untargeted use, with nowhere to offer it", async () => {
    const sendReport = vi.fn();
    atTable(withKi(), sendReport);
    await userEvent.click(stunningStrikeButton());
    const cast = sendReport.mock.calls
      .map((c) => c[0])
      .find((r) => r.stage === "cast");
    expect(cast.condition.name).toBe("Stunned");
    expect(cast.targetId).toBeUndefined();
  });

  it("offers a save-the-room use the checkbox set, self included", async () => {
    // A Turn-shaped `multi` grant: the same targetIds shape Fireball sends,
    // so per-target offers and DM apply buttons need nothing new. Unlike a
    // strike, a room-wide effect may include your own row.
    const character = aCharacter();
    character.limitedUseAbilities.push({
      // Not "Channel Divinity" — the fixture paladin already owns that pool,
      // and two rows with one accessible name would make the click ambiguous.
      info: { title: "Turning", titleFormulas: [] },
      maxUses: 1,
      recharge: RestType.shortRest,
      expended: 0,
      mechanics: {
        actions: [
          {
            id: "turn-the-unholy",
            name: "Turn the Unholy",
            cost: "action",
            applies: { name: "Turned", rounds: 10, multi: true },
            effects: [
              { effect: "spendUses", amount: { fixed: 1 } },
              { effect: "remind", note: "WIS save or turned." },
            ],
          },
        ],
      },
    });
    const sendReport = vi.fn();
    atTable(character, sendReport);
    await userEvent.click(screen.getByRole("checkbox", { name: "Goblin 1" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Brakka (you)" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Use Turning" }));
    const cast = sendReport.mock.calls
      .map((c) => c[0])
      .find((r) => r.stage === "cast");
    expect(cast).toMatchObject({
      targetIds: [GOBLIN.id, SELF.id],
      condition: { name: "Turned", rounds: 10 },
    });
    expect(cast.targetId).toBeUndefined();
  });

  it("shows no picker solo — there is no row for the condition to land on", () => {
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: withKi(),
      editMode: false,
    });
    expect(
      screen.queryByLabelText("Who stunning strike targets"),
    ).not.toBeInTheDocument();
  });
});

describe("TrackerValue", () => {
  // Current/temp HP and exhaustion are the numbers that move during a fight, so
  // they're edited in place rather than through the field modal. What's worth
  // pinning is that the in-place control writes the same whole-value update the
  // modal did, and that it respects the bounds the rules give it.
  const hp = (character: Character) => (
    <TrackerValue
      cursor={charPath(FIELD.currHp)}
      value={character.currHp}
      name="Current Hit Points"
      decrementLabel="Lose 1 hit point"
      incrementLabel="Gain 1 hit point"
      max={20}
    />
  );

  it("steps down and writes the new value through", async () => {
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    await userEvent.click(
      screen.getByRole("button", { name: "Lose 1 hit point" }),
    );
    expect(harness.character.currHp).toBe(11);
  });

  it("accepts a typed absolute value on Enter", async () => {
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "7{Enter}");
    expect(harness.character.currHp).toBe(7);
  });

  it("commits a typed value on blur", async () => {
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "7");
    await userEvent.tab();
    expect(harness.character.currHp).toBe(7);
  });

  it("doesn't write a value per keystroke", async () => {
    // Typing 15 used to commit 1 and then 15 — two undo entries and two
    // messages to every peer in a live session, with a flicker through a value
    // the player never meant. Nothing is written until the edit is finished.
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "15");
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.character.currHp).toBe(12);

    await userEvent.tab();
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.character.currHp).toBe(15);
  });

  it("never passes through an intermediate value the clamp would stick at", async () => {
    // Against a maximum of 20, typing "25" per keystroke wrote 2, then clamped
    // 25 to 20 — but a slower "5" first would have stuck at 5.
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "25{Enter}");
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.character.currHp).toBe(20);
  });

  it("commits a pending edit before a step button acts on it", async () => {
    // Clicking a step blurs the field first, so the step has to apply to what
    // was just typed rather than to the stale stored value.
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "8");
    await userEvent.click(
      screen.getByRole("button", { name: "Lose 1 hit point" }),
    );
    expect(harness.character.currHp).toBe(7);
  });

  it("abandons the edit on Escape", async () => {
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.type(field, "3{Escape}");
    await userEvent.tab();
    expect(harness.character.currHp).toBe(12);
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it("won't go below zero or above the maximum", async () => {
    const character = aCharacter();
    character.currHp = 0;
    renderWithCharacter(hp(character), { character });
    expect(
      screen.getByRole("button", { name: "Lose 1 hit point" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Gain 1 hit point" }),
    ).toBeEnabled();
  });

  it("caps exhaustion at 6, where the track ends", async () => {
    const character = aCharacter();
    character.exhaustion = MAX_EXHAUSTION;
    renderWithCharacter(
      <TrackerValue
        cursor={charPath(FIELD.exhaustion)}
        value={character.exhaustion}
        name="Exhaustion"
        decrementLabel="Lower exhaustion by 1"
        incrementLabel="Raise exhaustion by 1"
        max={MAX_EXHAUSTION}
      />,
      { character },
    );
    expect(
      screen.getByRole("button", { name: "Raise exhaustion by 1" }),
    ).toBeDisabled();
  });

  it("snaps an abandoned empty field back rather than persisting a zero", async () => {
    const character = aCharacter();
    character.currHp = 12;
    const harness = renderWithCharacter(hp(character), { character });
    const field = screen.getByRole("textbox", { name: "Current Hit Points" });
    await userEvent.clear(field);
    await userEvent.tab();
    expect(harness.character.currHp).toBe(12);
    expect(field).toHaveValue("12");
  });
});

describe("DeathSavesDisplay", () => {
  // Death saves matter at one hit point total: zero. The region keeps its
  // position either way — what's pinned here is that it changes weight, and
  // that it stays usable while dormant (a DM tracking HP elsewhere still needs
  // to tick a failure).
  const at = (currHp: number, successes = 0, failures = 0) => {
    const character = aCharacter();
    character.currHp = currHp;
    character.deathSaves = { successes, failures };
    return character;
  };

  it("is dormant while the character is up", () => {
    const { container } = renderWithCharacter(<DeathSavesDisplay />, {
      character: at(12),
    });
    expect(container.querySelector(".death-saves-dormant")).toBeInTheDocument();
  });

  it("wakes up at zero hit points", () => {
    const { container } = renderWithCharacter(<DeathSavesDisplay />, {
      character: at(0),
    });
    expect(container.querySelector(".death-saves-active")).toBeInTheDocument();
  });

  it("stays awake while saves are recorded, even once healed", () => {
    // Rolled a success, then someone healed them — the set isn't resolved yet,
    // so the tracker shouldn't collapse and lose the marks from view.
    const { container } = renderWithCharacter(<DeathSavesDisplay />, {
      character: at(4, 1, 0),
    });
    expect(container.querySelector(".death-saves-active")).toBeInTheDocument();
  });

  it("records a failure while dormant", async () => {
    const harness = renderWithCharacter(<DeathSavesDisplay />, {
      character: at(12),
    });
    const pips = screen.getAllByRole("button");
    // Three successes then three failures; the fourth pip is the first failure.
    await userEvent.click(pips[3]);
    expect(harness.character.deathSaves.failures).toBe(1);
  });
});

describe("empty sections", () => {
  // A section with nothing in it keeps its place in the reading order but not
  // the height of a box waiting to be written in: a strip in edit mode, gone in
  // play mode where it can't be filled anyway. The paper sheet prints the empty
  // box only because it can't know; the app can.
  const bare = () => {
    const character = aCharacter();
    character.personality = { traits: [], ideals: [], bonds: [], flaws: [] };
    character.senses = {};
    character.limitedUseAbilities = [];
    return character;
  };

  it("collapses an empty text section to a strip in edit mode", () => {
    const { container } = renderWithCharacter(
      <MultiLineTextDisplay
        title="Bonds"
        cursor={charPath(FIELD.personality).k("bonds")}
      />,
      { character: bare() },
    );
    expect(container.querySelector(".section-empty")).toBeInTheDocument();
    // The landmark survives — that's what a paper player navigates by.
    expect(screen.getByText("Bonds")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+" })).toBeInTheDocument();
  });

  it("drops an empty text section entirely in play mode", () => {
    const { container } = renderWithCharacter(
      <MultiLineTextDisplay
        title="Bonds"
        cursor={charPath(FIELD.personality).k("bonds")}
      />,
      { character: bare(), editMode: false },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a section that has content", () => {
    const character = bare();
    character.personality.bonds = [{ title: "My mentor", titleFormulas: [] }];
    const { container } = renderWithCharacter(
      <MultiLineTextDisplay
        title="Bonds"
        cursor={charPath(FIELD.personality).k("bonds")}
      />,
      { character, editMode: false },
    );
    expect(container.querySelector(".section-empty")).not.toBeInTheDocument();
    expect(screen.getByText("My mentor")).toBeInTheDocument();
  });

  it("drops empty senses and limited-use abilities in play mode", () => {
    const senses = renderWithCharacter(<SensesDisplay />, {
      character: bare(),
      editMode: false,
    });
    expect(senses.container).toBeEmptyDOMElement();

    const pools = renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: bare(),
      editMode: false,
    });
    expect(pools.container).toBeEmptyDOMElement();
  });
});

describe("the personality setting", () => {
  // Whether a table plays with personality traits, ideals, bonds and flaws is
  // one question about the group, not four per-section toggles and not a
  // per-character one — so it lives in Game settings and governs both the sheet
  // and the creation wizard (see `builder-steps.test.tsx` for the other half).
  const withTraits = () => {
    const character = aCharacter();
    character.personality = {
      traits: [{ title: "Slow to trust", titleFormulas: [] }],
      ideals: [{ title: "Justice", titleFormulas: [] }],
      bonds: [{ title: "My mentor", titleFormulas: [] }],
      flaws: [{ title: "Vengeful", titleFormulas: [] }],
    };
    return character;
  };

  it("shows all four sections by default", () => {
    renderWithCharacter(<CharacterInfoPanel />, { character: withTraits() });
    for (const label of ["Personality Traits", "Ideals", "Bonds", "Flaws"])
      expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("hides all four when the table doesn't use them", () => {
    renderWithCharacter(<CharacterInfoPanel />, {
      character: withTraits(),
      settings: { trackPersonality: false },
    });
    for (const label of ["Personality Traits", "Ideals", "Bonds", "Flaws"])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it("keeps what was already written — it's hidden, not deleted", () => {
    const character = withTraits();
    const harness = renderWithCharacter(<CharacterInfoPanel />, {
      character,
      settings: { trackPersonality: false },
    });
    expect(screen.queryByText("My mentor")).not.toBeInTheDocument();
    expect(harness.character.personality.bonds).toHaveLength(1);
  });

  it("leaves the rest of the column alone", () => {
    renderWithCharacter(<CharacterInfoPanel />, {
      character: withTraits(),
      settings: { trackPersonality: false },
    });
    expect(screen.getByText("Features & Traits")).toBeInTheDocument();
    expect(screen.getByText("Senses")).toBeInTheDocument();
  });
});
