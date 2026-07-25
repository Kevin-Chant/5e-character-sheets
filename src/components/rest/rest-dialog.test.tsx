import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OfficialClass, RestType } from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import { writeLocalStorage } from "src/lib/local-storage";
import { Character } from "src/lib/types";
import RestDialog from "./rest-dialog";

// The rest panel reads the character from context and the rest variants from
// settings. The character context is datastore-coupled so it's mocked (as in
// the roll dialog's tests); settings uses its real provider seeded from
// localStorage, the same path the app takes.

const dispatch = vi.fn();
let character: Character;

vi.mock("src/lib/hooks/use-character", () => ({
  useCharacter: () => ({ character, dispatch }),
}));

const hurtFighter = (): Character => {
  const c = structuredClone(defaultCharacter) as Character;
  c.class = [{ id: c.class[0].id, name: OfficialClass.Fighter, level: 8 }];
  c.spellcastingClasses = [];
  c.spells = {};
  c.totalHitDice = { d10: 8 };
  c.expendedHitDice = { d10: 2 };
  c.maxHp = 60;
  c.currHp = 25;
  c.tempHp = 0;
  c.exhaustion = 1;
  c.pactSlots = { expended: 0 };
  c.limitedUseAbilities = [
    {
      info: { title: "Second Wind", titleFormulas: [] },
      maxUses: 1,
      recharge: RestType.shortRest,
      expended: 1,
    },
    {
      info: { title: "Action Surge", titleFormulas: [] },
      maxUses: 1,
      recharge: RestType.longRest,
      expended: 1,
    },
  ];
  return c;
};

const renderDialog = () =>
  render(
    <SettingsContextProvider>
      <RestDialog onClose={vi.fn()} />
    </SettingsContextProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  writeLocalStorage("settings", {});
  character = hurtFighter();
  dispatch.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe("RestDialog — the fork", () => {
  it("shows both rests with their durations", async () => {
    renderDialog();
    expect(screen.getByText("Short rest")).toBeTruthy();
    expect(screen.getByText("Long rest")).toBeTruthy();
    expect(screen.getByText("1 hour")).toBeTruthy();
    expect(screen.getByText("8 hours")).toBeTruthy();
  });

  it("advertises spending hit dice, not just the automatic restores", async () => {
    renderDialog();
    // The short rest restores Second Wind *and* offers hit dice — the follow-up
    // is the most useful thing it does, so it has to appear on the card.
    expect(screen.getByText("Spend hit dice to heal")).toBeTruthy();
  });

  it("quotes the table's rest pacing variant", async () => {
    writeLocalStorage("settings", { restVariant: "gritty" });
    renderDialog();
    expect(screen.getByText("8 hours")).toBeTruthy();
    expect(screen.getByText("7 days")).toBeTruthy();
  });

  it("reports current hit points", async () => {
    renderDialog();
    expect(screen.getByText("You're at 25 of 60 hit points.")).toBeTruthy();
  });
});

describe("RestDialog — taking a rest", () => {
  const pick = async (label: string) => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText(label));
    return user;
  };

  it("previews a long rest before committing anything", async () => {
    await pick("Long rest");
    expect(screen.getByText("What changes")).toBeTruthy();
    expect(screen.getByText("Hit points")).toBeTruthy();
    expect(screen.getByText("Full — 25 → 60")).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("names what a short rest won't restore", async () => {
    await pick("Short rest");
    expect(screen.getByText("Stays spent")).toBeTruthy();
    expect(screen.getByText("Action Surge")).toBeTruthy();
  });

  it("commits the whole rest as one undoable action", async () => {
    const user = await pick("Long rest");
    await user.click(screen.getByText("Take rest"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("replace_character");
    expect(action.payload.currHp).toBe(60);
    expect(action.payload.exhaustion).toBe(0);
    expect(action.payload.expendedHitDice.d10).toBe(0);
    expect(action.payload.limitedUseAbilities[0].expended).toBe(0);
    expect(action.payload.limitedUseAbilities[1].expended).toBe(0);
  });

  it("turns the forecast into a receipt", async () => {
    const user = await pick("Long rest");
    await user.click(screen.getByText("Take rest"));
    expect(screen.getByText("Long rest taken")).toBeTruthy();
    expect(screen.getByText("What changed")).toBeTruthy();
  });
});

describe("RestDialog — spending hit dice", () => {
  it("rolls a die and applies the healing", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Short rest"));
    await user.click(screen.getByText("Take rest"));
    dispatch.mockClear();

    // Max the die so the healing is predictable: 10 + CON.
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    await user.click(
      screen.getByRole("button", { name: /Roll a d10 hit die/ }),
    );

    // One update raises HP, the other marks the die spent.
    expect(dispatch).toHaveBeenCalledTimes(2);
    const [hp, dice] = dispatch.mock.calls.map((call) => call[0]);
    expect(hp.type).toBe("update_currHp");
    expect(hp.payload.value).toBeGreaterThan(character.currHp);
    expect(dice.type).toBe("update_expendedHitDice");
    expect(dice.payload.value).toBe(3);
  });

  it("offers no tray once hit points are full", async () => {
    character = { ...hurtFighter(), currHp: 60 };
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Short rest"));
    await user.click(screen.getByText("Take rest"));
    expect(screen.queryByText("Spend hit dice")).toBeNull();
  });
});
