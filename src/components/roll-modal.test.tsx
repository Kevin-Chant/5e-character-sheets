import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DamageType,
  DieOperation,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import { writeLocalStorage } from "src/lib/local-storage";
import { Character, CustomFormulaWithDamage, SaveEffect } from "src/lib/types";
import { RollSpec } from "src/lib/hooks/use-roller";
import RollModal from "./roll-modal";

// The roll dialog reads the character and the open roll request from context
// and the crit house-rule from settings. The first two are datastore-coupled,
// so they're mocked; settings uses its real provider seeded from localStorage,
// which is the same path the app takes.

const character: Character = (() => {
  const c = structuredClone(defaultCharacter) as Character;
  c.stats.str = 20; // +5
  return c;
})();

const dispatch = vi.fn();
let spec: RollSpec;

vi.mock("src/lib/hooks/use-character", () => ({
  useCharacter: () => ({ character, dispatch }),
}));
vi.mock("src/lib/hooks/use-roller", async (orig) => ({
  ...(await orig<object>()),
  useRoller: () => ({
    request: { label: "Greatsword", spec },
    closeRoller: vi.fn(),
  }),
}));

// 2d6 slashing + STR — a greatsword, so the dice are easy to reason about.
const GREATSWORD: CustomFormulaWithDamage = {
  [DamageType.Slashing]: {
    operation: "addition" as never,
    operands: [[2, StandardDie.d6, DieOperation.roll], StatKey.str],
  } as never,
};

const open = (s: RollSpec, settings: Record<string, unknown> = {}) => {
  spec = s;
  // Through the real helper, so the namespaced key can't drift from the app.
  writeLocalStorage("settings", settings);
  render(
    <SettingsContextProvider>
      <RollModal />
    </SettingsContextProvider>,
  );
};

const total = () => Number(document.querySelector(".roll-total")?.textContent);

beforeEach(() => {
  // Every die rolls its maximum, so totals are exact and assertions can be
  // about *how many* dice were rolled rather than about luck.
  vi.spyOn(Math, "random").mockReturnValue(0.999);
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("RollModal — critical hits", () => {
  it("rolls normal damage with the crit box unticked", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    expect(total()).toBe(2 * 6 + 5); // 2d6 + 5
  });

  it("doubles the dice but not the modifier under RAW", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    await userEvent.click(screen.getByRole("checkbox", { name: /Critical/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Roll Critical Damage" }),
    );
    expect(total()).toBe(4 * 6 + 5); // 4d6 + 5, modifier still once
  });

  it("honours the maxDice house rule", async () => {
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      { criticalDamageMode: "maxDice" },
    );
    expect(
      screen.getByText(/maximize the dice, then roll again/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Critical/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Roll Critical Damage" }),
    );
    // Same ceiling as RAW when every die maxes, but reached differently.
    expect(total()).toBe(4 * 6 + 5);
  });

  it("doubles the modifier too under the total house rule", async () => {
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      { criticalDamageMode: "total" },
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /Critical/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Roll Critical Damage" }),
    );
    expect(total()).toBe((2 * 6 + 5) * 2); // whole sum doubled
  });

  it("ticks itself when the to-hit roll crits", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    const box = screen.getByRole("checkbox", { name: /Critical/ });
    expect(box).not.toBeChecked();
    // Math.random is pinned high, so the d20 lands on 20.
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(box).toBeChecked();
    expect(screen.getByText("Critical Hit")).toBeInTheDocument();
  });
});

describe("RollModal — save-based attacks", () => {
  const save: SaveEffect = {
    dc: 15,
    stat: StatKey.dex,
    onSuccess: "half",
    note: "and is knocked prone",
  };

  it("shows the DC read-only, with no way to roll the save", () => {
    open({ kind: "attack", save, damage: GREATSWORD });
    expect(screen.getByText("DC 15 DEX")).toBeInTheDocument();
    expect(screen.getByText("Half damage on a success")).toBeInTheDocument();
    expect(screen.getByText("and is knocked prone")).toBeInTheDocument();
    // The target's save is the DM's roll — the only roll button here is damage.
    expect(screen.getAllByRole("button", { name: /Roll/ })).toHaveLength(1);
  });

  it("reports both outcomes after rolling damage", async () => {
    open({ kind: "attack", save, damage: GREATSWORD });
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    const full = 2 * 6 + 5;
    expect(
      screen.getByText(
        `Failed save: ${full} — Successful save: ${Math.floor(full / 2)}`,
      ),
    ).toBeInTheDocument();
  });

  it("offers no crit toggle, since there's no attack roll to crit", () => {
    open({ kind: "attack", save, damage: GREATSWORD });
    expect(
      screen.queryByRole("checkbox", { name: /Critical/ }),
    ).not.toBeInTheDocument();
  });
});
