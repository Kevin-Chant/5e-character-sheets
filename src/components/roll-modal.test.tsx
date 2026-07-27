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
import { RollMode, RollModeContextProvider } from "src/lib/hooks/use-roll-mode";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import { writeLocalStorage } from "src/lib/local-storage";
import { Character, CustomFormulaWithDamage, SaveEffect } from "src/lib/types";
import { RollSpec } from "src/lib/hooks/use-roller";
import {
  WEAPON_PRESETS,
  buildAttackFromPreset,
} from "src/lib/data/weapon-presets";
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

const open = (
  s: RollSpec,
  settings: Record<string, unknown> = {},
  rollMode: RollMode = "app",
) => {
  spec = s;
  // Through the real helper, so the namespaced key can't drift from the app.
  writeLocalStorage("settings", settings);
  render(
    <SettingsContextProvider>
      <RollModeContextProvider initialMode={rollMode}>
        <RollModal />
      </RollModeContextProvider>
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

describe("RollModal — weapon conditions", () => {
  // The rider conditions read the attack's tags; these come off the real preset
  // catalog rather than being hand-written, so a change to the SRD data can't
  // quietly make this test assert something the app doesn't do.
  const preset = (name: string) =>
    WEAPON_PRESETS.flatMap((g) => g.options).find((w) => w.name === name)!;
  const longbow = () => buildAttackFromPreset(preset("Longbow"));
  const greatsword = () => buildAttackFromPreset(preset("Greatsword"));

  beforeEach(() => {
    character.features = [{ title: "Archery", titleFormulas: [] }];
  });
  afterEach(() => {
    character.features = [];
  });

  it("folds Archery into the to-hit modifier on a tagged ranged weapon", () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD, attack: longbow() });
    // +2 applied without asking — the whole point of tagging the weapon.
    expect(screen.getByText("d20 +9")).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Archery/ }),
    ).not.toBeInTheDocument();
  });

  it("doesn't offer Archery at all on a melee weapon", () => {
    open({
      kind: "attack",
      toHit: 7,
      damage: GREATSWORD,
      attack: greatsword(),
    });
    expect(screen.getByText("d20 +7")).toBeInTheDocument();
    expect(screen.queryByText(/Archery/)).not.toBeInTheDocument();
  });

  it("falls back to an opt-in tick on an untagged attack", async () => {
    // No `attack` at all — a spell attack, or a sheet whose weapon predates
    // tags. The sheet can't tell, so it asks, exactly as it always did.
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    expect(screen.getByText("d20 +7")).toBeInTheDocument();
    const tick = screen.getByRole("checkbox", { name: /Archery/ });
    await userEvent.click(tick);
    expect(screen.getByText("d20 +9")).toBeInTheDocument();
  });
});

describe("RollModal — real dice (manual mode)", () => {
  it("swaps the roll buttons for type-in entry and does the arithmetic", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD }, {}, "manual");
    // No RNG anywhere: the dice were rolled at the table.
    expect(
      screen.queryByRole("button", { name: "Roll" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Roll.*Damage/ }),
    ).not.toBeInTheDocument();
    // The face, not the total — the app adds the modifier it knows about.
    await userEvent.type(
      screen.getByLabelText("What did the d20 show?"),
      "13{enter}",
    );
    expect(total()).toBe(13 + 7);
  });

  it("calls the crit off the entered face", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD }, {}, "manual");
    await userEvent.type(
      screen.getByLabelText("What did the d20 show?"),
      "20{enter}",
    );
    expect(screen.getByText("Critical Hit")).toBeInTheDocument();
  });

  it("takes the damage total as rolled, extras shown as reminders", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD }, {}, "manual");
    await userEvent.type(screen.getByLabelText("Total damage"), "17{enter}");
    expect(total()).toBe(17);
    // The crit toggle is app-math; with real dice the player already doubled
    // their own dice, so it isn't offered.
    expect(
      screen.queryByRole("checkbox", { name: /Critical/ }),
    ).not.toBeInTheDocument();
  });
});

describe("RollModal — result breakdowns", () => {
  it("names the flat modifier alongside the dice", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    // 2d6 (maxed to 6 each) + STR 5 = 17 — and the +5 is written out, not left
    // for the player to infer from "(6 + 6)".
    expect(screen.getByText(/6 \+ 6 \+ 5/)).toBeInTheDocument();
  });
});
