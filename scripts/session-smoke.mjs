// Dev helper: drive several real browsers through the session flows against a
// running dev server + sidecar, and assert what converges.
//
//   pnpm session-smoke                 # all scenarios
//   pnpm session-smoke --only gameplay # one scenario
//   pnpm session-smoke --headed --slow 200
//
// **Why this exists and why it isn't a vitest.** Everything the sidecar touches
// is gapi/WAMP-bound and unreachable from jsdom: realm creation, the probe that
// decides whether a pasted code is a game or a shared sheet, and — the reason
// this was written — whether two browsers that have never met actually converge
// on one encounter. Three bugs in the session layer were invisible to the unit
// tests and only ever showed up here.
//
// Requires `pnpm dev` and `pnpm server` to be running. It refuses to guess.
//
// Flags:
//   --base <url>      dev server (default http://localhost:3000)
//   --only <name>     run one scenario: gameplay | editing | reload | dmboard | pickup | assign | rejoin
//   --headed          show the browsers
//   --slow <ms>       slow motion, for watching a failure happen
//   --timeout <ms>    per-condition wait budget (default 15000)
//   --shots <dir>     write a PNG per client at the end
//
// House rule for this file: **never sleep, always wait for a condition.** A
// `waitForTimeout` long enough to be safe makes a run take half a minute, and a
// short one turns the app's flakiness and the harness's into the same symptom.
// Every wait below names the thing it is waiting for, so a failure says which
// step didn't happen rather than "the roster was empty".
import { readFileSync, mkdirSync } from "fs";
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

// Poll a page-side predicate until it holds. Everything else in this file is
// built on it, so a timeout can say what it was waiting for.
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

const untilText = (page, text) =>
  until(
    page,
    `text "${text}"`,
    (t) => document.body.innerText.includes(t),
    text,
  );

// The roster is the thing that actually has to converge, so it gets a wait of
// its own rather than a sleep followed by a hopeful read.
const untilRoster = (page, names) =>
  until(
    page,
    `roster ${JSON.stringify(names)}`,
    (expected) => {
      // A player's roster is the rail's pills; the DM's is the board's rows —
      // the rail deliberately stopped duplicating the list for the seat.
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

// --- Clients -----------------------------------------------------------------

async function openClient(browser, fixture, label, extraFixtures = []) {
  const load = (name) =>
    JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
  const character = load(fixture);
  const stored = Object.fromEntries(
    [character, ...extraFixtures.map(load)].map((c) => [c.uuid, c]),
  );
  const ctx = await browser.newContext();
  await ctx.addInitScript((chars) => {
    localStorage.setItem("dndcharactersheets_characters", chars);
    localStorage.setItem("dndcharactersheets_lastDatastore", '"local"');
  }, JSON.stringify(stored));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    failures += 1;
    console.log(`  ✗ [${label}] page crashed: ${e.message}`);
  });
  // Home auto-redirects into the last-used datastore, and that redirect is what
  // selects it — a direct goto to a deeper route leaves the app with none.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await untilVisible(page, '[aria-label="Sessions"]');
  return { page, character, label, name: character.name };
}

const toSessions = async (client) => {
  await client.page.click('[aria-label="Sessions"]');
  await untilText(client.page, "Been sent a code?");
};

// Start a game, optionally bringing sheets. Resolves once we're on /play with a
// session code in hand.
async function startGame(client, bring = []) {
  await toSessions(client);
  await client.page.click("text=Start a game");
  await untilVisible(client.page, ".lobby");
  for (const name of bring) {
    await client.page
      .locator(".lobby-characters label", { hasText: name })
      .click();
  }
  await client.page.click(".lobby-actions .btn-primary");
  await untilPath(client.page, "/play");
  await untilVisible(client.page, ".session-code code");
  return (await client.page.locator(".session-code code").textContent()).trim();
}

// Join a game by code, optionally as one of your sheets — or sheetless with a
// table name, which is what the DM's "Hand to…" picker shows. The code box
// sits inline on /sessions — one box for both kinds of code, no separate step.
async function joinGame(client, code, playAs, tableName) {
  await toSessions(client);
  await untilVisible(client.page, '[aria-label="Session code"]');
  await client.page.fill('[aria-label="Session code"]', code);
  await client.page.click('.session-join button[type="submit"]');
  // The probe decides which kind of code this is; reaching the lobby is the
  // assertion that it said "gameplay".
  await untilVisible(client.page, ".lobby");
  if (playAs) {
    await client.page
      .locator(".lobby-characters label", { hasText: playAs })
      .click();
  } else if (tableName) {
    await client.page.fill('[aria-label="Your name at the table"]', tableName);
  }
  await client.page.click(".lobby-actions .btn-primary");
  await untilPath(client.page, "/play");
}

// --- Scenarios ---------------------------------------------------------------

const scenarios = {
  // A DM starts a table bringing their own sheet; a player joins with theirs.
  // Both rosters must contain both, and the DM seat must have been taken at
  // creation rather than left for someone to claim.
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

    // The fight itself: started by the DM, visible to the player.
    await dm.page.click("text=Start combat");
    await until(
      player.page,
      "the player to see round 1",
      () => document.querySelector(".round-counter-value")?.textContent === "1",
    );
    check("round propagated", true, true);

    return [dm, player];
  },

  // A shared *character* code must land on the sheet, not the lobby — one box,
  // two kinds of code, and the probe is what tells them apart.
  async editing(browser) {
    const sharer = await openClient(browser, "multiclass", "sharer");
    const joiner = await openClient(browser, "empty-level-1", "joiner");

    await toSessions(sharer);
    await sharer.page.click("text=Share a character");
    // No character was open, so /sheet shows the picker: the share intent has
    // to survive picking one.
    await untilPath(sharer.page, "/sheet");
    await sharer.page.getByText(sharer.name, { exact: false }).first().click();
    await untilText(sharer.page, "Start live session");
    check("the share modal survives the character picker", true, true);
    await sharer.page.click("text=Start live session");
    await untilText(sharer.page, "End live session");

    await toSessions(joiner);
    await untilVisible(joiner.page, '[aria-label="Session code"]');
    await joiner.page.fill(
      '[aria-label="Session code"]',
      sharer.character.uuid,
    );
    await joiner.page.click('.session-join button[type="submit"]');
    await untilPath(joiner.page, "/sheet");
    await untilText(joiner.page, sharer.name);
    check("a character code opens the shared sheet", true, true);

    return [sharer, joiner];
  },

  // The DM refreshes their tab. `clientId` is per-tab, so before the DM token
  // this cost them the seat every time — and hosting recorded the code nowhere,
  // so they couldn't even get back into their own game.
  async reload(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);

    await dm.page.reload({ waitUntil: "domcontentloaded" });
    // The DM has no character open and no session, so the Play button isn't in
    // the nav and /play would bounce them — which is exactly why the rejoin
    // offer lives on /sessions, the one session surface always reachable.
    await untilVisible(dm.page, '[aria-label="Sessions"]');
    await dm.page.click('[aria-label="Sessions"]');
    await untilVisible(dm.page, "text=Rejoin your session");
    check("the code survives the reload", true, true);
    await dm.page.click("text=Rejoin your session");
    await untilPath(dm.page, "/play");

    await untilVisible(dm.page, ".session-code code");
    check(
      "the DM seat comes back on its own",
      await dm.page.locator("text=Release DM seat").count(),
      1,
    );
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "the roster comes back too",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );
    await until(player.page, "the player to still see a DM", () =>
      document.body.innerText.includes("Someone else is running combat"),
    );
    check("the player never saw the seat go empty", true, true);

    return [dm, player];
  },

  // The DM's roster view: rows for every creature, and an HP edit that lands
  // on the player's actual sheet — not just their projection.
  async dmboard(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm);
    await joinGame(player, code, player.name);

    // The DM sees the roster board, not the action board.
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

    // The player is not offered the roster controls while a DM runs the table.
    check(
      "the player cannot add combatants",
      await player.page.locator('[aria-label="Combatant name"]').count(),
      0,
    );

    // The DM knocks the player down to 5 HP; the player's own sheet follows.
    const row = dm.page.locator(".dm-row", { hasText: player.name });
    const hpInput = row.locator('input[aria-label*="hit points"]');
    await hpInput.fill("5");
    await hpInput.press("Enter");
    await until(
      player.page,
      "the player's HP tracker to show 5",
      // The number lives in the tracker's <input>, not in text content.
      () => document.querySelector(".play-hp-numbers input")?.value === "5",
    );
    check("a DM HP edit reaches the player's sheet", true, true);

    // And the player's own edit still wins afterwards.
    await player.page.click('[aria-label="Regain 1 hit point"]');
    await until(
      dm.page,
      "the DM to see the player back at 6",
      (name) => {
        const rows = [...document.querySelectorAll(".dm-row")];
        const theirs = rows.find((r) => r.textContent.includes(name));
        const input = theirs?.querySelector('input[aria-label*="hit points"]');
        return input?.value === "6";
      },
      player.name,
    );
    check("the player's next edit wins back", true, true);

    return [dm, player];
  },

  // Sheet assignment: the DM offers a brought sheet, a sheetless player picks
  // it up and plays it, and it goes back on the table when they leave. The one
  // flow where a whole character crosses the wire.
  async pickup(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "empty-level-1", "player");
    const offeredName = "Maelina Vael";

    const code = await startGame(dm, [offeredName]);
    await untilVisible(dm.page, ".dm-board");
    await dm.page.click("text=Offer sheet");
    await untilText(dm.page, "Offered");

    // The player joins without picking a sheet of their own.
    await joinGame(player, code);
    await untilVisible(player.page, `text=Play ${offeredName}`);
    check("the offer reaches a sheetless player", true, true);
    await player.page.click(`text=Play ${offeredName}`);

    // The whole sheet arrives and opens as their playable character.
    await untilVisible(player.page, ".action-board");
    await untilText(player.page, offeredName);
    check("the sheet opens and plays", true, true);
    await untilText(dm.page, "In play");
    check("the DM sees it picked up", true, true);

    // Played, never persisted: the player's storage still holds only their own.
    const storedUuids = await player.page.evaluate(() =>
      Object.keys(
        JSON.parse(localStorage.getItem("dndcharactersheets_characters")),
      ),
    );
    check("the borrowed sheet is not saved locally", storedUuids.length, 1);

    // The player's HP edits flow to the DM like any owned sheet.
    await player.page.click('[aria-label="Lose 1 hit point"]');
    await until(
      dm.page,
      "the DM to see the borrowed sheet's HP drop",
      (name) => {
        const rows = [...document.querySelectorAll(".dm-row")];
        const theirs = rows.find((r) => r.textContent.includes(name));
        const input = theirs?.querySelector('input[aria-label*="hit points"]');
        return !!input && Number(input.value) < 47;
      },
      offeredName,
    );
    check("the borrowed sheet's HP reaches the DM", true, true);

    // Leaving hands the sheet back: still on the DM's board, offered again.
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

  // The targeted half of sheet assignment: the DM points a sheet at a named
  // player instead of waiting for a pickup. Presence gives them someone to
  // point at; consent stays two-sided — the prompt travels, and the sheet
  // only moves after the player says yes (via the ordinary claim flow).
  async assign(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "empty-level-1", "player");
    const offeredName = "Maelina Vael";

    const code = await startGame(dm, [offeredName]);
    // Sheetless, with a typed table name — the case assignment exists for.
    await joinGame(player, code, undefined, "Nadia");

    await untilVisible(dm.page, ".dm-assign-select");
    await until(
      dm.page,
      "the joiner's name in the Hand to… picker",
      (name) =>
        [...document.querySelectorAll(".dm-assign-select option")].some(
          (option) => option.textContent.trim() === name,
        ),
      "Nadia",
    );
    check("the joiner's name reaches the DM", true, true);

    await dm.page.selectOption(".dm-assign-select", { label: "Nadia" });

    // The prompt arrives, not the sheet.
    await untilVisible(player.page, ".assign-prompt");
    check("the assignment prompt reaches the player", true, true);
    await player.page.click(".assign-prompt .btn-primary");

    // Accepting runs the claim flow end to end: sheet arrives, opens, plays.
    await untilVisible(player.page, ".action-board");
    await untilText(player.page, offeredName);
    check("accepting opens the sheet", true, true);
    await untilText(dm.page, "In play");
    check("the DM sees it in play", true, true);

    return [dm, player];
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
