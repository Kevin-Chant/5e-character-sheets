// Drives several real browsers through the session flows against a running
// dev server + sidecar, and asserts what converges. Covers gapi/WAMP-bound
// paths that jsdom can't reach.
//
//   pnpm session-smoke                 # all scenarios
//   pnpm session-smoke --only gameplay # one scenario
//   pnpm session-smoke --headed --slow 200
//
// Requires `pnpm dev` and `pnpm server` to be running.
//
// Flags:
//   --base <url>      dev server (default http://localhost:3000)
//   --sidecar <url>   the live-edit sidecar to point every client at
//                     (default http://localhost:9000 — never the cloud one)
//   --only <name>     run one scenario: gameplay | editing | reload | dmboard |
//                     pickup | assign | initiative | damage | table | rejoin |
//                     multisession |
//                     dmreturn | dropout | tabledropout | deploy | invite
//   --headed          show the browsers
//   --slow <ms>       slow motion, for watching a failure happen
//   --timeout <ms>    per-condition wait budget (default 15000)
//   --shots <dir>     write a PNG per client at the end
//
// House rule: never sleep, always wait for a named condition, so a failure
// says which step didn't happen.
import { readFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(root, "src/lib/fixtures");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const BASE = flag("base", "http://localhost:3000");
// Pinned rather than left to inherit: the app's default sharing host is the
// cloud sidecar, and stored settings beat env, so this is what keeps a run
// off production.
const SIDECAR = flag("sidecar", "http://localhost:9000");
const TIMEOUT = Number(flag("timeout", 15000));
const SHOTS = flag("shots", undefined);
const ONLY = flag("only", undefined);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`,
  );
};

// --- Waiting -----------------------------------------------------------------

// Poll a page-side predicate until it holds.
async function until(page, description, fn, arg) {
  try {
    await page.waitForFunction(fn, arg, { timeout: TIMEOUT, polling: 100 });
  } catch {
    throw new Error(`timed out waiting for: ${description}`);
  }
}

const untilVisible = (page, selector) =>
  page.waitForSelector(selector, { state: "visible", timeout: TIMEOUT });

const untilPath = (page, path) =>
  until(page, `url ${path}`, (p) => window.location.pathname === p, path);

const untilBoard = (page) =>
  until(
    page,
    "url /play",
    () => window.location.pathname.startsWith("/play"),
    null,
  );

const untilText = (page, text) =>
  until(
    page,
    `text "${text}"`,
    (t) => document.body.innerText.includes(t),
    text,
  );

// The primary button of one named prompt. The play surface can stack several
// prompts at once, so `.btn-primary` alone is ambiguous — match on the
// prompt's own text instead.
const prompt = (page, text) =>
  page.locator(".assign-prompt", { hasText: text }).locator(".btn-primary");

const untilRoster = (page, names) =>
  until(
    page,
    `roster ${JSON.stringify(names)}`,
    (expected) => {
      // Player roster = rail pills; DM roster = board rows.
      const found = [
        ...document.querySelectorAll(".initiative-name, .dm-row-name"),
      ]
        .map((n) => n.textContent.trim())
        .sort();
      return JSON.stringify(found) === JSON.stringify(expected);
    },
    [...names].sort(),
  );

const roster = (page) =>
  page
    .locator(".initiative-name, .dm-row-name")
    .allTextContents()
    .then((n) => n.map((s) => s.trim()).sort());

// HP renders as text ("47/ 56"), not an input value; parseInt stops at the slash.
const HP_TOTAL = ".play-hp-numbers .hp-total";
const readHp = (page) =>
  page
    .locator(HP_TOTAL)
    .textContent()
    .then((t) => Number.parseInt(t, 10));

// Both selector and target travel in `arg` — the predicate is serialised into
// the page and can't close over Node-side values.
const untilHp = (page, expected) =>
  until(
    page,
    `own HP to reach ${expected}`,
    ({ sel, want }) =>
      Number.parseInt(document.querySelector(sel)?.textContent, 10) === want,
    { sel: HP_TOTAL, want: expected },
  );

// Same delta box the DM's row uses: a bare number damages, a leading + heals.
async function ownDelta(page, entry) {
  const box = page.locator(".play-vitals .vitals-amount");
  await box.fill(entry);
  await box.press("Enter");
}

// Click the HP figure to reveal the edit-to-set input, then type into it.
async function setHp(page, value) {
  await page.click(HP_TOTAL);
  const input = page.locator(".hp-total-input");
  await input.fill(String(value));
  await input.press("Enter");
}

// --- Clients -----------------------------------------------------------------

// The app's `<Select>` is a button that opens a portalled listbox, so
// Playwright's `selectOption` has nothing to talk to.
async function choose(page, selectLabel, optionLabel) {
  await page.click(`button[aria-label="${selectLabel}"]`);
  await page
    .locator('[role="listbox"] [role="option"]', { hasText: optionLabel })
    .first()
    .click();
}

// Per-campaign controls (offer a sheet, hand it over, the invite, the seat)
// live in the Table settings modal now, not on the roster rows.
async function inTableSettings(page, act) {
  await page.click('button:has-text("Table settings")');
  await untilVisible(page, ".table-settings");
  await act();
  await page.click('.table-settings button[aria-label="Close"]');
}

// The three room-wide calls fold under one disclosure.
async function openAsks(page) {
  const panel = page.locator(".dm-asks-panel");
  if (await panel.isVisible()) return;
  await page.click('button:has-text("Ask the table")');
  await untilVisible(page, ".dm-asks-panel");
}

async function openClient(browser, fixture, label, extraFixtures = [], mutate) {
  const load = (name) =>
    JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
  const character = load(fixture);
  mutate?.(character);
  const stored = Object.fromEntries(
    [character, ...extraFixtures.map(load)].map((c) => [c.uuid, c]),
  );
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ({ chars, sidecar }) => {
      localStorage.setItem("dndcharactersheets_characters", chars);
      localStorage.setItem("dndcharactersheets_lastDatastore", '"local"');
      localStorage.setItem(
        "dndcharactersheets_settings",
        JSON.stringify({ liveEditHost: sidecar }),
      );
    },
    { chars: JSON.stringify(stored), sidecar: SIDECAR },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    failures += 1;
    console.log(`  ✗ [${label}] page crashed: ${e.message}`);
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await untilVisible(page, '[aria-label="Session code or invite link"]');
  return { page, character, label, name: character.name };
}

// Start a game, optionally bringing sheets. Resolves once on /play with a
// session code in hand.
async function startGame(client, bring = []) {
  await untilVisible(client.page, "text=Run a game");
  await client.page.click("text=Run a game");
  await untilPath(client.page, "/host");
  await untilVisible(client.page, ".lobby");
  for (const name of bring) {
    await client.page
      .locator(".lobby-characters label", { hasText: name })
      .click();
  }
  await client.page.click(".lobby-actions .btn-primary");
  await untilBoard(client.page);
  await untilVisible(client.page, ".session-code code");
  return (await client.page.locator(".session-code code").textContent()).trim();
}

// Join a game by code, optionally as one of your sheets, or sheetless with a
// table name.
async function joinGame(client, code, playAs, tableName) {
  await untilVisible(client.page, '[aria-label="Session code or invite link"]');
  await client.page.fill('[aria-label="Session code or invite link"]', code);
  await client.page.click('.home-join button[type="submit"]');
  await untilVisible(client.page, ".lobby");
  if (playAs) {
    const wanted = client.page.locator(".lobby-characters label", {
      hasText: playAs,
    });
    if (!(await wanted.locator("input:checked").count())) await wanted.click();
  } else if (tableName) {
    await client.page.fill('[aria-label="Your name at the table"]', tableName);
  }
  await client.page.click(".lobby-actions .btn-primary");
  await untilBoard(client.page);
}

// --- Scenarios ---------------------------------------------------------------

const scenarios = {
  // DM starts a table bringing their own sheet; a player joins with theirs.
  async gameplay(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);
    check("code is a uuid", /^[0-9a-f-]{36}$/.test(code), true);
    check(
      "starting a game takes the DM seat",
      await dm.page.locator("text=Release DM seat").count(),
      1,
    );

    await joinGame(player, code, player.name);

    await untilRoster(dm.page, [dm.name, player.name]);
    await untilRoster(player.page, [dm.name, player.name]);
    check("DM roster", await roster(dm.page), [dm.name, player.name].sort());
    check(
      "player roster",
      await roster(player.page),
      [dm.name, player.name].sort(),
    );
    check(
      "the joiner sees the DM seat is taken",
      await player.page.locator("text=Someone else is running combat").count(),
      1,
    );
    check(
      "the joiner is not offered the combat controls",
      await player.page.locator("text=Start combat").count(),
      0,
    );

    await dm.page.click("text=Start combat");
    await until(
      player.page,
      "the player to see round 1",
      () => document.querySelector(".round-counter-value")?.textContent === "1",
    );
    check("round propagated", true, true);

    return [dm, player];
  },

  // A shared character code lands on the sheet, not the lobby.
  async editing(browser) {
    const sharer = await openClient(browser, "multiclass", "sharer");
    const joiner = await openClient(browser, "empty-level-1", "joiner");

    await sharer.page.click("text=Open a sheet and share it");
    await untilPath(sharer.page, "/sheet");
    await sharer.page.getByText(sharer.name, { exact: false }).first().click();
    await untilText(sharer.page, "Start live session");
    check("the share modal survives the character picker", true, true);
    await sharer.page.click("text=Start live session");
    await untilText(sharer.page, "End live session");

    await untilVisible(
      joiner.page,
      '[aria-label="Session code or invite link"]',
    );
    await joiner.page.fill(
      '[aria-label="Session code or invite link"]',
      sharer.character.uuid,
    );
    await joiner.page.click('.home-join button[type="submit"]');
    await untilPath(joiner.page, "/sheet");
    await untilText(joiner.page, sharer.name);
    check("a character code opens the shared sheet", true, true);

    await untilVisible(sharer.page, ".presence-chip");
    await untilVisible(joiner.page, ".presence-chip");
    check("both sides see each other's presence chip", true, true);

    // Rename on the host, expect it on the joiner.
    await sharer.page.locator('.modal-content [aria-label="Close"]').click();
    await sharer.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    const sharerInput = sharer.page.locator(".modal-content input").first();
    await sharerInput.fill("Wren the Renamed");
    await sharer.page.click('.modal-content button:has-text("Save")');
    await untilText(joiner.page, "Wren the Renamed");
    check("a host edit reaches the joiner", true, true);

    // Rename back on the joiner: editing is bidirectional.
    await joiner.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    const joinerInput = joiner.page.locator(".modal-content input").first();
    await joinerInput.fill("Wren Round Two");
    await joiner.page.click('.modal-content button:has-text("Save")');
    await untilText(sharer.page, "Wren Round Two");
    check("a joiner edit reaches the host", true, true);

    let joinerAlert = "";
    joiner.page.on("dialog", (dialog) => {
      joinerAlert = dialog.message();
      dialog.accept();
    });
    await sharer.page.click('[title="Share character"]');
    await sharer.page.click("text=End live session");
    await until(
      joiner.page,
      "the joiner to be told the session ended",
      () => !document.body.innerText.includes("Wren Round Two"),
    );
    check(
      "ending the session tells the joiner",
      joinerAlert.includes("ended"),
      true,
    );

    return [sharer, joiner];
  },

  // A DM holding several live sessions (one per shared sheet): an edit to a
  // shared sheet must never land on whichever sheet the DM has open, must land
  // on the shared sheet's stored copy, and switching sheets must not end the
  // session.
  async multisession(browser) {
    const sharer = await openClient(browser, "multiclass", "sharer", [
      "empty-level-1",
    ]);
    const joiner = await openClient(browser, "martial-fighter", "joiner");

    await sharer.page.click("text=Open a sheet and share it");
    await untilPath(sharer.page, "/sheet");
    await sharer.page.getByText(sharer.name, { exact: false }).first().click();
    await untilText(sharer.page, "Start live session");
    await sharer.page.click("text=Start live session");
    await untilText(sharer.page, "End live session");
    await sharer.page.locator('.modal-content [aria-label="Close"]').click();

    await untilVisible(
      joiner.page,
      '[aria-label="Session code or invite link"]',
    );
    await joiner.page.fill(
      '[aria-label="Session code or invite link"]',
      sharer.character.uuid,
    );
    await joiner.page.click('.home-join button[type="submit"]');
    await untilPath(joiner.page, "/sheet");
    await untilText(joiner.page, sharer.name);

    // Switch to a different sheet; the shared session stays open behind it.
    await sharer.page.click('[title="Characters"]');
    await sharer.page
      .locator(".character-list a", { hasText: "Freshly Rolled" })
      .first()
      .click();
    await until(
      sharer.page,
      "the DM's other sheet to be open",
      (shared) => !document.body.innerText.includes(shared),
      sharer.name,
    );
    const openedInstead = await sharer.page
      .locator(".character-info-header .display-value")
      .first()
      .textContent();

    await joiner.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    await joiner.page
      .locator(".modal-content input")
      .first()
      .fill("Edited While Away");
    await joiner.page.click('.modal-content button:has-text("Save")');
    await untilText(joiner.page, "Edited While Away");
    check(
      "the joiner can still edit — switching away didn't end it",
      true,
      true,
    );

    await until(
      sharer.page,
      "the DM's open sheet to stay itself",
      (was) =>
        document
          .querySelector(".character-info-header .display-value")
          ?.textContent?.trim() === was,
      openedInstead.trim(),
    );
    check(
      "an edit to the shared sheet never lands on the open one",
      await sharer.page
        .locator(".character-info-header .display-value")
        .first()
        .textContent(),
      openedInstead,
    );

    await sharer.page.click('[title="Characters"]');
    await sharer.page
      .locator(".character-list a", { hasText: "Edited While Away" })
      .first()
      .click();
    await untilText(sharer.page, "Edited While Away");
    check("and is folded into the shared sheet's stored copy", true, true);

    return [sharer, joiner];
  },

  // A reload: React state and socket gone, but the URL (`/play/<code>`)
  // carries what's needed to reconnect.
  async reload(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);

    check(
      "the table is in the URL",
      new URL(player.page.url()).pathname,
      `/play/${code}`,
    );

    await untilVisible(dm.page, ".dm-liveness.live");
    check("the DM can see somebody is behind the row", true, true);

    // Nothing is clicked from here to the end of the player's half.
    await player.page.reload({ waitUntil: "domcontentloaded" });
    await untilBoard(player.page);
    await untilVisible(player.page, ".session-live");
    check("a killed tab reconnects on its own", true, true);
    await untilRoster(player.page, [dm.name, player.name]);
    check(
      "onto the fight it left, not an empty one",
      await roster(player.page),
      [dm.name, player.name].sort(),
    );
    await untilVisible(player.page, ".play-vitals");
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "and the table never lost the row",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );
    check(
      "the reconnected tab still names the table in its URL",
      new URL(player.page.url()).pathname,
      `/play/${code}`,
    );

    // The second reload is the one that finds a URL rewritten by the first.
    await player.page.reload({ waitUntil: "domcontentloaded" });
    await untilBoard(player.page);
    await untilVisible(player.page, ".session-live");
    await untilRoster(player.page, [dm.name, player.name]);
    check("so reloading again lands at the table too", true, true);

    // `clientId` is per-tab; the durable DM token is what brings the seat back.
    await dm.page.reload({ waitUntil: "domcontentloaded" });
    await untilBoard(dm.page);
    await untilVisible(dm.page, ".session-code code");
    // The seat comes back off the first peer state, a round trip after the
    // code renders — wait for it rather than sampling right away.
    await untilVisible(dm.page, "text=Release DM seat");
    check("the DM's tab comes back to their own seat", true, true);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "with the roster it left",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );
    await until(player.page, "the player to still see a DM", () =>
      document.body.innerText.includes("Someone else is running combat"),
    );
    check("and the player never saw the seat go empty", true, true);

    return [dm, player];
  },

  // The DM's roster view: rows for every creature, HP edits land on the
  // player's actual sheet.
  async dmboard(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm);
    await joinGame(player, code, player.name);

    await untilVisible(dm.page, ".dm-board");
    await until(
      dm.page,
      "the player's row on the DM board",
      (name) =>
        [...document.querySelectorAll(".dm-row-name")].some(
          (n) => n.textContent.trim() === name,
        ),
      player.name,
    );
    check(
      "the DM gets the roster, not an action board",
      await dm.page.locator(".action-board").count(),
      0,
    );
    check(
      "the player cannot add combatants",
      await player.page.locator('[aria-label="Combatant name"]').count(),
      0,
    );

    const row = dm.page.locator(".dm-row", { hasText: player.name });
    await row.locator(".hp-total").click();
    const hpInput = row.locator('input[aria-label*="hit points"]');
    await hpInput.fill("5");
    await hpInput.press("Enter");
    await untilHp(player.page, 5);
    check("a DM HP edit reaches the player's sheet", true, true);

    await ownDelta(player.page, "+1");
    await until(
      dm.page,
      "the DM to see the player back at 6",
      (name) => {
        const rows = [...document.querySelectorAll(".dm-row")];
        const theirs = rows.find((r) => r.textContent.includes(name));
        const display = theirs?.querySelector(".hp-total");
        return !!display && display.textContent.startsWith("6/");
      },
      player.name,
    );
    check("the player's next edit wins back", true, true);

    return [dm, player];
  },

  // Sheet assignment: the DM offers a brought sheet, a sheetless player picks
  // it up, and it returns to the table when they leave.
  async pickup(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "empty-level-1", "player");
    const offeredName = "Maelina Vael";

    const code = await startGame(dm, [offeredName]);
    await untilVisible(dm.page, ".dm-board");
    await inTableSettings(dm.page, () =>
      dm.page.click('.brought-sheets button:has-text("Offer")'),
    );
    await untilText(dm.page, "Offered");

    await joinGame(player, code);
    await untilVisible(player.page, `text=Play ${offeredName}`);
    check("the offer reaches a sheetless player", true, true);
    await player.page.click(`text=Play ${offeredName}`);

    await untilVisible(player.page, ".action-board");
    await untilText(player.page, offeredName);
    check("the sheet opens and plays", true, true);
    await untilText(dm.page, "In play");
    check("the DM sees it picked up", true, true);

    const storedUuids = await player.page.evaluate(() =>
      Object.keys(
        JSON.parse(localStorage.getItem("dndcharactersheets_characters")),
      ),
    );
    check("the borrowed sheet is not saved locally", storedUuids.length, 1);

    await ownDelta(player.page, "1");
    await until(
      dm.page,
      "the DM to see the borrowed sheet's HP drop",
      (name) => {
        const rows = [...document.querySelectorAll(".dm-row")];
        const theirs = rows.find((r) => r.textContent.includes(name));
        const display = theirs?.querySelector(".hp-total");
        return !!display && Number.parseInt(display.textContent, 10) < 47;
      },
      offeredName,
    );
    check("the borrowed sheet's HP reaches the DM", true, true);

    await player.page.click("text=Leave");
    await untilText(dm.page, "Offered");
    await until(
      dm.page,
      "the sheet to stay on the DM's roster",
      (name) =>
        [...document.querySelectorAll(".dm-row-name")].some(
          (n) => n.textContent.trim() === name,
        ),
      offeredName,
    );
    check("leaving puts the sheet back on the table", true, true);

    return [dm, player];
  },

  // The DM points a sheet at a named player; the sheet moves only after the
  // player accepts.
  async assign(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "empty-level-1", "player");
    const offeredName = "Maelina Vael";

    const code = await startGame(dm, [offeredName]);
    await joinGame(player, code, undefined, "Nadia");

    await dm.page.click('button:has-text("Table settings")');
    await untilVisible(dm.page, ".hand-to-select");
    await dm.page.click(`button[aria-label="Hand ${offeredName} to a player"]`);
    const joiner = dm.page
      .locator('[role="listbox"] [role="option"]', { hasText: "Nadia" })
      .first();
    await joiner.waitFor({ state: "visible", timeout: TIMEOUT });
    check("the joiner's name reaches the DM", true, true);

    await joiner.click();
    await dm.page.click('.table-settings button[aria-label="Close"]');

    await untilVisible(player.page, ".assign-prompt");
    check("the assignment prompt reaches the player", true, true);
    await prompt(player.page, "handing you").click();

    await untilVisible(player.page, ".action-board");
    await untilText(player.page, offeredName);
    check("accepting opens the sheet", true, true);
    await untilText(dm.page, "In play");
    check("the DM sees it in play", true, true);

    return [dm, player];
  },

  // The DM's call rolls for sheets they brought and prompts every player to
  // roll their own.
  async initiative(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "multiclass", "player");

    const code = await startGame(dm, ["Maelina Vael"]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, ["Maelina Vael", player.name]);

    await openAsks(dm.page);
    await dm.page.click('.dm-ask-row button:has-text("Ask everyone")');

    await until(
      dm.page,
      "the brought sheet's initiative to be rolled",
      () =>
        Number(
          document.querySelector('input[aria-label="Maelina Vael initiative"]')
            ?.value,
        ) !== 0,
    );
    check("the DM's brought sheet rolled", true, true);

    await untilText(player.page, "Roll initiative!");
    check("the players hear the call", true, true);
    await prompt(player.page, "Roll initiative!").click();
    await until(
      player.page,
      "the player's own initiative to be set",
      (name) =>
        Number(
          document.querySelector(`input[aria-label="${name} initiative"]`)
            ?.value,
        ) !== 0,
      player.name,
    );
    check("one click rolls the player in", true, true);

    return [dm, player];
  },

  // A player rolls damage and reports it; the DM applies it. Then both halves
  // of the concentration reminder.
  async damage(browser) {
    const dm = await openClient(browser, "full-caster-wizard", "dm");
    const player = await openClient(browser, "martial-fighter", "player");

    const code = await startGame(dm);
    await joinGame(player, code, player.name);

    await dm.page.fill(".dm-add-name", "Goblin");
    await dm.page.fill('[aria-label="Hit points each (optional)"]', "7");
    await dm.page.click('.dm-add button[type="submit"]');
    await untilVisible(dm.page, '[aria-label="Damage to Goblin"]');

    await untilRoster(player.page, ["Goblin", player.name]);
    await player.page.click('[aria-label="Roll Greatsword"]');
    await choose(player.page, "Who you are attacking", "Goblin");
    await player.page.getByRole("button", { name: /Roll .*Damage/ }).click();
    await player.page.click('[aria-label="Close"]');

    await untilVisible(dm.page, ".dm-exchange .dm-hp-input");
    check("the report reaches the DM", true, true);
    await dm.page.click(".dm-exchange .dm-hp-input + .btn-primary");
    await until(dm.page, "the goblin's HP to drop", () => {
      const display = document.querySelector(
        '[aria-label="Set Goblin hit points directly"]',
      );
      return !!display && Number.parseInt(display.textContent, 10) < 7;
    });
    check("applying the report damages the goblin", true, true);

    const goblinConc = dm.page.locator(
      '[aria-label="Goblin concentrating on"]',
    );
    await goblinConc.fill("Fog Cloud");
    await goblinConc.press("Enter");
    // Top the goblin up first so the DC comes off this one hit alone.
    const goblinDamage = dm.page
      .locator(".dm-row", { hasText: "Goblin" })
      .locator(".vitals-amount");
    await goblinDamage.fill("+7");
    await goblinDamage.press("Enter");
    await goblinDamage.fill("4");
    await goblinDamage.press("Enter");
    await untilText(dm.page, "CON DC 10");
    check("damaging a concentrating monster raises the check", true, true);
    await dm.page.click("text=Broke");
    await until(
      dm.page,
      "the goblin's concentration to clear",
      () => !document.body.innerText.includes("Fog Cloud"),
    );
    check("Broke drops the monster's concentration", true, true);

    // Temp HP end to end: a second player buffs up, gets hit, temp drains first.
    const ally = await openClient(browser, "multiclass", "ally");
    await joinGame(ally, code, ally.name);
    await untilRoster(dm.page, ["Goblin", ally.name, player.name]);
    const allyHpBefore = await readHp(ally.page);
    for (let i = 0; i < 3; i += 1) {
      await ally.page.click('[aria-label="Gain 1 temporary hit point"]');
    }
    await player.page.click('[aria-label="Roll Greatsword"]');
    await choose(player.page, "Who you are attacking", ally.name);
    await player.page.click('[aria-label="Roll"]');
    await untilVisible(dm.page, ".dm-exchange");
    check(
      "the to-hit roll reaches the seat with the target's AC beside it",
      await dm.page.locator(".dm-vs-ac").count(),
      1,
    );
    await dm.page.click(".dm-stage-ruling .btn-primary");
    await untilText(player.page, "Your DM says");
    check("the DM's verdict lands under the player's roll", true, true);
    // Re-rolling is never blocked.
    await player.page.click('[aria-label="Roll"]');
    await untilText(dm.page, "re-rolled");
    check("a second try is marked as one on the DM's card", true, true);

    await player.page.getByRole("button", { name: /Roll .*Damage/ }).click();
    await player.page.click('[aria-label="Close"]');
    await untilVisible(dm.page, ".dm-exchange .dm-hp-input");
    const reported = Number(
      await dm.page.locator(".dm-exchange .dm-hp-input").inputValue(),
    );
    await dm.page.click(".dm-exchange .dm-hp-input + .btn-primary");
    // 2d6+4 min exceeds the 3 temp, so temp goes to 0 and the rest hits HP.
    await until(ally.page, "temp HP to be drained on the ally's sheet", () =>
      [...document.querySelectorAll(".play-hp-temp input")].some(
        (i) => i.value === "0",
      ),
    );
    await untilHp(ally.page, allyHpBefore - (reported - 3));
    check("an applied report drains temp HP before HP", true, true);

    const playerConc = player.page.locator(
      `[aria-label="${player.name} concentrating on"]`,
    );
    await playerConc.fill("Web");
    await playerConc.press("Enter");
    await untilVisible(dm.page, `[aria-label="Damage to ${player.name}"]`);
    const playerDamage = dm.page
      .locator(".dm-row", { hasText: player.name })
      .locator(".vitals-amount");
    await playerDamage.fill("9");
    await playerDamage.press("Enter");
    await untilText(player.page, "while concentrating on");
    check("the player is prompted for the concentration save", true, true);
    await player.page.click("text=Kept it");
    await until(
      player.page,
      "the prompt to clear",
      () => !document.body.innerText.includes("while concentrating on"),
    );
    check("Kept it dismisses the prompt and keeps the spell", true, true);

    return [dm, player, ally];
  },

  // A targeted roll call answered through the roll tool, healing routed
  // player → DM → recipient, and death saves.
  async table(browser) {
    const dm = await openClient(browser, "full-caster-wizard", "dm");
    const player = await openClient(browser, "martial-fighter", "player");
    const healer = await openClient(
      browser,
      "multiclass",
      "healer",
      [],
      // Bless stands in for Cure Wounds as a rollable heal.
      (f) => {
        f.spells.First[0].mechanics = {
          level: 1,
          resolution: { kind: "auto" },
          healing: [2, "d8", "roll"],
        };
      },
    );

    const code = await startGame(dm);
    await joinGame(player, code, player.name);
    await joinGame(healer, code, healer.name);

    await openAsks(dm.page);
    await until(
      dm.page,
      "the audience chips to know both players",
      () =>
        document.querySelectorAll(".dm-audience .dm-audience-chip").length >= 3,
    );
    await dm.page.click('button[aria-label="Which check or save to ask for"]');
    // Typed, not filled: an open picker puts the keyboard in its filter box,
    // which only holds in a real browser (focus is a no-op while the popup is
    // still `visibility: hidden`).
    await dm.page.keyboard.type("perc");
    await untilVisible(dm.page, '[role="listbox"] [role="option"]');
    check(
      "an opened picker takes typing straight into its filter",
      await dm.page.locator('[role="listbox"] [role="option"]').count(),
      1,
    );
    await dm.page.click('[role="listbox"] [role="option"]');
    await dm.page
      .locator(".dm-audience-chip", { hasText: player.name })
      .click();
    await dm.page.click('.dm-roll-call button[type="submit"]');
    await untilText(player.page, "Your DM asks for a");
    check(
      "the unaddressed player is not prompted",
      await healer.page.locator("text=Your DM asks for a").count(),
      0,
    );
    // The prompt opens the ordinary roll dialog rather than rolling inline.
    await prompt(player.page, "asks for a").click();
    await untilVisible(player.page, '[aria-label="Roll"]');
    await player.page.click('[aria-label="Roll"]');
    await player.page.click('[aria-label="Close"]');
    await untilText(player.page, "You sent");
    await untilText(dm.page, "Perception");
    check("the answer reaches the seat", true, true);
    await dm.page.click("text=Clear all");

    // The same ask addressed to two players at once.
    await dm.page.click('button[aria-label="Which check or save to ask for"]');
    await dm.page.fill(".app-select-popup input", "stea");
    await dm.page.click('[role="listbox"] [role="option"]');
    await dm.page
      .locator(".dm-audience-chip", { hasText: healer.name })
      .click();
    await dm.page.click('.dm-roll-call button[type="submit"]');
    await untilText(player.page, "Stealth");
    await untilText(healer.page, "Stealth");
    check("an ask can name several players", true, true);

    // Healing routed through the DM: healer reports, DM approves, recipient applies.
    await setHp(player.page, 20);
    await healer.page.click('[aria-label="Roll Bless"]');
    await choose(healer.page, "Who you are healing", player.name);
    await healer.page.click("text=Roll Healing");
    const healed = Number(
      await healer.page.locator(".roll-total").last().textContent(),
    );
    await healer.page.click('[aria-label="Close"]');
    await untilVisible(dm.page, ".dm-exchange .dm-hp-input");
    await dm.page.click(".dm-exchange .dm-hp-input + .btn-primary"); // Approve
    await untilText(player.page, "incoming from");
    check("approved healing reaches the recipient", true, true);
    await player.page.click(`text=Apply +${healed}`);
    await untilHp(player.page, Math.min(49, 20 + healed));
    check("applying writes the recipient's own sheet", true, true);

    // A called rest reaches everyone; the rest is only taken when the player takes it.
    await choose(dm.page, "Which rest to call", "Long rest");
    await dm.page.click('.dm-rest-call button[type="submit"]');
    await untilText(player.page, "Your DM calls a");
    await untilText(healer.page, "Your DM calls a");
    check("a called rest reaches the whole table", true, true);
    check(
      "and nothing is taken until the player takes it",
      Number.parseInt(
        await player.page.locator(HP_TOTAL).first().textContent(),
        10,
      ),
      Math.min(49, 20 + healed),
    );
    await prompt(player.page, "calls a").click();
    await untilText(player.page, "Take rest");
    await player.page.click("text=Take rest");
    await untilText(player.page, "Long rest taken");
    await player.page.click("text=Done");
    await untilHp(player.page, 49);
    check("taking it rests the player's own sheet", true, true);

    // Death saves: DM always sees them, party by default until hidden.
    await setHp(player.page, 0);
    await untilVisible(dm.page, ".dm-death-saves");
    await untilVisible(healer.page, ".initiative-death-saves");
    check("death saves reach the DM and the party", true, true);
    await inTableSettings(dm.page, () =>
      dm.page.click(".table-policy .settings-checkbox input"),
    );
    await until(
      healer.page,
      "the party's death-save chip to hide",
      () => !document.querySelector(".initiative-death-saves"),
    );
    check(
      "hiding blanks the party's view, never the DM's",
      await dm.page.locator(".dm-death-saves").count(),
      1,
    );

    return [dm, player, healer];
  },

  // Leaving drops you from everyone's roster; rejoining from the character's
  // remembered list puts you back.
  async rejoin(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);

    await player.page.click("text=Leave");
    await untilRoster(dm.page, [dm.name]);
    check("leaving removes you from the DM's roster", await roster(dm.page), [
      dm.name,
    ]);

    await untilVisible(player.page, ".session-recent");
    check(
      "the character remembers the session",
      await player.page.locator(".session-recent li").count(),
      1,
    );
    await player.page.click(".session-recent li button");
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "rejoining restores you",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    return [dm, player];
  },

  // The DM returning to a table nobody else is sitting at: the seat must come
  // back, and a new game must not open onto the previous game's roster.
  async dmreturn(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const first = await startGame(dm, [dm.name]);
    await untilRoster(dm.page, [dm.name]);

    // A closed tab, not a reload: same browser (DM token durable in
    // localStorage) but a new page and a new client id.
    const context = dm.page.context();
    await dm.page.close();
    dm.page = await context.newPage();
    await dm.page.goto(BASE, { waitUntil: "domcontentloaded" });

    await untilVisible(dm.page, "text=The game you're running");
    await dm.page.click("text=The game you're running");
    await untilVisible(dm.page, "text=Rejoin the table");
    await dm.page.click("text=Rejoin the table");
    await untilBoard(dm.page);
    await untilVisible(dm.page, "text=Release DM seat");
    check("a table with nobody in it still hands the seat back", true, true);
    await untilRoster(dm.page, [dm.name]);
    check(
      "with what was brought to it",
      await roster(dm.page),
      [dm.name].sort(),
    );

    // A latecomer arriving at a table the DM has been sitting at alone.
    await joinGame(player, first, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "a latecomer joins the DM's fight rather than replacing it",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    // Start something else; the old fight's storage must not leak into it.
    await dm.page.click("text=Leave");
    await dm.page.goto(BASE, { waitUntil: "domcontentloaded" });
    const second = await startGame(dm);
    await untilVisible(dm.page, "text=Release DM seat");
    check("a new table is a new table", await roster(dm.page), []);
    check("on a code of its own", second === first, false);

    return [dm, player];
  },

  // A connection drop and recovery, using a real network drop
  // (`context.setOffline`) rather than a simulated close.
  async dropout(browser) {
    const sharer = await openClient(browser, "multiclass", "sharer");
    const joiner = await openClient(browser, "empty-level-1", "joiner");

    // --- Layer B: a shared sheet -------------------------------------------
    await sharer.page.click("text=Open a sheet and share it");
    await untilPath(sharer.page, "/sheet");
    await sharer.page.getByText(sharer.name, { exact: false }).first().click();
    await untilText(sharer.page, "Start live session");
    await sharer.page.click("text=Start live session");
    await untilText(sharer.page, "End live session");

    await untilVisible(
      joiner.page,
      '[aria-label="Session code or invite link"]',
    );
    await joiner.page.fill(
      '[aria-label="Session code or invite link"]',
      sharer.character.uuid,
    );
    await joiner.page.click('.home-join button[type="submit"]');
    await untilPath(joiner.page, "/sheet");
    await untilText(joiner.page, sharer.name);

    // Any alert here is a failure: only the host explicitly ending the session
    // should say so.
    let alerted = "";
    joiner.page.on("dialog", (dialog) => {
      alerted = dialog.message();
      dialog.accept();
    });

    await joiner.page.context().setOffline(true);
    await sharer.page.locator('.modal-content [aria-label="Close"]').click();
    await sharer.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    const renameInput = sharer.page.locator(".modal-content input").first();
    await renameInput.fill("Wren Who Waited");
    await sharer.page.click('.modal-content button:has-text("Save")');

    check(
      "a dropped joiner keeps the sheet they were editing",
      await joiner.page.locator(".character-info-header").count(),
      1,
    );
    check("and is not told the session ended", alerted, "");

    await joiner.page.context().setOffline(false);
    // Nothing is clicked; reconnect + resync happen on their own.
    await untilText(joiner.page, "Wren Who Waited");
    check("coming back re-syncs what the host changed meanwhile", true, true);

    await joiner.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    const joinerInput = joiner.page.locator(".modal-content input").first();
    await joinerInput.fill("Wren Reconnected");
    await joiner.page.click('.modal-content button:has-text("Save")');
    await untilText(sharer.page, "Wren Reconnected");
    check("and edits flow again in both directions", true, true);

    return [sharer, joiner];
  },

  // The same drop, at a table.
  async tabledropout(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);

    await player.page.context().setOffline(true);
    await dm.page.click("text=Start combat");
    await until(
      dm.page,
      "the DM to be in round 1",
      () => document.querySelector(".round-counter-value")?.textContent === "1",
    );

    await player.page.context().setOffline(false);
    await untilVisible(player.page, ".session-live");
    check("a dropped player is put back at the table", true, true);
    await until(
      player.page,
      "the player to catch up to round 1",
      () => document.querySelector(".round-counter-value")?.textContent === "1",
    );
    check("into the round that started while they were away", true, true);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "and the DM's roster never lost them",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    return [dm, player];
  },

  // A DM stepping off the board to read a sheet and back. Their open sheet is
  // a document they are consulting, not a seat at their own table.
  async dmsheet(browser) {
    // The DM holds a copy of the player's sheet as well as their own — the
    // ordinary case, since they brought it to the table.
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [player.name]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, [player.name]);

    await dm.page.click('[title="Characters"]');
    await dm.page.click(`#sidebar .character-list a:has-text("${dm.name}")`);
    await untilPath(dm.page, `/sheet/${dm.character.uuid}`);
    check("the DM can open a sheet mid-table", true, true);

    await dm.page.click('[aria-label="Play"]');
    await untilBoard(dm.page);
    check("dm roster after reading a sheet", await roster(dm.page), [
      player.name,
    ]);
    check(
      "player roster after the DM read a sheet",
      await roster(player.page),
      [player.name],
    );
    check(
      "the DM's URL still names the table",
      new URL(dm.page.url()).pathname,
      `/play/${code}`,
    );
    check(
      "and the nav names the table, not the sheet",
      (await dm.page.locator("#main-nav h1").textContent()).trim(),
      "At the table",
    );

    // The row the player is playing: reading the DM's own copy of that sheet
    // must not take it off them.
    await dm.page.click('[title="Characters"]');
    await dm.page.click(
      `#sidebar .character-list a:has-text("${player.name}")`,
    );
    await untilPath(dm.page, `/sheet/${player.character.uuid}`);
    await dm.page.click('[aria-label="Play"]');
    await untilBoard(dm.page);
    check(
      "and the table gained nothing from the reading",
      await roster(dm.page),
      [player.name],
    );
    check(
      "nor did the sheet gain a game it never played",
      await dm.page.evaluate((uuid) => {
        const stored = JSON.parse(
          localStorage.getItem("dndcharactersheets_characters") ?? "{}",
        );
        return stored[uuid]?.playSessions?.length ?? 0;
      }, dm.character.uuid),
      0,
    );

    return [dm, player];
  },

  // A deploy: the sidecar restarts and every realm with it, while the tabs
  // stay where they are. Nothing is clicked — the URL is the whole recovery.
  async deploy(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    // A code whose realm was never opened stands in for one the restart took;
    // both are "the sidecar has never heard of this table".
    const code = randomUUID();
    const remember = (client, seat) =>
      client.page.evaluate(
        (entry) => {
          localStorage.setItem(
            "dndcharactersheets_playSessionMemory",
            JSON.stringify([entry]),
          );
        },
        {
          code,
          lastJoined: Date.now(),
          seat,
          // What a real memory of a table holds: a player's sheet comes back
          // with them, a DM's doesn't.
          ...(seat === "dm"
            ? {}
            : { playAsUuid: client.character.uuid, playAsName: client.name }),
        },
      );

    await remember(dm, "dm");
    await dm.page.goto(`${BASE}/play/${code}`, {
      waitUntil: "domcontentloaded",
    });
    await untilBoard(dm.page);
    await untilVisible(dm.page, ".session-live");
    check("the DM's tab reopens the table it was already at", true, true);
    check(
      "on the code the group already has",
      (await dm.page.locator(".session-code code").textContent()).trim(),
      code,
    );
    check(
      "and keeps it in the URL",
      new URL(dm.page.url()).pathname,
      `/play/${code}`,
    );

    await remember(player, "player");
    await player.page.goto(`${BASE}/play/${code}`, {
      waitUntil: "domcontentloaded",
    });
    await untilBoard(player.page);
    await untilVisible(player.page, ".session-live");
    await untilRoster(dm.page, [player.name]);
    check(
      "and a player pointed at the same URL is seated again, with their sheet",
      await roster(dm.page),
      [player.name],
    );

    return [dm, player];
  },

  // The invite link end to end, plus reopening a table whose sidecar realm
  // has since gone away (a sidecar restart happens on every deploy).
  async invite(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);

    await player.page.goto(`${BASE}/join/${code}`, {
      waitUntil: "domcontentloaded",
    });
    await untilVisible(player.page, ".lobby");
    check("an invite link lands in the lobby", true, true);
    await player.page
      .locator(".lobby-characters label", { hasText: player.name })
      .click();
    await player.page.click(".lobby-actions .btn-primary");
    await untilBoard(player.page);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "joining by link seats you like any other joiner",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    // A code with no realm behind it, freshly generated each run since this
    // scenario relies on it being unopened.
    const stale = randomUUID();
    const staleLink = `${BASE}/join/${stale}`;

    await player.page.goto(staleLink, { waitUntil: "domcontentloaded" });
    await untilText(player.page, "No session with that code is open");
    check("a dead link tells a player to ask their DM", true, true);
    check(
      "and doesn't offer them someone else's table",
      await player.page.locator("text=Open this table again").count(),
      0,
    );

    // Seed session memory as if this browser ran that table.
    await dm.page.evaluate(
      (remembered) => {
        localStorage.setItem(
          "dndcharactersheets_playSessionMemory",
          JSON.stringify([remembered]),
        );
      },
      { code: stale, lastJoined: Date.now(), seat: "dm" },
    );
    await dm.page.goto(staleLink, { waitUntil: "domcontentloaded" });
    await untilVisible(dm.page, "text=Open this table again");
    check("the DM who ran it is offered it back", true, true);
    await dm.page.click("text=Open this table again");
    await untilVisible(dm.page, ".lobby");
    await dm.page.click(".lobby-actions .btn-primary");
    await untilBoard(dm.page);
    await untilVisible(dm.page, ".session-code code");
    const reopened = (
      await dm.page.locator(".session-code code").textContent()
    ).trim();
    check("reopening keeps the code the group already has", reopened, stale);

    await player.page.goto(staleLink, { waitUntil: "domcontentloaded" });
    await untilVisible(player.page, ".lobby");
    await player.page.click(".lobby-actions .btn-primary");
    await untilBoard(player.page);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "and seats the player at the reopened table",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    return [dm, player];
  },
};

// --- Run ---------------------------------------------------------------------

async function assertServing(url, what) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    console.error(`${what} isn't answering at ${url}. Start it and try again.`);
    process.exit(2);
  }
}

await assertServing(BASE, "The dev server");

const browser = await chromium.launch({
  headless: !has("headed"),
  slowMo: Number(flag("slow", 0)),
});

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

for (const [name, scenario] of Object.entries(scenarios)) {
  if (ONLY && ONLY !== name) continue;
  console.log(`\n${name}`);
  const started = Date.now();
  let clients = [];
  try {
    clients = (await scenario(browser)) ?? [];
  } catch (e) {
    failures += 1;
    console.log(`  ✗ ${e.message}`);
    // A thrown scenario never returned its clients; shoot whatever's still
    // open instead, labelled by position.
    if (SHOTS) {
      let index = 0;
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          await page
            .screenshot({
              path: join(SHOTS, `${name}-failed-${index++}.png`),
              fullPage: true,
            })
            .catch(() => {});
        }
      }
    }
  }
  console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const client of clients) {
    if (SHOTS) {
      await client.page.screenshot({
        path: join(SHOTS, `${name}-${client.label}.png`),
        fullPage: true,
      });
    }
    await client.page.context().close();
  }
}

await browser.close();
console.log(failures === 0 ? "\nAll good." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
