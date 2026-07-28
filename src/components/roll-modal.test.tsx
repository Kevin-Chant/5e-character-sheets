// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
import {
  EncounterContext,
  EncounterContextData,
  NO_ENCOUNTER,
} from "src/lib/hooks/use-encounter";
import {
  NO_TABLE_TALK,
  TableTalkContext,
  TableTalkData,
} from "src/lib/hooks/use-table-talk";
import { EMPTY_ENCOUNTER, Participant } from "src/lib/play/encounter";
import { OutgoingRoll } from "src/lib/play/reports";
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
// Stable, because it doubles as the exchange id every roll in the dialog is
// reported under.
const EXCHANGE = "exchange-1";

vi.mock("src/lib/hooks/use-character", () => ({
  useCharacter: () => ({ character, dispatch }),
}));
vi.mock("src/lib/hooks/use-roller", async (orig) => ({
  ...(await orig<object>()),
  useRoller: () => ({
    request: { id: EXCHANGE, label: "Greatsword", spec },
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
  // The table, when there is one. Solo (the default) nothing is reported and
  // no target is asked for, which is the shape most of this file tests.
  // Two contexts because they answer two questions: who is in the fight
  // (`encounter`), and what is being said about it (`talk`).
  encounter?: Partial<EncounterContextData>,
  talk?: Partial<TableTalkData>,
) => {
  spec = s;
  // Through the real helper, so the namespaced key can't drift from the app.
  writeLocalStorage("settings", settings);
  render(
    <SettingsContextProvider>
      <RollModeContextProvider initialMode={rollMode}>
        <EncounterContext.Provider value={{ ...NO_ENCOUNTER, ...encounter }}>
          <TableTalkContext.Provider value={{ ...NO_TABLE_TALK, ...talk }}>
            <RollModal />
          </TableTalkContext.Provider>
        </EncounterContext.Provider>
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

// An attack at a table is a small conversation, and the dialog now holds it:
// the target is named before the dice, and each stage travels to the seat as
// it lands. What these pin is invisible here — it shows up on a DM board this
// test doesn't render — so they assert on the courier.
describe("RollModal — reporting to the table", () => {
  const GOBLIN: Participant = {
    id: "combatant:goblin",
    name: "Goblin 2",
    initiative: 12,
    spent: { action: false, bonusAction: false, reaction: false },
    conditions: [],
    vitals: { currHp: 7, maxHp: 7, ac: 13 },
  };

  let sendReport: ReturnType<typeof vi.fn>;
  let rememberTarget: ReturnType<typeof vi.fn>;

  const atTable = (over: Partial<TableTalkData> = {}) => {
    sendReport = vi.fn();
    rememberTarget = vi.fn();
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      {},
      "app",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN] } },
      { reportsEnabled: true, sendReport, rememberTarget, ...over },
    );
  };
  const reports = () => sendReport.mock.calls.map((c) => c[0] as OutgoingRoll);
  const target = () => screen.getByLabelText("Who you are attacking");
  const aim = () => userEvent.selectOptions(target(), GOBLIN.id);
  const toHit = () =>
    userEvent.click(screen.getByRole("button", { name: "Roll" }));
  const damage = () =>
    userEvent.click(screen.getByRole("button", { name: /Roll.*Damage/ }));

  it("asks who the attack is aimed at, before any dice", () => {
    atTable();
    expect(target()).toBeInTheDocument();
  });

  it("asks nothing when there is no table to tell", () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    expect(
      screen.queryByLabelText("Who you are attacking"),
    ).not.toBeInTheDocument();
  });

  it("sends the to-hit roll as it lands, addressed and with its faces", async () => {
    atTable();
    await aim();
    await toHit();
    const [report] = reports();
    expect(report.stage).toBe("toHit");
    expect(report.targetId).toBe(GOBLIN.id);
    expect(report.attempt).toBe(1);
    expect(report.faces).toEqual([20]);
    expect(report.critical).toBe(true);
  });

  it("carries the same target and exchange into the damage roll", async () => {
    atTable();
    await aim();
    await toHit();
    await damage();
    const [, dmg] = reports();
    expect(dmg.stage).toBe("damage");
    expect(dmg.targetId).toBe(GOBLIN.id);
    expect(dmg.exchangeId).toBe(EXCHANGE);
    // Itemised by type: the DM rules resistance, and can't from a lump sum.
    expect(dmg.parts?.[0].damageType).toBe(DamageType.Slashing);
  });

  it("numbers a re-roll rather than blocking it", async () => {
    atTable();
    await aim();
    await toHit();
    await toHit();
    expect(reports().map((r) => r.attempt)).toEqual([1, 2]);
  });

  it("holds a roll made before a target is named, then sends its true attempt", async () => {
    atTable();
    // Rolling first and picking after would otherwise be the way to make a bad
    // roll disappear — only the last would ever be seen, as an innocent first.
    await toHit();
    await toHit();
    await toHit();
    expect(sendReport).not.toHaveBeenCalled();
    await aim();
    expect(reports()).toHaveLength(1);
    expect(reports()[0].attempt).toBe(3);
    expect(reports()[0].targetId).toBe(GOBLIN.id);
  });

  it("remembers the target, and opens on it next time", async () => {
    atTable();
    await aim();
    expect(rememberTarget).toHaveBeenCalledWith(GOBLIN.id);
    cleanup();
    atTable({ lastTargetId: GOBLIN.id });
    expect((target() as HTMLSelectElement).value).toBe(GOBLIN.id);
  });

  it("shows the DM's ruling under the roll it answers", () => {
    atTable({ verdicts: { [EXCHANGE]: "miss" } });
    expect(screen.getByText(/that misses/)).toBeInTheDocument();
  });

  it("marks a typed total as asserted rather than rolled", async () => {
    sendReport = vi.fn();
    rememberTarget = vi.fn();
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      {},
      "manual",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN] } },
      { reportsEnabled: true, sendReport, rememberTarget },
    );
    await aim();
    await userEvent.type(
      screen.getByLabelText("What did the d20 show?"),
      "13{enter}",
    );
    expect(reports()[0].manual).toBe(true);
    expect(reports()[0].total).toBe(20);
  });
});
