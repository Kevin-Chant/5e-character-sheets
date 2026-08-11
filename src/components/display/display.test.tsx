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

describe("CoinsDisplay", () => {
  it("shows every denomination as a field in edit mode", () => {
    renderWithCharacter(<CoinsDisplay />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(5);
  });

  it("collapses to the coins actually held in play mode", () => {
    renderWithCharacter(<CoinsDisplay />, { editMode: false });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("PP")).toBeInTheDocument();
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
    expect(harness.character.coins[CoinType.PP]).toBe(4);
  });

  it("writes once when the edit finishes, not once per digit", async () => {
    const harness = renderWithCharacter(<CoinsDisplay />);
    const gp = screen.getAllByRole("spinbutton")[1];
    await userEvent.clear(gp);
    await userEvent.type(gp, "150");
    expect(harness.dispatch).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.character.coins[CoinType.GP]).toBe(150);
  });

  it("reverts a cleared field rather than storing zero or NaN", async () => {
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
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
    expect(c.disabled).toBe(false);
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
  // jsdom has no layout, so pin the cause directly: the label must render as
  // phrasing content (not a block-wrapping div) for the comma to sit beside it.
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
    expect(screen.getByText("8 / 12")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Spend a use" }));
    expect(harness.character.limitedUseAbilities[1].expended).toBe(5);
  });

  it("drops the edit and remove affordances in play mode", () => {
    renderWithCharacter(<LimitedUseAbilitiesDisplay />, {
      character: withPools(),
      editMode: false,
    });
    expect(screen.getByText("8 / 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spend a use" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
  });

  it("reads the recharge trigger as prose, not as the stored enum value", () => {
    const character = withPools();
    character.limitedUseAbilities.push({
      info: { title: "Bardic Inspiration", titleFormulas: [] },
      maxUses: 3,
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
    const character = aCharacter();
    character.limitedUseAbilities.push({
      // Not "Channel Divinity" — the fixture paladin already owns that pool, which would collide.
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
    // Pips 0-2 are successes, 3-5 are failures.
    await userEvent.click(pips[3]);
    expect(harness.character.deathSaves.failures).toBe(1);
  });
});

describe("empty sections", () => {
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
