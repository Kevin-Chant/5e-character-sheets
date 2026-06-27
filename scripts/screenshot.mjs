// Dev helper: render a route (optionally seeded with a fixture character) and
// save a PNG. Used for visual iteration on the UI.
//
//   node scripts/screenshot.mjs --fixture full-caster-wizard --open --out shot.png
//   node scripts/screenshot.mjs --route /settings --out settings.png
//   node scripts/screenshot.mjs --fixture multiclass --open --viewport 390x844
//
// Flags:
//   --fixture <name>   seed src/lib/fixtures/<name>.json into localStorage (local datastore)
//   --open             after seeding, click the character to open its sheet
//   --route <path>     route to visit (default "/")
//   --out <file>       output PNG path (default scratchpad-friendly ./screenshot.png)
//   --viewport WxH     viewport size (default 1280x900)
//   --no-full          capture only the viewport instead of the full page
//   --base <url>       dev server URL (default http://localhost:3000)

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
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });

  let character;
  if (fixtureName) {
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

  if (fixtureName && has("open")) {
    await page.getByText(character.name, { exact: false }).first().click();
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(400);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage });
  console.log(`Saved ${out} (${page.url()})`);

  await browser.close();
  if (devProc) devProc.kill();
})().catch((err) => {
  console.error(err);
  if (devProc) devProc.kill();
  process.exit(1);
});
