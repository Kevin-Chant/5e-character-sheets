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
//   --sidecar <url>   the live-edit sidecar to point every client at
//                     (default http://localhost:9000 — never the cloud one)
//   --only <name>     run one scenario: gameplay | editing | reload | dmboard | pickup | assign | initiative | damage | table | rejoin | dmreturn
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
// **Pinned, not inherited.** The app's default sharing host is the *cloud*
// sidecar (there is no .env, so `VITE_LIVE_EDIT_HOST` falls back to it), and
// `--base` only redirects the page — so an idle `pnpm session-smoke` used to
// open eleven scenarios' worth of realms on production. Stored settings beat
// env in the app, so seeding one is what makes a hand-check stay at home.
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

// Current HP on the play rail is the shared `HpTotal` — the same control the
// DM's row uses — so it reads as text ("47/ 56"), not as an input value.
// `parseInt` stops at the slash.
const HP_TOTAL = ".play-hp-numbers .hp-total";
const readHp = (page) =>
  page
    .locator(HP_TOTAL)
    .textContent()
    .then((t) => Number.parseInt(t, 10));

// Both the selector and the target have to travel in `arg` — the predicate is
// serialised into the page, so it can't close over anything Node-side.
const untilHp = (page, expected) =>
  until(
    page,
    `own HP to reach ${expected}`,
    ({ sel, want }) =>
      Number.parseInt(document.querySelector(sel)?.textContent, 10) === want,
    { sel: HP_TOTAL, want: expected },
  );

// The player's own HP write is the same delta box the DM's row uses — a bare
// number damages, a leading + heals — so ±1 is an entry, not a stepper click.
async function ownDelta(page, entry) {
  const box = page.locator(".play-vitals .vitals-amount");
  await box.fill(entry);
  await box.press("Enter");
}

// Setting an exact total is the reveal-to-edit hatch, not a permanent field:
// click the figure, then type into the input it becomes.
async function setHp(page, value) {
  await page.click(HP_TOTAL);
  const input = page.locator(".hp-total-input");
  await input.fill(String(value));
  await input.press("Enter");
}

// --- Clients -----------------------------------------------------------------

async function openClient(browser, fixture, label, extraFixtures = [], mutate) {
  const load = (name) =>
    JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
  const character = load(fixture);
  // Scenario-specific fixture tweaks (e.g. granting a healing spell) without
  // forking a whole fixture file for one scenario.
  mutate?.(character);
  const stored = Object.fromEntries(
    [character, ...extraFixtures.map(load)].map((c) => [c.uuid, c]),
  );
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ({ chars, sidecar }) => {
      localStorage.setItem("dndcharactersheets_characters", chars);
      localStorage.setItem("dndcharactersheets_lastDatastore", '"local"');
      // A partial settings object; the provider merges it over the defaults.
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
  // The hub is the front door for everyone now — no redirect to wait out.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await untilVisible(page, '[aria-label="Session code or invite link"]');
  return { page, character, label, name: character.name };
}

// Start a game, optionally bringing sheets. Resolves once we're on /play with a
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
  await untilPath(client.page, "/play");
  await untilVisible(client.page, ".session-code code");
  return (await client.page.locator(".session-code code").textContent()).trim();
}

// Join a game by code, optionally as one of your sheets — or sheetless with a
// table name, which is what the DM's "Hand to…" picker shows. The code box is
// on the hub — one box for both kinds of code, no separate step.
async function joinGame(client, code, playAs, tableName) {
  await untilVisible(client.page, '[aria-label="Session code or invite link"]');
  await client.page.fill('[aria-label="Session code or invite link"]', code);
  await client.page.click('.home-join button[type="submit"]');
  // The probe decides which kind of code this is; reaching the lobby is the
  // assertion that it said "gameplay".
  await untilVisible(client.page, ".lobby");
  if (playAs) {
    const wanted = client.page.locator(".lobby-characters label", {
      hasText: playAs,
    });
    // A prefill from a previous game may already have chosen it; clicking a
    // chosen radio would leave it chosen anyway, but be explicit.
    if (!(await wanted.locator("input:checked").count())) await wanted.click();
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

    await sharer.page.click("text=Open a sheet and share it");
    // No character was open, so /sheet shows the picker: the share intent has
    // to survive picking one.
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

    // Presence converges both ways — the host sees the joiner arrive, and the
    // joiner is answered directly rather than waiting out a heartbeat.
    await untilVisible(sharer.page, ".presence-chip");
    await untilVisible(joiner.page, ".presence-chip");
    check("both sides see each other's presence chip", true, true);

    // A real edit crosses the wire, in both directions — which is the layer's
    // whole job. Rename on the host…
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

    // …and rename back on the joiner, since editing is bidirectional.
    await joiner.page
      .locator(".character-info-header .display-value")
      .first()
      .click();
    const joinerInput = joiner.page.locator(".modal-content input").first();
    await joinerInput.fill("Wren Round Two");
    await joiner.page.click('.modal-content button:has-text("Save")');
    await untilText(sharer.page, "Wren Round Two");
    check("a joiner edit reaches the host", true, true);

    // The host ending the session tells the joiner, whose borrowed copy is
    // the host's and now unreachable — it must not linger looking editable.
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
    // the nav and /play would bounce them. The front door is where the way back
    // lives: a reload lands on it, and the table they run is the first thing on
    // it.
    await untilVisible(dm.page, "text=The game you're running");
    check("the code survives the reload", true, true);
    await dm.page.click("text=The game you're running");
    await untilVisible(dm.page, "text=Rejoin the table");
    await dm.page.click("text=Rejoin the table");
    await untilPath(dm.page, "/play");

    await untilVisible(dm.page, ".session-code code");
    // Waited for, not sampled: the seat comes back off the *first state* a peer
    // sends, which lands a round trip after the code does. Reading it the
    // instant the code renders was checking the wrong moment, and had been
    // failing for it.
    await untilVisible(dm.page, "text=Release DM seat");
    check("the DM seat comes back on its own", true, true);
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

    // The DM knocks the player down to 5 HP through the direct-set escape
    // hatch (the delta box is exercised in the damage scenario); the player's
    // own sheet follows.
    const row = dm.page.locator(".dm-row", { hasText: player.name });
    await row.locator(".hp-total").click();
    const hpInput = row.locator('input[aria-label*="hit points"]');
    await hpInput.fill("5");
    await hpInput.press("Enter");
    await untilHp(player.page, 5);
    check("a DM HP edit reaches the player's sheet", true, true);

    // And the player's own edit still wins afterwards.
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

  // "Alright everyone, roll initiative": the DM's call rolls for the sheets
  // they brought and prompts every player to roll their own.
  async initiative(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm", [
      "full-caster-wizard",
    ]);
    const player = await openClient(browser, "multiclass", "player");

    const code = await startGame(dm, ["Maelina Vael"]);
    await joinGame(player, code, player.name);
    await untilRoster(dm.page, ["Maelina Vael", player.name]);

    await dm.page.click("text=Call for initiative");

    // The brought sheet rolled on the DM's side (d20 + DEX can't be 0).
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

    // The player is prompted, and one click rolls with their own modifier.
    await untilText(player.page, "Roll initiative!");
    check("the players hear the call", true, true);
    await player.page.click(".assign-prompt .btn-primary");
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

  // A player rolls damage at a monster and reports it; the DM applies it.
  // Then both halves of the concentration reminder: the DM's chip when a
  // concentrating monster takes damage, and the player's banner when the DM's
  // damage lands on their concentrating character.
  async damage(browser) {
    // Roles flipped from the other scenarios: the fighter is the one fixture
    // with a rollable attack, and here it's the *player* who rolls.
    const dm = await openClient(browser, "full-caster-wizard", "dm");
    const player = await openClient(browser, "martial-fighter", "player");

    const code = await startGame(dm);
    await joinGame(player, code, player.name);

    // One tracked goblin on the table.
    await dm.page.fill(".dm-add-name", "Goblin");
    await dm.page.fill('[aria-label="Hit points each (optional)"]', "7");
    await dm.page.click('.dm-add button[type="submit"]');
    await untilVisible(dm.page, '[aria-label="Damage to Goblin"]');

    // The player names the goblin, then swings: each stage travels as it
    // lands, and the damage roll needs no second answer to "at what?".
    await untilRoster(player.page, ["Goblin", player.name]);
    await player.page.click('[aria-label="Roll Greatsword"]');
    await player.page.selectOption('[aria-label="Who you are attacking"]', {
      label: "Goblin",
    });
    await player.page.getByRole("button", { name: /Roll .*Damage/ }).click();
    await player.page.click('[aria-label="Close"]');

    // The report reaches the seat, and applying it lands on the goblin.
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

    // DM-side concentration: give the goblin a spell, hurt it, get the chip.
    const goblinConc = dm.page.locator(
      '[aria-label="Goblin concentrating on"]',
    );
    await goblinConc.fill("Fog Cloud");
    await goblinConc.press("Enter");
    // The delta box speaks the table's language: top the goblin up first so
    // the DC comes off this one hit alone, then "it takes 4".
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

    // Temp HP end to end: a second player buffs up, gets hit by a reported
    // blow, and the delta drains temp first — on their actual sheet.
    const ally = await openClient(browser, "multiclass", "ally");
    await joinGame(ally, code, ally.name);
    await untilRoster(dm.page, ["Goblin", ally.name, player.name]);
    const allyHpBefore = await readHp(ally.page);
    for (let i = 0; i < 3; i += 1) {
      await ally.page.click('[aria-label="Gain 1 temporary hit point"]');
    }
    // Friendly fire, in the order the table plays it: name the target first,
    // then every stage travels on its own as it lands.
    await player.page.click('[aria-label="Roll Greatsword"]');
    await player.page.selectOption('[aria-label="Who you are attacking"]', {
      label: ally.name,
    });
    await player.page.click('[aria-label="Roll"]');
    await untilVisible(dm.page, ".dm-exchange");
    check(
      "the to-hit roll reaches the seat with the target's AC beside it",
      await dm.page.locator(".dm-vs-ac").count(),
      1,
    );
    // The ruling that used to be shouted across the table.
    await dm.page.click(".dm-stage-ruling .btn-primary");
    await untilText(player.page, "Your DM says");
    check("the DM's verdict lands under the player's roll", true, true);
    // Re-rolling is never blocked, and never silent.
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
    // Greatsword is at least 2d6+4, so the 3 temp can't swallow it all:
    // temp goes to 0 and the remainder comes off the sheet's HP.
    await until(ally.page, "temp HP to be drained on the ally's sheet", () =>
      [...document.querySelectorAll(".play-hp-temp input")].some(
        (i) => i.value === "0",
      ),
    );
    await untilHp(ally.page, allyHpBefore - (reported - 3));
    check("an applied report drains temp HP before HP", true, true);

    // Player-side: concentrating, then the DM's damage lands on their sheet.
    const playerConc = player.page.locator(
      `[aria-label="${player.name} concentrating on"]`,
    );
    await playerConc.fill("Web");
    await playerConc.press("Enter");
    // Dealt as a delta — the DM's primary write — which lands on the sheet.
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

  // The rest of the table loop: a targeted roll call answered through the
  // tool, healing routed player → DM → recipient, and death saves visible to
  // the DM and (until hidden) the party.
  async table(browser) {
    const dm = await openClient(browser, "full-caster-wizard", "dm");
    const player = await openClient(browser, "martial-fighter", "player");
    const healer = await openClient(
      browser,
      "multiclass",
      "healer",
      [],
      // Grant a rollable heal: Bless stands in for Cure Wounds.
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

    // A roll call addressed to one player: only they get the prompt, and the
    // answer comes back to the seat.
    await until(
      dm.page,
      "the audience picker to know both players",
      () =>
        document.querySelectorAll('[aria-label="Who should roll"] option')
          .length >= 3,
    );
    await dm.page.selectOption(
      '[aria-label="Which check or save to ask for"]',
      "skill:Perception",
    );
    const audience = await dm.page
      .locator('[aria-label="Who should roll"] option', {
        hasText: player.name,
      })
      .getAttribute("value");
    await dm.page.selectOption('[aria-label="Who should roll"]', audience);
    await dm.page.click('.dm-roll-call button[type="submit"]');
    await untilText(player.page, "Your DM asks for a");
    check(
      "the unaddressed player is not prompted",
      await healer.page.locator("text=Your DM asks for a").count(),
      0,
    );
    await player.page.click(".assign-prompt .btn-primary");
    await untilText(player.page, "You sent");
    await untilText(dm.page, "Perception");
    check("the answer reaches the seat", true, true);
    await dm.page.click("text=Clear all");

    // Healing, routed through the DM: the healer reports it, the DM approves,
    // and the *recipient* applies it to their own sheet.
    await setHp(player.page, 20);
    await healer.page.click('[aria-label="Roll Bless"]');
    await healer.page.selectOption('[aria-label="Who you are healing"]', {
      label: player.name,
    });
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

    // Death saves: on the wire once someone is down, DM always sees them,
    // the party by default until the DM hides them.
    await setHp(player.page, 0);
    await untilVisible(dm.page, ".dm-death-saves");
    await untilVisible(healer.page, ".initiative-death-saves");
    check("death saves reach the DM and the party", true, true);
    await dm.page.click('[aria-label="Party sees death saves"]');
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

  // The DM coming back to a table nobody else is sitting at — which is the
  // ordinary shape of "I closed the tab last Thursday", since a realm outlives
  // its occupants. Two things went wrong here, and they were one bug seen
  // twice: the encounter is stored per *browser* while a code names a *table*.
  // The seat came back only off a peer's state, and an empty room sends none,
  // so the lobby promised the DM controls and then seated them as a player;
  // and the next brand-new game opened straight onto the previous game's order.
  async dmreturn(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const first = await startGame(dm, [dm.name]);
    await untilRoster(dm.page, [dm.name]);

    // A closed tab, not a reload: the same browser (the DM token is durable in
    // localStorage) but a new page, and so a new client id — which is exactly
    // what the seat was still pointing at.
    const context = dm.page.context();
    await dm.page.close();
    dm.page = await context.newPage();
    await dm.page.goto(BASE, { waitUntil: "domcontentloaded" });

    await untilVisible(dm.page, "text=The game you're running");
    await dm.page.click("text=The game you're running");
    await untilVisible(dm.page, "text=Rejoin the table");
    await dm.page.click("text=Rejoin the table");
    await untilPath(dm.page, "/play");
    await untilVisible(dm.page, "text=Release DM seat");
    check("a table with nobody in it still hands the seat back", true, true);
    await untilRoster(dm.page, [dm.name]);
    check(
      "with what was brought to it",
      await roster(dm.page),
      [dm.name].sort(),
    );

    // A latecomer arriving at a table the DM has been sitting at alone. This
    // used to be a race: the "adopt the room's state" flag was armed by joining
    // and consumed by the room's reply, an empty room sends none, so it stayed
    // armed all evening ready to swallow the first thing the next arrival
    // published — their own participant, the moment it lands. Adoption is now
    // scoped to an answer addressed to a request this client sent, so an
    // ordinary broadcast cannot be adopted at all and the outcome below is the
    // only one available rather than the likely one.
    await joinGame(player, first, player.name);
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "a latecomer joins the DM's fight rather than replacing it",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    // Now start something else. The old fight is still in this browser's
    // storage, and it must not be what a new code opens onto.
    await dm.page.click("text=Leave");
    await dm.page.goto(BASE, { waitUntil: "domcontentloaded" });
    const second = await startGame(dm);
    await untilVisible(dm.page, "text=Release DM seat");
    check("a new table is a new table", await roster(dm.page), []);
    check("on a code of its own", second === first, false);

    return [dm, player];
  },

  // The invite link, end to end — and the escape hatch behind it. A DM hands
  // out one URL; what makes that URL worth pinning in a group chat is that the
  // same code can be reopened rather than reminted when the realm behind it is
  // gone (the sidecar restarts on every deploy, and realms don't survive that).
  async invite(browser) {
    const dm = await openClient(browser, "martial-fighter", "dm");
    const player = await openClient(browser, "full-caster-wizard", "player");

    const code = await startGame(dm, [dm.name]);

    // Straight to the URL: no code box, no storage question, no nav to find.
    await player.page.goto(`${BASE}/join/${code}`, {
      waitUntil: "domcontentloaded",
    });
    await untilVisible(player.page, ".lobby");
    check("an invite link lands in the lobby", true, true);
    await player.page
      .locator(".lobby-characters label", { hasText: player.name })
      .click();
    await player.page.click(".lobby-actions .btn-primary");
    await untilPath(player.page, "/play");
    await untilRoster(dm.page, [dm.name, player.name]);
    check(
      "joining by link seats you like any other joiner",
      await roster(dm.page),
      [dm.name, player.name].sort(),
    );

    // A code with no realm behind it. Seeded rather than produced by leaving,
    // because a realm outlives its occupants — only a sidecar restart clears
    // one, and that isn't a thing a smoke run should do to a shared box. Fresh
    // per run for the same reason: this scenario opens the code it claims is
    // unopened, so a fixed one is only unopened the first time.
    const stale = randomUUID();
    const staleLink = `${BASE}/join/${stale}`;

    // For a player it's a dead end, and says so without offering them a table
    // that isn't theirs to open.
    await player.page.goto(staleLink, { waitUntil: "domcontentloaded" });
    await untilText(player.page, "No session with that code is open");
    check("a dead link tells a player to ask their DM", true, true);
    check(
      "and doesn't offer them someone else's table",
      await player.page.locator("text=Open this table again").count(),
      0,
    );

    // For the browser that ran that table, it's next Thursday.
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
    await untilPath(dm.page, "/play");
    await untilVisible(dm.page, ".session-code code");
    const reopened = (
      await dm.page.locator(".session-code code").textContent()
    ).trim();
    check("reopening keeps the code the group already has", reopened, stale);

    // Which is the whole point: the link handed out before still works.
    await player.page.goto(staleLink, { waitUntil: "domcontentloaded" });
    await untilVisible(player.page, ".lobby");
    await player.page.click(".lobby-actions .btn-primary");
    await untilPath(player.page, "/play");
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
    // A scenario that threw never returned its clients, so the shots below
    // never happened — exactly when a picture is worth having. Shoot whatever
    // is still open instead, labelled by position rather than by role.
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
