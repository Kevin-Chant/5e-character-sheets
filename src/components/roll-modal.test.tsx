// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DamageType,
  DieOperation,
  OfficialClass,
  StandardDie,
  StatKey,
} from "src/lib/data/data-definitions";
import { defaultCharacter } from "src/lib/data/default-data";
import { RollMode, RollModeContextProvider } from "src/lib/hooks/use-roll-mode";
import { SettingsContextProvider } from "src/lib/hooks/use-settings";
import { writeLocalStorage } from "src/lib/local-storage";
import {
  Character,
  CustomFormulaWithDamage,
  LimitedUseAbility,
  SaveEffect,
} from "src/lib/types";
import { syncClassPools } from "src/lib/builder/class-pools";
import { randomUUID } from "src/lib/browser";
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
// Set by the one test that opens the dialog onto an exchange with attempts
// already sent under it (a roll call answered a second time).
let requestAttemptBase: number | undefined;
// Stable, because it doubles as the exchange id every roll in the dialog is
// reported under.
const EXCHANGE = "exchange-1";

vi.mock("src/lib/hooks/use-character", () => ({
  useCharacter: () => ({ character, dispatch }),
}));
vi.mock("src/lib/hooks/use-roller", async (orig) => ({
  ...(await orig<object>()),
  useRoller: () => ({
    request: {
      id: EXCHANGE,
      label: "Greatsword",
      spec,
      attemptBase: requestAttemptBase,
    },
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
  requestAttemptBase = undefined;
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
  // catalog rather than being hand-written, so a change to the catalog data can't
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

// A feature invoked *on a hit* (a Rune Knight's Fire Rune) is a rider here, not
// a button in the abilities panel: its dice ride the weapon's damage roll, and
// the use it costs is spent afterwards by its own button — so a re-roll is free.
describe("RollModal — a pool-powered extra", () => {
  const fireRune = (): LimitedUseAbility => {
    const c = structuredClone(defaultCharacter) as Character;
    c.limitedUseAbilities = [];
    c.features = [
      { title: "Fire Rune", titleFormulas: [], detail: "", detailFormulas: [] },
    ];
    const fighter = {
      id: randomUUID(),
      name: OfficialClass.Fighter,
      level: 3,
      subclass: "Rune Knight",
    };
    syncClassPools(c, fighter);
    return c.limitedUseAbilities.find((a) => a.info.title === "Fire Rune")!;
  };

  beforeEach(() => {
    character.limitedUseAbilities = [fireRune()];
  });
  afterEach(() => {
    character.limitedUseAbilities = [];
  });

  it("rolls the rune's dice with the weapon's, and spends nothing until asked", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    const tick = screen.getByRole("checkbox", { name: /Fire Rune/ });
    // Labelled with what the pool has left, so the cost is visible before it's paid.
    expect(tick).toHaveAccessibleName(/1 use left/);
    await userEvent.click(tick);
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    // 2d6 + STR 5 for the greatsword, plus the rune's 2d6 fire — one roll.
    expect(total()).toBe(17 + 12);
    expect(screen.getByText(/\+12 Fire — Fire Rune/)).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Spend a use of Fire Rune" }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: "update_limitedUseAbilities",
      subField: "0.expended",
      payload: { value: 1 },
    });
    expect(screen.getByText("Fire Rune use spent")).toBeInTheDocument();
  });

  it("can't be ticked once the rune is spent out", () => {
    character.limitedUseAbilities[0].expended = 1;
    open({ kind: "attack", toHit: 7, damage: GREATSWORD });
    const tick = screen.getByRole("checkbox", { name: /Fire Rune/ });
    expect(tick).toBeDisabled();
    expect(tick).toHaveAccessibleName(/0 uses left/);
  });

  it("is a reminder with a spend button when the dice are real", async () => {
    open({ kind: "attack", toHit: 7, damage: GREATSWORD }, {}, "manual");
    expect(
      screen.getByText(/costs a use of Fire Rune \(1 left\)/),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Total damage"), "29{enter}");
    // No checkbox to tick with real dice, so the commit is offered outright.
    await userEvent.click(
      screen.getByRole("button", { name: "Spend a use of Fire Rune" }),
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
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
    // …and the damage half says so too — as a reminder naming the table's
    // crit flavor, never a checkbox (the entered total is the authority).
    expect(
      screen.getByText(/Critical hit — double the damage dice — apply it/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Critical/ }),
    ).not.toBeInTheDocument();
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

// Save-based spells: the catalog's `resolution: {kind: "save"}` has to reach
// the dialog as a DC (it used to be dropped entirely), targeting is a set
// rather than a pick, and a spell with no dice at all still crosses the wire
// as an announced cast.
describe("RollModal — save-based spells", () => {
  const spellBase = {
    spellcastingClass: randomUUID() as never,
  };
  const FIREBALL = {
    ...spellBase,
    info: { title: "Fireball", titleFormulas: [] },
    mechanics: {
      level: 3,
      resolution: { kind: "save", ability: StatKey.dex, halfOnSuccess: true },
      damage: [
        {
          damageType: DamageType.Fire,
          formula: [8, StandardDie.d6, DieOperation.roll],
        },
      ],
    },
  } as never;
  const HIDEOUS = {
    ...spellBase,
    info: { title: "Hideous Laughter", titleFormulas: [] },
    mechanics: {
      level: 1,
      resolution: { kind: "save", ability: StatKey.wis },
    },
  } as never;
  const GOBLIN: Participant = {
    id: "combatant:goblin",
    name: "Goblin 1",
    initiative: 12,
    spent: { action: false, bonusAction: false, reaction: false },
    conditions: [],
    vitals: { currHp: 7, maxHp: 7, ac: 13 },
  };
  const ORC: Participant = { ...GOBLIN, id: "combatant:orc", name: "Orc 1" };

  it("shows the save DC a spell's catalog resolution implies", () => {
    open({ kind: "attack", spell: FIREBALL });
    expect(screen.getByText("Saving Throw")).toBeInTheDocument();
    // 8 + PB 4 (level 12) + INT 0 (no spellcasting entry falls back to the
    // ability) — the point is the number exists at all; it used to be absent.
    expect(screen.getByText(/DC 12/)).toBeInTheDocument();
    expect(screen.getByText(/Half damage on a success/)).toBeInTheDocument();
  });

  it("targets a set, not a pick, and announces a diceless cast at them", async () => {
    const sendReport = vi.fn();
    open(
      { kind: "attack", spell: HIDEOUS },
      {},
      "app",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN, ORC] } },
      { reportsEnabled: true, sendReport, rememberTarget: vi.fn() },
    );
    // No dice on this side of the screen: no roll button, an announce instead,
    // gated on aiming it at someone.
    const announce = screen.getByRole("button", { name: "Announce cast" });
    expect(announce).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Goblin 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Orc 1" }));
    await userEvent.click(announce);
    expect(sendReport).toHaveBeenCalledTimes(1);
    const report = sendReport.mock.calls[0][0] as OutgoingRoll;
    expect(report.stage).toBe("cast");
    expect(report.targetIds).toEqual([GOBLIN.id, ORC.id]);
    // The DC rides along; no onSuccess clause, because there's no damage for
    // a successful save to scale.
    expect(report.save).toEqual({ dc: 12, stat: StatKey.wis });
  });

  it("groups the single-target picker by side", () => {
    const ALLY: Participant = {
      ...ORC,
      id: "pc:ally",
      name: "Maelina",
      characterUuid: randomUUID(),
    };
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      {},
      "app",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN, ALLY] } },
      { reportsEnabled: true, sendReport: vi.fn(), rememberTarget: vi.fn() },
    );
    const enemies = screen.getByRole("group", { name: "Enemies" });
    const party = screen.getByRole("group", { name: "Party" });
    expect(enemies).toContainElement(
      screen.getByRole("option", { name: "Goblin 1" }),
    );
    expect(party).toContainElement(
      screen.getByRole("option", { name: "Maelina" }),
    );
  });
});

// The self-directed rolls: a hit die reports itself (the HP change reaches
// the DM as a bare projection write — this is the "why" beside it), a heal
// may target yourself, and a plain check must not inherit the target of your
// last attack.
describe("RollModal — self-directed rolls at a table", () => {
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
  const CURE = {
    spellcastingClass: randomUUID() as never,
    info: { title: "Cure Wounds", titleFormulas: [] },
    mechanics: {
      level: 1,
      resolution: { kind: "auto" },
      healing: {
        operation: "addition",
        operands: [[1, StandardDie.d8, DieOperation.roll]],
      },
    },
  } as never;

  it("reports a hit-die spend as untargeted healing", async () => {
    const sendReport = vi.fn();
    open(
      { kind: "hitDie", die: StandardDie.d10 },
      {},
      "manual",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [SELF, GOBLIN] } },
      {
        reportsEnabled: true,
        sendReport,
        // The goblin from the last swing must not be inherited by a self-heal.
        lastTargetId: GOBLIN.id,
        rememberTarget: vi.fn(),
      },
    );
    await userEvent.type(
      screen.getByLabelText("Total rolled, modifiers included"),
      "9{enter}",
    );
    expect(sendReport).toHaveBeenCalledTimes(1);
    const report = sendReport.mock.calls[0][0] as OutgoingRoll;
    expect(report.stage).toBe("healing");
    expect(report.total).toBe(9);
    expect(report.manual).toBe(true);
    expect(report.targetId).toBeUndefined();
  });

  it("does not stamp a plain check with the last attack's target", async () => {
    const sendReport = vi.fn();
    open(
      { kind: "check", modifier: 3 },
      {},
      "app",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN] } },
      {
        reportsEnabled: true,
        sendReport,
        lastTargetId: GOBLIN.id,
        rememberTarget: vi.fn(),
      },
    );
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(sendReport.mock.calls[0][0].targetId).toBeUndefined();
  });

  it("offers yourself as a healing target, marked and first", () => {
    open(
      { kind: "attack", spell: CURE },
      {},
      "app",
      {
        encounter: { ...EMPTY_ENCOUNTER, participants: [SELF, GOBLIN] },
        self: SELF,
      },
      { reportsEnabled: true, sendReport: vi.fn(), rememberTarget: vi.fn() },
    );
    const you = screen.getByRole("option", { name: "Brakka (you)" });
    expect(screen.getByRole("group", { name: "Party" })).toContainElement(you);
  });
});

// Cast conditions: a spell with nothing to roll and no save (Bless) still
// announces, names the condition it applies, and — once the bearer accepts —
// the condition's wired riders reach their d20s from the bundled catalog.
describe("RollModal — cast conditions", () => {
  const SELF: Participant = {
    id: "pc:self",
    name: "Ellora",
    characterUuid: randomUUID(),
    initiative: 15,
    spent: { action: false, bonusAction: false, reaction: false },
    conditions: [],
    vitals: { currHp: 20, maxHp: 30, ac: 18 },
  };
  const ALLY: Participant = {
    ...SELF,
    id: "pc:ally",
    name: "Brakka",
    characterUuid: randomUUID(),
  };
  const BLESS = {
    spellcastingClass: randomUUID() as never,
    info: { title: "Bless", titleFormulas: [] },
  } as never;

  it("announces a save-less buff at its set of targets, condition riding along", async () => {
    const sendReport = vi.fn();
    open(
      { kind: "attack", spell: BLESS },
      {},
      "app",
      {
        encounter: { ...EMPTY_ENCOUNTER, participants: [SELF, ALLY] },
        self: SELF,
      },
      { reportsEnabled: true, sendReport, rememberTarget: vi.fn() },
    );
    // The dialog says what the cast applies…
    expect(
      screen.getByText(/attack rolls and saving throws/),
    ).toBeInTheDocument();
    // …and yourself is a valid target of your own buff.
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Ellora (you)" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Brakka" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Announce cast" }),
    );
    const report = sendReport.mock.calls[0][0] as OutgoingRoll;
    expect(report.stage).toBe("cast");
    expect(report.condition).toEqual({ name: "Bless", rounds: 10 });
    expect(report.targetIds).toEqual([SELF.id, ALLY.id]);
  });

  it("rolls the blessing d4 into a saving throw on its own", async () => {
    open({ kind: "check", modifier: 3, save: true }, {}, "app", {
      selfConditions: ["Bless"],
    });
    // No tick needed: saves are exactly what Bless touches, and the roll
    // kinds can say so now.
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    // Math.random pinned high: d20 = 20, d4 = 4 → 20 + 3 + 4.
    expect(total()).toBe(27);
    expect(screen.getByText(/\+4 — Bless \(d4: 4\)/)).toBeInTheDocument();
  });

  it("cashes out a mark on the chosen target, for its caster only", async () => {
    const HEXER: Participant = {
      id: "pc:hexer",
      name: "Ellora",
      characterUuid: randomUUID(),
      initiative: 15,
      spent: { action: false, bonusAction: false, reaction: false },
      conditions: [],
      vitals: { currHp: 20, maxHp: 30, ac: 18 },
    };
    const HEXED: Participant = {
      id: "combatant:goblin",
      name: "Goblin 1",
      initiative: 12,
      spent: { action: false, bonusAction: false, reaction: false },
      conditions: [{ name: "Hex", from: HEXER.id }],
      vitals: { currHp: 7, maxHp: 7, ac: 13 },
    };
    const at = (self: Participant) =>
      open(
        { kind: "attack", toHit: 7, damage: GREATSWORD },
        {},
        "app",
        {
          encounter: { ...EMPTY_ENCOUNTER, participants: [HEXER, HEXED] },
          self,
        },
        {
          reportsEnabled: true,
          sendReport: vi.fn(),
          rememberTarget: vi.fn(),
          lastTargetId: HEXED.id,
        },
      );
    // The hexer swings: the d6 rides, itemised with its source.
    at(HEXER);
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    expect(total()).toBe(2 * 6 + 5 + 6);
    expect(screen.getByText(/\+6 Necrotic — Hex/)).toBeInTheDocument();
    cleanup();
    // Someone else swings at the same goblin: the mark isn't theirs.
    at({ ...HEXER, id: "pc:other", name: "Brakka" });
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    expect(total()).toBe(2 * 6 + 5);
  });

  it("notes the target's state on the to-hit roll", () => {
    const SELF: Participant = {
      id: "pc:self",
      name: "Brakka",
      characterUuid: randomUUID(),
      initiative: 15,
      spent: { action: false, bonusAction: false, reaction: false },
      conditions: [],
    };
    const DOWNED: Participant = {
      id: "combatant:orc",
      name: "Orc 1",
      initiative: 9,
      spent: { action: false, bonusAction: false, reaction: false },
      conditions: [{ name: "Prone" }],
      vitals: { currHp: 3, maxHp: 15, ac: 13 },
    };
    open(
      { kind: "attack", toHit: 7, damage: GREATSWORD },
      {},
      "app",
      {
        encounter: { ...EMPTY_ENCOUNTER, participants: [SELF, DOWNED] },
        self: SELF,
      },
      {
        reportsEnabled: true,
        sendReport: vi.fn(),
        rememberTarget: vi.fn(),
        lastTargetId: DOWNED.id,
      },
    );
    expect(
      screen.getByText(/Target prone: Melee attacks from within 5 feet/),
    ).toBeInTheDocument();
  });

  it("rides a bearer's damage-side condition onto a weapon hit", async () => {
    // Divine Favor: +1d4 radiant on the bearer's weapon damage, auto-applied.
    open({ kind: "attack", toHit: 7, damage: GREATSWORD }, {}, "app", {
      selfConditions: ["Divine Favor"],
    });
    await userEvent.click(screen.getByRole("button", { name: "Roll Damage" }));
    // 2d6 (maxed) + STR 5, plus the maxed d4.
    expect(total()).toBe(2 * 6 + 5 + 4);
    expect(screen.getByText(/\+4 Radiant — Divine Favor/)).toBeInTheDocument();
  });

  it("keeps the d4 off an ability check entirely", async () => {
    open({ kind: "check", modifier: 3 }, {}, "app", {
      selfConditions: ["Bless"],
    });
    expect(
      screen.queryByRole("checkbox", { name: /Bless/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(total()).toBe(23);
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

  it("numbers on from attempts sent before the dialog opened", async () => {
    // A roll call answered a second time: the prompt re-opens the dialog onto
    // the call's exchange with the attempts already sent under it, and the new
    // roll must not claim to be an innocent first.
    requestAttemptBase = 2;
    sendReport = vi.fn();
    open(
      { kind: "check", modifier: 3 },
      {},
      "app",
      { encounter: { ...EMPTY_ENCOUNTER, participants: [GOBLIN] } },
      { reportsEnabled: true, sendReport, rememberTarget: vi.fn() },
    );
    await userEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(reports().map((r) => r.attempt)).toEqual([3]);
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
