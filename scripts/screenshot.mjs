// Dev helper: render a route (optionally seeded with a fixture character) and
// save a PNG. Used for visual iteration on the UI.
//
//   node scripts/screenshot.mjs --fixture full-caster-wizard --open --out shot.png
//   node scripts/screenshot.mjs --route /settings --out settings.png
//   node scripts/screenshot.mjs --fixture multiclass --open --viewport 390x844
//
// Modal / interaction flows — run a sequence of steps before capturing:
//   node scripts/screenshot.mjs --fixture martial-fighter --open --no-full --seed 1 \
//     --steps '[{"click":"[aria-label=\"Roll Greatsword\"]"},{"click":"text=Roll"},{"wait":300}]'
//
// Flags:
//   --fixture <name>   seed src/lib/fixtures/<name>.json into localStorage (local datastore)
//   --open             after seeding, click the character to open its sheet
//   --route <path>     route to visit (default "/")
//   --out <file>       output PNG path (default scratchpad-friendly ./screenshot.png)
//   --viewport WxH     viewport size (default 1280x900)
//   --no-full          capture only the viewport instead of the full page (use for modals)
//   --base <url>       dev server URL (default http://localhost:3000)
//   --seed <int>       make Math.random deterministic (reproducible dice rolls)
//   --steps <json>     array of interaction steps run in order before capture
//   --steps-file <p>   same, read from a JSON file
//
// Step vocabulary (each object has exactly one action key):
//   {"click":"<selector>"}          Playwright selector — CSS, or text=/role= engine
//   {"fill":["<selector>","text"]}  type into an input
//   {"select":["<selector>","val"]} choose a <select> option (by value or label)
//   {"press":"<key>"}               keyboard press (e.g. "Enter", "Escape")
//   {"wait":300}                    wait N ms
//   {"wait":"<selector>"}           wait until the selector is visible
//
// Long multi-run flows (e.g. walking the level-up wizard many times):
//   --storage <file>   persist localStorage across runs: loaded before the page
//                      opens (when the file exists) and written back after the
//                      steps, so a flow can be driven in incremental batches.
//                      Takes precedence over --fixture when the file exists.
//   --dump <file>      after the steps, write the stored characters as JSON —
//                      lets a test diff the actual saved character instead of
//                      eyeballing pixels.

import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const fixtureName = flag("fixture");
const route = flag("route", "/");
const out = path.resolve(flag("out", "screenshot.png"));
const [w, h] = flag("viewport", "1280x900").split("x").map(Number);
const fullPage = !has("no-full");
const base = flag("base", "http://localhost:3000");
const seed = flag("seed");
// Emulate the OS colour-scheme preference so the app's `prefers-color-scheme`
// dark palette can be captured. `--theme dark` | `--theme light`; omit for system.
const theme = flag("theme");

const stepsFile = flag("steps-file");
const steps = JSON.parse(
  stepsFile
    ? fs.readFileSync(path.resolve(stepsFile), "utf8")
    : flag("steps", "[]"),
);

// Run one declarative step against the page. Kept small and explicit so a step
// list reads like the flow it performs.
async function runStep(page, step) {
  if (typeof step.click === "string") return page.click(step.click);
  if (Array.isArray(step.fill)) return page.fill(step.fill[0], step.fill[1]);
  if (Array.isArray(step.select))
    return page.selectOption(step.select[0], step.select[1]);
  if (typeof step.press === "string") return page.keyboard.press(step.press);
  if (typeof step.wait === "number") return page.waitForTimeout(step.wait);
  if (typeof step.wait === "string")
    return page.waitForSelector(step.wait, { state: "visible" });
  throw new Error(`Unrecognized step: ${JSON.stringify(step)}`);
}

const isUp = async (url) => {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
};

let devProc;
async function ensureServer() {
  if (await isUp(base)) return;
  console.log("Starting dev server…");
  devProc = spawn("pnpm", ["dev"], { cwd: ROOT, stdio: "ignore" });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await isUp(base)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("dev server did not come up within 30s");
}

(async () => {
  await ensureServer();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(theme === "dark" || theme === "light" ? { colorScheme: theme } : {}),
  });

  if (seed !== undefined) {
    // Deterministic Math.random (mulberry32) so dice rolls reproduce across runs.
    await ctx.addInitScript((seedValue) => {
      let a = seedValue >>> 0;
      Math.random = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, Number(seed));
  }

  const storageFile = flag("storage");
  let character;
  if (storageFile && fs.existsSync(path.resolve(storageFile))) {
    // Resume a persisted session: restore every localStorage key verbatim.
    const stored = JSON.parse(
      fs.readFileSync(path.resolve(storageFile), "utf8"),
    );
    await ctx.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, stored);
    const folder = stored["dndcharactersheets_characters"];
    if (folder) character = Object.values(JSON.parse(folder))[0];
  } else if (fixtureName) {
    const file = path.join(ROOT, "src/lib/fixtures", `${fixtureName}.json`);
    character = JSON.parse(fs.readFileSync(file, "utf8"));
    const folder = JSON.stringify({ [character.uuid]: character });
    await ctx.addInitScript((chars) => {
      localStorage.setItem("dndcharactersheets_characters", chars);
      localStorage.setItem("dndcharactersheets_lastDatastore", '"local"');
    }, folder);
  }

  const page = await ctx.newPage();
  await page.goto(base + route, { waitUntil: "networkidle" });

  if (character && has("open")) {
    await page.getByText(character.name, { exact: false }).first().click();
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(400);

  for (const [i, step] of steps.entries()) {
    try {
      await runStep(page, step);
    } catch (err) {
      throw new Error(
        `Step ${i} failed (${JSON.stringify(step)}): ${err.message}`,
      );
    }
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage });
  console.log(`Saved ${out} (${page.url()})`);

  if (storageFile) {
    const entries = await page.evaluate(() => {
      const all = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        all[k] = localStorage.getItem(k);
      }
      return all;
    });
    fs.writeFileSync(path.resolve(storageFile), JSON.stringify(entries));
    console.log(`Storage saved to ${storageFile}`);
  }
  const dumpFile = flag("dump");
  if (dumpFile) {
    const folder = await page.evaluate(() =>
      localStorage.getItem("dndcharactersheets_characters"),
    );
    fs.writeFileSync(
      path.resolve(dumpFile),
      JSON.stringify(JSON.parse(folder ?? "{}"), null, 2),
    );
    console.log(`Characters dumped to ${dumpFile}`);
  }

  await browser.close();
  if (devProc) devProc.kill();
})().catch((err) => {
  console.error(err);
  if (devProc) devProc.kill();
  process.exit(1);
});
